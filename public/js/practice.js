import {
    splitIntoLines,
    calculateTotalDisplayLength,
    getDisplayLineAndOffset,
} from './textUtils.js';
import {
    calculateWPM,
    calculateAccuracy,
    calculateCompletionPercentage,
} from './statsUtils.js';
import {
    applyEffect,
    renderCustomInput,
    updateCursorPosition,
} from './domUtils.js';
import saveProgressToServer from './apiUtils.js';

// This script runs after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    // Line width will be calculated dynamically based on container size and font

    // --- DOM Element References ---
    const lineContainer = document.getElementById('current-line-container');
    const lineDisplay = document.getElementById('current-line-display');
    const typingInputArea = document.getElementById('typing-input-area'); // New container ID
    const typingInputContent = document.getElementById('typing-input-content');
    const typingCursor = document.getElementById('typing-cursor');
    const wpmElement = document.getElementById('wpm');
    const accuracyElement = document.getElementById('accuracy');
    const errorsElement = document.getElementById('errors');
    const timerElement = document.getElementById('timer');
    const completionElement = document.getElementById('completion'); // Added completion element
    const resetButton = document.getElementById('reset-button');
    const saveButton = document.getElementById('save-button'); // Get save button
    const resultsContainer = document.getElementById('results'); // For completion styling

    // --- Audio Elements ---
    // Note: Ensure these sound files exist in the specified paths (e.g., public/sounds/)
    const correctSound = new Audio('/sounds/correct.wav');
    const incorrectSound = new Audio('/sounds/incorrect.wav');
    const lineCompleteSound = new Audio('/sounds/line-complete.wav');
    // Preload sounds (optional, can improve responsiveness)
    correctSound.load();
    incorrectSound.load();
    lineCompleteSound.load();

    // --- Initial Check ---
    // Update check for new elements
    if (
        !lineContainer ||
        !lineDisplay ||
        !typingInputArea ||
        !typingInputContent ||
        !typingCursor ||
        !resetButton ||
        !saveButton ||
        !completionElement ||
        !resultsContainer ||
        !wpmElement ||
        !accuracyElement ||
        !errorsElement ||
        !timerElement
    ) {
        console.error(
            'Required elements not found for practice script. Aborting.'
        );
        return;
    }

    // --- Custom Input State ---
    let hiddenInput = null; // Reference to the hidden input field
    let currentInputValue = ''; // Internal state of the custom input
    let isCustomInputFocused = false;

    // --- State Variables ---
    const fullText = lineContainer.dataset.textContent || ''; // Original text from server
    const textId = lineContainer.dataset.textId || null;
    const initialProgressIndex = parseInt(
        lineContainer.dataset.progressIndex || '0',
        10
    ); // Saved progress index (relative to display structure)

    let lines = []; // Array of strings representing display lines
    let totalDisplayLength = 0; // Total length of concatenated display lines + separators
    let currentDisplayLineIndex = 0; // Index in the 'lines' array
    let currentOverallCharIndex = 0; // Index relative to the display structure (concatenated lines + spaces)
    let currentCharSpans = []; // Spans for the current display line

    let timer;
    let startTime;
    let totalErrors = 0; // Needs better tracking across lines
    let totalTypedChars = 0; // Correctly typed chars across lines
    let totalTypedEntries = 0; // All key presses (approx)
    let timerRunning = false;
    let timeElapsed = 0; // Keep track of elapsed time

    // --- Timer Functions ---
    function startTimer() {
        if (!timerRunning && currentDisplayLineIndex < lines.length) {
            startTime = startTime || new Date(); // Use existing start time if resuming
            timerRunning = true;
            timer = setInterval(updateTimerDisplay, 500); // Use dedicated update function
            console.log('Timer started/resumed');
        }
    }

    function stopTimer() {
        clearInterval(timer);
        timerRunning = false;
        console.log('Timer stopped');
    }

    function updateTimerDisplay() {
        if (!startTime) return;
        const currentTime = new Date();
        timeElapsed = Math.floor((currentTime - startTime) / 1000); // Update shared timeElapsed
        timerElement.textContent = timeElapsed;
        // Update WPM display periodically
        wpmElement.textContent = calculateWPM(totalTypedChars, timeElapsed);
    }

    // --- Core Rendering & Logic ---

    /**
     * Renders a specific line from the `lines` array into the display area.
     * @param {number} lineIndex - The index of the line to render.
     */
    function renderLine(lineIndex) {
        console.log(`[Debug] renderLine called with index: ${lineIndex}`); // DEBUG LOG
        if (lineIndex >= lines.length) {
            lineDisplay.innerHTML =
                '<span class="correct">Text Complete!</span>';
            stopTimer();
            if (resultsContainer) resultsContainer.classList.add('completed');
            currentOverallCharIndex = totalDisplayLength; // Ensure index is at max on completion
            updateStats(); // Update completion and other stats when text is finished
            console.log('Text completed!');
            // Optionally save progress automatically on completion
            // if (textId) saveProgressToServer(textId, currentOverallCharIndex, saveButton);
            return;
        }
        const lineText = lines[lineIndex];
        console.log(`[Debug] Rendering line text: "${lineText}"`); // DEBUG LOG
        lineDisplay.innerHTML = '';
        currentCharSpans = [];
        for (let i = 0; i < lineText.length; i++) {
            const char = lineText[i];
            const span = document.createElement('span');
            span.textContent = char;
            if (char === ' ') {
                span.classList.add('space-char'); // Optional: special style for spaces
            }
            lineDisplay.appendChild(span);
            currentCharSpans.push(span);
        }
        // Clear custom input state for the new line
        currentInputValue = '';
        if (hiddenInput) hiddenInput.value = ''; // Clear hidden input too
        renderCustomInput('', typingInputContent); // Clear visual spans using imported function
        updateCursorPosition(
            typingCursor,
            typingInputArea,
            typingInputContent,
            isCustomInputFocused
        ); // Update cursor using imported function

        // Focus the hidden input to capture keys
        focusHiddenInput();
    }

    /**
     * Updates all displayed statistics (WPM, Accuracy, Errors, Completion).
     */
    function updateStats() {
        // WPM is updated periodically by updateTimerDisplay, but calculate final here too
        wpmElement.textContent = calculateWPM(totalTypedChars, timeElapsed);
        accuracyElement.textContent = calculateAccuracy(
            totalTypedEntries,
            totalErrors
        );
        errorsElement.textContent = totalErrors;
        completionElement.textContent = calculateCompletionPercentage(
            currentOverallCharIndex,
            totalDisplayLength,
            fullText
        );
    }

    // --- Input Handling ---

    /**
     * Handles keydown events for special keys like Backspace.
     * Currently minimal, could be expanded.
     */
    function handleKeyDown(event) {
        // console.log('Keydown:', event.key);
        // Prevent default browser behavior for keys we might handle manually later (like arrows)
        // if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        //     event.preventDefault();
        // }
    }

    /**
     * Creates a hidden input field to capture keyboard events.
     */
    function createHiddenInput() {
        hiddenInput = document.createElement('input');
        hiddenInput.type = 'text';
        hiddenInput.style.position = 'absolute';
        hiddenInput.style.opacity = '0';
        hiddenInput.style.pointerEvents = 'none';
        hiddenInput.style.left = '-9999px'; // Move off-screen
        hiddenInput.style.top = '-9999px';
        hiddenInput.setAttribute('autocomplete', 'off');
        hiddenInput.setAttribute('autocorrect', 'off');
        hiddenInput.setAttribute('autocapitalize', 'off');
        hiddenInput.setAttribute('spellcheck', 'false');
        hiddenInput.setAttribute('tabindex', '-1'); // Not reachable via tab

        document.body.appendChild(hiddenInput);

        // --- Main Input Logic ---
        hiddenInput.addEventListener('input', handleHiddenInput);
        hiddenInput.addEventListener('keydown', handleKeyDown);

        // Focus/Blur handling for the *visible* container
        typingInputArea.addEventListener('click', focusHiddenInput);
        hiddenInput.addEventListener('focus', () => {
            isCustomInputFocused = true;
            typingInputArea.classList.add('focused');
            updateCursorPosition(
                typingCursor,
                typingInputArea,
                typingInputContent,
                isCustomInputFocused
            ); // Use imported function
        });
        hiddenInput.addEventListener('blur', () => {
            isCustomInputFocused = false;
            typingInputArea.classList.remove('focused');
            if (typingCursor) typingCursor.style.opacity = '0'; // Hide cursor on blur
        });
    }

    /**
     * Focuses the hidden input field.
     */
    function focusHiddenInput() {
        if (hiddenInput && document.activeElement !== hiddenInput) {
            hiddenInput.focus();
        }
    }

    /**
     * Handles input events from the hidden input field (core typing logic).
     */
    function handleHiddenInput() {
        if (!hiddenInput) return;
        const previousInputValue = currentInputValue;
        currentInputValue = hiddenInput.value;

        if (!timerRunning && currentDisplayLineIndex < lines.length) {
            startTimer();
        }

        // Update visual representation
        renderCustomInput(currentInputValue, typingInputContent); // Use imported function
        updateCursorPosition(
            typingCursor,
            typingInputArea,
            typingInputContent,
            isCustomInputFocused
        ); // Use imported function

        // --- Practice Logic ---
        const currentLineText = lines[currentDisplayLineIndex] || '';
        const inputLength = currentInputValue.length;
        let lineCorrect = true;
        let currentLineErrors = 0; // Track errors *within* this input event for accuracy calc

        totalTypedEntries++; // Increment for each input event (approximation)

        let lastCharCorrect = false;
        let correctLength = 0; // Length of correct prefix in current input

        // --- Character Comparison and Styling ---
        currentCharSpans.forEach((charSpan, index) => {
            const expectedChar = charSpan.textContent;
            if (index < inputLength) {
                const typedChar = currentInputValue[index];
                const isCorrect = typedChar === expectedChar;

                // Only count new errors
                const wasPreviouslyIncorrect =
                    charSpan.classList.contains('incorrect');
                if (!isCorrect && !wasPreviouslyIncorrect) {
                    currentLineErrors++;
                    incorrectSound
                        .play()
                        .catch((e) => console.log('Sound play interrupted')); // Play error sound
                } else if (isCorrect && wasPreviouslyIncorrect) {
                    // Correcting a previous error - don't decrement totalErrors here,
                    // but accuracy calculation handles it implicitly.
                }

                charSpan.classList.toggle('correct', isCorrect);
                charSpan.classList.toggle('incorrect', !isCorrect);

                if (isCorrect && lineCorrect) {
                    correctLength = index + 1;
                } else {
                    lineCorrect = false; // Mark line as incorrect if any mismatch found
                }
                if (index === inputLength - 1) lastCharCorrect = isCorrect; // Check last typed char
            } else {
                // Characters not yet typed
                charSpan.classList.remove(
                    'correct',
                    'incorrect',
                    'effect-correct',
                    'effect-incorrect'
                );
                lineCorrect = false; // Line isn't fully correct yet
            }
        });

        // Update total errors based on errors found in this specific input event
        totalErrors += currentLineErrors;

        // --- Sound and Effect for Last Character ---
        if (inputLength > 0 && inputLength <= currentCharSpans.length) {
            const lastCharSpan = currentCharSpans[inputLength - 1];
            if (lastCharCorrect) {
                // Play sound only if the input length increased (actual new correct char)
                if (currentInputValue.length > previousInputValue.length) {
                    correctSound
                        .play()
                        .catch((e) => console.log('Sound play interrupted'));
                    applyEffect(lastCharSpan, 'effect-correct'); // Use imported function
                }
                // Increment totalTypedChars only for newly typed correct characters
                if (
                    correctLength >
                    totalTypedChars -
                        calculateStartIndexForLine(currentDisplayLineIndex)
                ) {
                    totalTypedChars =
                        calculateStartIndexForLine(currentDisplayLineIndex) +
                        correctLength;
                }
            } else {
                // Error sound is played during the loop now
                applyEffect(lastCharSpan, 'effect-incorrect'); // Use imported function
            }
        } else if (inputLength > currentCharSpans.length) {
            // Typed past the end of the line - treat as error
            incorrectSound
                .play()
                .catch((e) => console.log('Sound play interrupted'));
            totalErrors++; // Increment error count for extra characters
            // Optionally provide visual feedback for extra chars?
        }

        // --- Update Overall Progress Index ---
        // Base index for the current line + length of the correct prefix
        currentOverallCharIndex =
            calculateStartIndexForLine(currentDisplayLineIndex) + correctLength;

        // --- Check for Line Completion ---
        if (
            lineCorrect &&
            inputLength === currentLineText.length &&
            currentLineText.length > 0
        ) {
            console.log(`Line ${currentDisplayLineIndex} complete.`);
            lineCompleteSound
                .play()
                .catch((e) => console.log('Sound play interrupted'));
            currentDisplayLineIndex++;
            // Add 1 to overall index for the implicit space/newline between lines
            if (currentDisplayLineIndex < lines.length) {
                currentOverallCharIndex++;
            }
            renderLine(currentDisplayLineIndex); // Render next line
        }

        // Update displayed stats after processing input
        updateStats();
    }

    /**
     * Calculates the starting overall index for a given display line index.
     * @param {number} lineIndex - The index of the display line.
     * @returns {number} - The starting overall character index.
     */
    function calculateStartIndexForLine(lineIndex) {
        let startIndex = 0;
        for (let i = 0; i < lineIndex; i++) {
            startIndex += lines[i].length + 1; // Add 1 for the separator
        }
        return startIndex;
    }

    // --- Initialization and Reset ---

    /**
     * Resets the practice area to its initial state or saved progress.
     * @param {boolean} [startFromSaved=false] - If true, starts from the saved progress index.
     */
    function resetPractice(startFromSaved = false) {
        console.log(`Resetting practice. Start from saved: ${startFromSaved}`);
        stopTimer();
        timer = null;
        startTime = null;
        timerRunning = false;
        timeElapsed = 0; // Reset elapsed time

        // --- Direct Measurement Width Calculation ---
        const containerWidth = lineDisplay.clientWidth; // Inner width of the display area
        let targetWidth = 60; // Default fallback

        if (containerWidth > 0) {
            const tempSpan = document.createElement('span');
            const displayStyle = window.getComputedStyle(lineDisplay);
            tempSpan.style.fontFamily = displayStyle.fontFamily;
            tempSpan.style.fontSize = displayStyle.fontSize;
            tempSpan.style.position = 'absolute';
            tempSpan.style.visibility = 'hidden';
            tempSpan.style.whiteSpace = 'nowrap'; // Crucial for measurement
            document.body.appendChild(tempSpan);

            let charCount = 0;
            // Use 'm' as a generally wide character for measurement
            const testChar = 'm';
            try {
                // Add characters one by one until width exceeds the raw container width
                while (tempSpan.offsetWidth <= containerWidth) {
                    charCount++;
                    tempSpan.textContent = testChar.repeat(charCount);
                    // Safety break for very narrow containers or infinite loops
                    if (charCount > 1000) {
                        console.warn(
                            'Width calculation safety break triggered.'
                        );
                        break;
                    }
                }
                // The target width is the count *before* it exceeded the container width
                // Subtract a character buffer to prevent lines being too long
                const charBuffer = 12; // Increasing buffer significantly for safety margin
                targetWidth = Math.max(1, charCount - 1 - charBuffer); // Ensure at least 1

                console.log(
                    `Direct Measurement: Container: ${containerWidth}px, Chars ('${testChar}') fit before buffer: ${charCount - 1}, Final Target Width: ${targetWidth}`
                );
            } catch (e) {
                console.error('Error during direct width measurement:', e);
                // Keep default targetWidth
            } finally {
                document.body.removeChild(tempSpan); // Clean up the temporary span
            }

            targetWidth = Math.max(20, targetWidth); // Ensure minimum width of 20
        } else {
            console.warn(
                `Container clientWidth is 0. Using default targetWidth: ${targetWidth}`
            );
        }
        console.log(`[Debug] Calculated targetWidth: ${targetWidth}`); // DEBUG LOG

        lines = splitIntoLines(fullText, targetWidth); // Use imported function
        console.log(`[Debug] Generated lines array (length ${lines.length}):`, lines); // DEBUG LOG
        totalDisplayLength = calculateTotalDisplayLength(lines); // Use imported function

        // Determine starting point
        let startingOverallIndex = 0;
        if (
            startFromSaved &&
            initialProgressIndex > 0 &&
            initialProgressIndex < totalDisplayLength
        ) {
            startingOverallIndex = initialProgressIndex;
            console.log(
                `Starting from saved progress index: ${startingOverallIndex}`
            );
        } else {
            console.log('Starting from the beginning.');
        }

        // Find the line and offset for the starting index
        const { lineIndex: startLine, charOffset: startOffset } =
            getDisplayLineAndOffset(startingOverallIndex, lines); // Use imported function

        currentDisplayLineIndex = startLine;
        currentOverallCharIndex = startingOverallIndex;

        // Reset stats based on starting point (more complex if resuming mid-text)
        // For simplicity, resetting all stats on any reset for now.
        // A more advanced implementation would recalculate stats based on the resumed portion.
        totalErrors = 0;
        totalTypedChars = 0; // Resetting this assumes we are not tracking chars before the resume point
        totalTypedEntries = 0;

        // Render the starting line
        renderLine(currentDisplayLineIndex);

        // If starting mid-line (offset > 0), pre-fill input and style characters?
        // This adds complexity. For now, always start a line fresh.
        if (startOffset > 0) {
            console.warn(
                `Starting offset ${startOffset} detected, but currently starting line fresh.`
            );
            // To implement resume mid-line:
            // 1. Set `currentInputValue` to `lines[startLine].substring(0, startOffset)`
            // 2. Call `renderCustomInput` with this value.
            // 3. Loop through `currentCharSpans` up to `startOffset` and mark them as 'correct'.
            // 4. Adjust `totalTypedChars` and potentially `totalTypedEntries`.
            currentOverallCharIndex = calculateStartIndexForLine(startLine); // Reset index to start of line if starting fresh
        }

        // Reset visual state
        if (resultsContainer) resultsContainer.classList.remove('completed');
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.classList.remove('saved');
            saveButton.textContent = 'Save Progress';
        }

        // Update initial stats display
        updateStats();

        // Ensure hidden input exists and is focused
        if (!hiddenInput) {
            createHiddenInput();
        }
        focusHiddenInput();
    }

    // --- Event Listeners ---
    resetButton.addEventListener('click', () => resetPractice(false)); // Reset to beginning
    if (saveButton) {
        saveButton.addEventListener('click', () => {
            if (textId) {
                // Save the *current* overall index
                saveProgressToServer(
                    textId,
                    currentOverallCharIndex,
                    saveButton
                ); // Use imported function
            } else {
                console.warn('Cannot save progress: Text ID is missing.');
                alert('Cannot save progress: Text ID not found.');
            }
        });
    }

    // --- Listener for the Save and Profile Link ---
    const saveAndProfileLink = document.getElementById('save-and-profile-link');
    if (saveAndProfileLink) {
        saveAndProfileLink.addEventListener('click', async (event) => {
            event.preventDefault(); // Prevent default navigation
            console.log('Save and profile link clicked.');

            if (textId) {
                // Indicate saving is in progress
                // const originalText = saveAndProfileLink.textContent; // Unused variable
                saveAndProfileLink.textContent = 'Saving...';
                saveAndProfileLink.style.pointerEvents = 'none'; // Prevent double clicks

                try {
                    // Call the save function, wait for it to complete
                    // Pass null for the button element as we handle feedback differently here
                    await saveProgressToServer(
                        textId,
                        currentOverallCharIndex,
                        null
                    );
                    console.log('Save attempt finished.');
                } catch (error) {
                    // This catch block might not be strictly necessary if saveProgressToServer handles all errors internally
                    console.error(
                        'Unexpected error during saveProgressToServer call:',
                        error
                    );
                    // Alert or specific handling if saveProgressToServer *can* throw unexpected errors
                } finally {
                    // Redirect regardless of save success/failure, after the attempt is done
                    console.log('Redirecting to profile...');
                    window.location.href = saveAndProfileLink.href; // Use the link's actual href
                }
            } else {
                console.warn(
                    'Cannot save progress: Text ID is missing. Navigating directly.'
                );
                window.location.href = saveAndProfileLink.href; // Navigate directly if no textId
            }
        });
    } else {
        console.warn('Save and profile link element not found.');
    }

    // --- Initial Setup ---
    resetPractice(true); // Initialize the practice area, attempting to start from saved progress
    // --- Debounce Utility ---
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // --- Resize Handling ---
    // Store the current overall index before recalculating layout
    let indexBeforeResize = 0;
    const handleResize = debounce(() => {
        console.log('Window resized, recalculating layout...');
        indexBeforeResize = currentOverallCharIndex; // Store current progress index

        // Recalculate width and re-split lines (resetPractice does this)
        // Pass 'false' to force recalculation from index 0 based on new width.
        // We will restore the actual position afterwards.
        resetPractice(false);

        // After resetPractice calculates lines, restore the user's position
        // Find the new line/offset for the stored index
        const { lineIndex: newLine, charOffset: newOffset } =
            getDisplayLineAndOffset(indexBeforeResize, lines);

        // Update state and render the correct line
        currentDisplayLineIndex = newLine;
        currentOverallCharIndex = indexBeforeResize; // Restore the exact index
        renderLine(currentDisplayLineIndex);

        // If the user was mid-line, restore their input and cursor position
        // (This part is complex and might need further refinement depending on desired UX)
        // For now, we just render the correct line, starting fresh.
        // If newOffset > 0, we could potentially restore input:
        // currentInputValue = lines[newLine].substring(0, newOffset);
        // renderCustomInput(currentInputValue, typingInputContent);
        // updateCursorPosition(...);
        // Mark previous characters as correct...

        console.log(
            `Restored position to overall index: ${currentOverallCharIndex} (Line: ${newLine}, Offset: ${newOffset})`
        );
        updateStats(); // Update completion percentage based on restored index
    }, 250); // Debounce resize events by 250ms

    window.addEventListener('resize', handleResize);
}); // End DOMContentLoaded
