// This script runs after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    // Line width will be calculated dynamically based on container size and font

    // --- DOM Element References ---
    const lineContainer = document.getElementById('current-line-container');
    const lineDisplay = document.getElementById('current-line-display');
    // Updated references for custom input
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
    if (!lineContainer || !lineDisplay || !typingInputArea || !typingInputContent || !typingCursor || !resetButton || !saveButton || !completionElement) {
        console.error("Required elements not found for practice script (custom input). Aborting.");
        return;
    }

    // --- Custom Input State ---
    let hiddenInput = null; // Reference to the hidden input field
    let currentInputValue = ''; // Internal state of the custom input
    let isCustomInputFocused = false;


    // --- State Variables ---
    const fullText = lineContainer.dataset.textContent || ''; // Original text from server
    const textId = lineContainer.dataset.textId || null;
    const initialProgressIndex = parseInt(lineContainer.dataset.progressIndex || '0', 10); // Saved progress index (relative to display structure)

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

    // --- Helper & Initialization Functions ---

    /**
     * Applies a short visual effect (like a flash) to a target span.
     * @param {HTMLElement} targetSpan - The span element to apply the effect to.
     * @param {string} effectClass - The CSS class defining the effect (e.g., 'effect-correct').
     */
    const applyEffect = (targetSpan, effectClass) => {
        if (!targetSpan) return;
        targetSpan.classList.remove('effect-correct', 'effect-incorrect');
        // Force reflow to restart animation if class is re-added quickly
        void targetSpan.offsetWidth;
        targetSpan.classList.add(effectClass);
        // Use animationend event for cleanup
        targetSpan.addEventListener('animationend', () => {
            targetSpan.classList.remove(effectClass);
        }, { once: true });
    };

    /**
     * Splits the original text into lines suitable for display, applying word wrapping.
     * @param {string} text - The original full text.
     * @param {number} targetWidth - The desired maximum line width.
     * @returns {string[]} - An array of strings, each representing a line for display.
     */
    function splitIntoLines(text, targetWidth) {
        const originalLines = text.split('\n'); // 1. Split by original newlines first
        const generatedLines = [];
        console.log(`Original text has ${originalLines.length} lines based on '\\n'.`);

        originalLines.forEach(originalLine => {
            const trimmedLine = originalLine.trim();

            if (trimmedLine === '') {
                if (generatedLines.length > 0) { // Avoid leading empty lines
                   generatedLines.push('');
                }
                return;
            }

            if (trimmedLine.length <= targetWidth) {
                generatedLines.push(trimmedLine);
            } else {
                const words = trimmedLine.split(/\s+/);
                let currentWrappedLine = '';

                words.forEach(word => {
                    if (word === '') return;

                    // Check if the word itself is too long
                    if (word.length > targetWidth) {
                        // If there's content in the current line, push it first
                        if (currentWrappedLine !== '') {
                            generatedLines.push(currentWrappedLine);
                            currentWrappedLine = '';
                        }
                        // Force break the long word
                        for (let i = 0; i < word.length; i += targetWidth) {
                            generatedLines.push(word.substring(i, i + targetWidth));
                        }
                    } else {
                        // Word is not too long, proceed with normal wrapping
                        if (currentWrappedLine === '') {
                            currentWrappedLine = word;
                        } else if (currentWrappedLine.length + 1 + word.length <= targetWidth) {
                            currentWrappedLine += ' ' + word;
                        } else {
                            generatedLines.push(currentWrappedLine);
                            currentWrappedLine = word;
                        }
                    }
                });
                if (currentWrappedLine !== '') {
                    generatedLines.push(currentWrappedLine);
                }
            }
        });

        if (text.length > 0 && generatedLines.length === 0) {
             generatedLines.push(''); // Ensure at least one line if input wasn't empty
        }

        console.log(`Split text into ${generatedLines.length} final display lines.`);
        return generatedLines;
    }

    /**
     * Calculates the total length of the display structure (lines concatenated with single spaces).
     * @param {string[]} displayLines - The array of display lines.
     * @returns {number} - The total length.
     */
    function calculateTotalDisplayLength(displayLines) {
        if (!displayLines || displayLines.length === 0) {
            return 0;
        }
        // Sum of lengths of all lines + number of separators (length - 1)
        const totalChars = displayLines.reduce((sum, line) => sum + line.length, 0);
        const totalSeparators = displayLines.length - 1;
        return totalChars + totalSeparators;
    }

    /**
     * Renders a specific line from the `lines` array into the display area.
     * @param {number} lineIndex - The index of the line to render.
     */
    function renderLine(lineIndex) {
        if (lineIndex >= lines.length) {
            lineDisplay.innerHTML = '<span class="correct">Text Complete!</span>';
            stopTimer();
            document.getElementById('results').classList.add('completed');
            currentOverallCharIndex = totalDisplayLength; // Ensure index is at max on completion
            updateCompletionPercentage(); // Update completion when text is finished
            console.log("Text completed!");
            // Optionally save progress automatically on completion
            // saveProgressToServer();
            return;
        }
        const lineText = lines[lineIndex];
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
        renderCustomInput(''); // Clear visual spans
        updateCursorPosition();

        // Focus the hidden input to capture keys
        focusHiddenInput();
    }

    /**
     * Determines the display line index and character offset within that line
     * corresponding to a given overall index in the display structure.
     * @param {number} targetIndex - The overall index in the display structure.
     * @returns {{lineIndex: number, charOffset: number}}
     */
    function getDisplayLineAndOffset(targetIndex) {
        let cumulativeLength = 0;
        for (let i = 0; i < lines.length; i++) {
            const lineLength = lines[i].length;
            // Separator length is 1 if not the last line
            const separatorLength = (i < lines.length - 1) ? 1 : 0;

            // Check if targetIndex falls within the current line's text span
            if (targetIndex < cumulativeLength + lineLength) {
                return { lineIndex: i, charOffset: targetIndex - cumulativeLength };
            }
            // Check if targetIndex falls exactly on the separator after this line
            if (separatorLength > 0 && targetIndex === cumulativeLength + lineLength) {
                 // Treat as the start of the next line
                return { lineIndex: i + 1, charOffset: 0 };
            }

            cumulativeLength += lineLength + separatorLength;
        }
        // If index is beyond the end, return end of the last line
        const lastLineIndex = Math.max(0, lines.length - 1);
        const lastLineLength = lines[lastLineIndex]?.length || 0;
        return { lineIndex: lastLineIndex, charOffset: lastLineLength };
    }


    // --- Timer and Statistics Functions ---
    function startTimer() {
        if (!timerRunning && currentDisplayLineIndex < lines.length) {
            startTime = startTime || new Date(); // Use existing start time if resuming
            timerRunning = true;
            timer = setInterval(updateTimer, 500);
            console.log("Timer started/resumed");
        }
    }

    function stopTimer() {
        clearInterval(timer);
        timerRunning = false;
        console.log("Timer stopped");
    }

    function updateTimer() {
        if (!startTime) return;
        const currentTime = new Date();
        const timeElapsed = Math.floor((currentTime - startTime) / 1000);
        timerElement.textContent = timeElapsed;
        calculateWPM(timeElapsed);
    }

    function calculateWPM(timeElapsed) {
        if (timeElapsed === 0 || totalTypedChars === 0) {
            wpmElement.textContent = 0;
            return;
        }
        // WPM is based on 5-character "words"
        const wordsTyped = totalTypedChars / 5;
        const timeInMinutes = timeElapsed / 60;
        const wpm = Math.round(wordsTyped / timeInMinutes);
        wpmElement.textContent = wpm;
    }

    function calculateAccuracy() {
        if (totalTypedEntries === 0) {
            accuracyElement.textContent = 100;
            return;
        }
        // Accuracy based on total inputs vs errors
        const correctChars = Math.max(0, totalTypedEntries - totalErrors);
        const accuracy = Math.round((correctChars / totalTypedEntries) * 100);
        accuracyElement.textContent = accuracy;
    }

    function updateCompletionPercentage() {
        if (!completionElement) return; // Guard clause

        let percentage = 0;
        // Use the total length of the display structure
        const currentIndex = Math.min(currentOverallCharIndex, totalDisplayLength);

        if (totalDisplayLength > 0) {
            percentage = Math.round((currentIndex / totalDisplayLength) * 100);
        } else {
            // If the text is effectively empty after processing
            percentage = (fullText.trim() === '') ? 100 : 0;
        }
        completionElement.textContent = Math.min(percentage, 100); // Cap at 100%
    }

    /**
     * Handles keydown events for special keys like Backspace.
     */
    function handleKeyDown(event) {
        // We might need this later for more complex handling (e.g., cursor movement)
        // For now, the 'input' event handles basic typing and backspace value changes.
        // console.log('Keydown:', event.key);

        // Prevent default browser behavior for keys we might handle manually later (like arrows)
        // if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        //     event.preventDefault();
        //     // Add custom cursor movement logic here if needed
        // }
    }

    /**
     * Renders the text into the custom input container using spans.
     * @param {string} text - The text to render.
     */
    function renderCustomInput(text) {
        if (!typingInputContent) return; // Guard clause
        typingInputContent.innerHTML = ''; // Clear previous content
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const span = document.createElement('span');
            // Use textContent for safety, but innerHTML needed for space representation
            if (char === ' ') {
                // Represent space with a non-breaking space or style differently
                span.innerHTML = '&nbsp;';
                span.style.minWidth = '0.25em'; // Ensure space takes width
            } else {
                span.textContent = char;
            }
            typingInputContent.appendChild(span);
        }
        // Update cursor position after rendering
        updateCursorPosition();
    }

    /**
     * Updates the position of the blinking cursor.
     */
    function updateCursorPosition() {
        if (!typingCursor || !typingInputArea || !typingInputContent) return; // Guard clauses

        if (!isCustomInputFocused) {
            typingCursor.style.opacity = '0'; // Hide cursor if not focused
            return;
        }
        // Ensure cursor is potentially visible (blink animation handles actual visibility)
        typingCursor.style.opacity = '1';

        const spans = typingInputContent.querySelectorAll('span');
        let lastSpan = spans.length > 0 ? spans[spans.length - 1] : null;
        // Use content div for positioning and padding calculation
        const contentStyle = getComputedStyle(typingInputContent);
        const contentRect = typingInputContent.getBoundingClientRect();
        const containerRect = typingInputArea.getBoundingClientRect(); // Still need container for offset calculation

        // Start cursor based on content div's padding
        let cursorLeft = parseFloat(contentStyle.paddingLeft);
        let cursorTop = parseFloat(contentStyle.paddingTop);

        if (lastSpan) {
            // Position after the last character span
            const lastSpanRect = lastSpan.getBoundingClientRect();
            // Calculate position relative to the *content* div's top-left corner
            cursorLeft = lastSpanRect.right - contentRect.left;
            cursorTop = lastSpanRect.top - contentRect.top;

             // Basic wrap detection: If last span's right edge is close to container's right edge,
             // assume cursor should be on the next line. This is approximate.
             // Use content div's width and padding for threshold calculation
             const rightThreshold = contentRect.width - parseFloat(contentStyle.paddingRight) - 10; // 10px buffer
             if(lastSpanRect.right - contentRect.left > rightThreshold && spans.length > 0) { // Check spans.length > 0
                 cursorLeft = parseFloat(contentStyle.paddingLeft); // Move to start of next line (relative to content div)
                 cursorTop += lastSpanRect.height; // Move down one line height (approx)
             }

        }
        // else: cursor stays at padding top/left

        // Apply calculated position relative to the *container* div (#typing-input-area)
        // The cursor is a sibling of the content div, so its left/top are relative to the container.
        // We calculated cursorLeft/Top relative to the content div, now adjust for the content div's offset.
        const contentOffsetX = contentRect.left - containerRect.left;
        const contentOffsetY = contentRect.top - containerRect.top;

        let finalCursorLeft = contentOffsetX + cursorLeft;
        let finalCursorTop = contentOffsetY + cursorTop;


        // Bounds check relative to the container
        const containerStyle = getComputedStyle(typingInputArea); // Get container style for bounds check
        const maxLeft = containerRect.width - parseFloat(containerStyle.paddingRight) - typingCursor.offsetWidth; // Adjust for cursor width
        const maxTop = containerRect.height - parseFloat(containerStyle.paddingBottom) - typingCursor.offsetHeight;

        typingCursor.style.left = `${Math.min(finalCursorLeft, maxLeft)}px`;
        typingCursor.style.top = `${Math.min(finalCursorTop, maxTop)}px`;
    }


    // --- Custom Input Event Handling ---

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

        // Append it to the body or a container
        document.body.appendChild(hiddenInput);

        // --- Main Input Logic ---
        hiddenInput.addEventListener('input', handleHiddenInput);
        hiddenInput.addEventListener('keydown', handleKeyDown); // For backspace etc.

        // Focus/Blur handling for the *visible* container
        typingInputArea.addEventListener('click', focusHiddenInput); // Use new container ID
        hiddenInput.addEventListener('focus', () => {
            isCustomInputFocused = true;
            typingInputArea.classList.add('focused'); // Use new container ID
            updateCursorPosition(); // Ensure cursor is visible and positioned
        });
        hiddenInput.addEventListener('blur', () => {
            isCustomInputFocused = false;
            typingInputArea.classList.remove('focused'); // Use new container ID
            // Optionally hide cursor explicitly on blur
             if (typingCursor) typingCursor.style.opacity = '0';
        });
    }

    /**
     * Focuses the hidden input field.
     */
    function focusHiddenInput() {
        if (hiddenInput && document.activeElement !== hiddenInput) {
             // Only focus if not already focused to avoid potential issues
            hiddenInput.focus();
        }
    }

    /**
     * Handles input events from the hidden input field.
     */
    function handleHiddenInput() {
        if (!hiddenInput) return;
        currentInputValue = hiddenInput.value;

        if (!timerRunning) {
            startTimer();
        }

        // Update visual representation
        renderCustomInput(currentInputValue);
        updateCursorPosition();

        // --- Existing Practice Logic (adapted) ---
        const currentInput = currentInputValue; // Use our internal state
        const currentLineText = lines[currentDisplayLineIndex] || '';
        const inputLength = currentInput.length;
        let lineCorrect = true;
        let currentLineErrors = 0; // Errors on the current line attempt

        totalTypedEntries++; // Increment for each input event (approximation)

        let lastCharCorrect = false;
        let correctLength = 0; // Length of correct prefix in current input

        // Update character styling and check correctness
        currentCharSpans.forEach((charSpan, index) => {
            const expectedChar = charSpan.textContent;
            if (index < inputLength) {
                const typedChar = currentInput[index];
                let isCorrect = (typedChar === expectedChar);
                charSpan.classList.toggle('correct', isCorrect);
                charSpan.classList.toggle('incorrect', !isCorrect);
                if (isCorrect && lineCorrect) { // Only advance correctLength if prefix is correct
                    correctLength = index + 1;
                } else {
                    lineCorrect = false; // Mark line as incorrect if any mismatch found
                }
                if (index === inputLength - 1) lastCharCorrect = isCorrect; // Check last typed char
            } else {
                // Characters not yet typed
                charSpan.classList.remove('correct', 'incorrect', 'effect-correct', 'effect-incorrect');
                lineCorrect = false; // Line isn't fully correct yet
            }
        });

        // Trigger Animation ONLY for the last typed character's corresponding span
        if (inputLength > 0 && inputLength <= currentCharSpans.length) {
            const lastCharSpan = currentCharSpans[inputLength - 1];
            applyEffect(lastCharSpan, lastCharCorrect ? 'effect-correct' : 'effect-incorrect');

            // Play sound based on correctness, BUT NOT if it's the correct final char
            const isLineComplete = (inputLength === currentLineText.length && lineCorrect); // Check completion status NOW

            if (lastCharCorrect && !isLineComplete) { // Only play correct sound if NOT the final correct char
                correctSound.currentTime = 0; // Rewind to start
                correctSound.play().catch(e => console.error("Error playing correct sound:", e));
            } else if (!lastCharCorrect) { // Always play incorrect sound on error
                incorrectSound.currentTime = 0; // Rewind to start
                incorrectSound.play().catch(e => console.error("Error playing incorrect sound:", e));
            }
            // The lineCompleteSound will be played later in the 'Advance to Next Line' block if isLineComplete is true
        }

        // --- Update Overall Progress Index (Relative to Display Structure) ---
        // Calculate the correct index based on the current attempt
        let baseIndex = 0;
        for(let i = 0; i < currentDisplayLineIndex; i++) {
            baseIndex += lines[i].length;
            if (i < lines.length - 1) { baseIndex += 1; } // Add separator length
        }
        const currentAttemptCorrectIndex = baseIndex + correctLength;

        // Update the main currentOverallCharIndex only if the current attempt
        // represents forward progress or maintains the current position correctly.
        // This prevents the index from going backward if the user makes a mistake.
        currentOverallCharIndex = Math.max(currentOverallCharIndex, currentAttemptCorrectIndex);
        currentOverallCharIndex = Math.min(currentOverallCharIndex, totalDisplayLength); // Cap at total display length


        // --- Error Calculation ---
        // Simple: count incorrect spans on the current line display
        currentLineErrors = lineDisplay.querySelectorAll('.incorrect').length;
        errorsElement.textContent = currentLineErrors; // Show errors for the current line attempt
        // TODO: Implement more robust totalError tracking across lines/resets if needed

        calculateAccuracy(); // Update accuracy based on total entries/errors
        updateCompletionPercentage(); // Update completion based on currentOverallCharIndex

        // --- Advance to Next Line ---
        // Check if the input length matches the expected line length
        if (inputLength === currentLineText.length) {
            // Now, explicitly check if the final input value *exactly* matches the expected line text
            const finalInputIsCorrect = (currentInput === currentLineText);

            if (finalInputIsCorrect) {
            console.log(`Display Line ${currentDisplayLineIndex + 1} complete.`);
            totalTypedChars += currentLineText.length; // Add correctly typed chars for WPM

            // Play line complete sound
            lineCompleteSound.currentTime = 0; // Rewind
            lineCompleteSound.play().catch(e => console.error("Error playing line complete sound:", e));

            const nextLineIndex = currentDisplayLineIndex + 1;

            // Disable interaction (focus is already managed)
            // typingInputArea.style.pointerEvents = 'none'; // Maybe?

            // --- Delay before moving to the next line ---
            const lineCompleteDelay = 200; // Short fixed delay (in milliseconds)

            setTimeout(() => {
                // Clear the internal state and hidden input
                currentInputValue = '';
                if (hiddenInput) hiddenInput.value = '';
                renderCustomInput(''); // Clear visual input spans

                // Advance display line index
                currentDisplayLineIndex = nextLineIndex;

                // Render the next line
                renderLine(currentDisplayLineIndex);

                // Also re-focus the hidden input if there are more lines
                if (currentDisplayLineIndex < lines.length) {
                    focusHiddenInput();
                }
            }, lineCompleteDelay);
            // Removed the concurrent line transition animation block below,
            // as its setTimeout was calling renderLine too early and clearing the input.
        } // End if(finalInputIsCorrect)
    } // End if(inputLength === currentLineText.length)
} // End handleHiddenInput


// --- Save Progress Function ---
/**
 * Sends the current progress (overall character index relative to display structure) to the server.
 */
function saveProgressToServer() {
    if (!textId) {
        console.warn("Cannot save progress: textId is not defined.");
        alert("Error: Could not determine text ID to save progress.");
        return;
    }

    // Calculate the index to save based on the current state
    const currentInput = currentInputValue; // Use internal state
    const currentLineText = lines[currentDisplayLineIndex] || '';
    let correctLength = 0;
    // Use a simple loop to find the length of the correct prefix
    for (let i = 0; i < currentInput.length && i < currentLineText.length; i++) {
        if (currentInput[i] === currentLineText[i]) {
            correctLength++;
        } else {
            break; // Stop at the first mismatch
        }
    }

    let baseIndexSave = 0;
    for(let i = 0; i < currentDisplayLineIndex; i++) {
        baseIndexSave += lines[i].length;
         if (i < lines.length - 1) { // Add separator length if not the last line
            baseIndexSave += 1;
         }
    }
    // The index to save is the start of the line + length of correct input prefix
    const progressIndexToSave = Math.min(baseIndexSave + correctLength, totalDisplayLength);

    const progressData = {
        text_id: textId,
        progress_index: progressIndexToSave // Send the display-relative index
    };
    console.log('Save Button Clicked - Sending progress:', progressData);

    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    fetch('/save_progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(progressData),
    })
    .then(response => {
        if (!response.ok) {
            // Try to parse error message from JSON body, fallback to status text
            return response.json()
                     .then(errData => { throw new Error(errData.message || `HTTP error! status: ${response.status}`); })
                     .catch(() => { throw new Error(`HTTP error! status: ${response.status}`); });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log('Progress saved successfully via API.');
            saveButton.textContent = 'Saved!';
            // Update the initialProgressIndex in case user resets *again* without reload
            // initialProgressIndex = progressIndexToSave; // Disabled: might be confusing
            setTimeout(() => {
                saveButton.disabled = false;
                saveButton.textContent = 'Save Progress';
            }, 1500);
        } else {
            console.error('API failed to save progress:', data.message);
            alert('Error saving progress: ' + (data.message || 'Unknown error'));
            saveButton.disabled = false;
            saveButton.textContent = 'Save Progress';
        }
    })
    .catch((error) => {
        console.error('Error sending save progress request:', error);
        alert('Error saving progress: ' + error.message);
        saveButton.disabled = false;
        saveButton.textContent = 'Save Progress';
    });
} // End saveProgressToServer

// --- Reset Functionality ---
/**
 * Resets the typing practice state.
 * @param {boolean} startFromSaved - If true, attempts to start from `initialProgressIndex`.
 */
function resetPractice(startFromSaved = false) {
    console.log(`Resetting practice... ${startFromSaved ? 'Attempting resume from index ' + initialProgressIndex : 'Starting from beginning'}`);
    stopTimer();
    startTime = null;
    timerRunning = false;
    // Clear custom input
    currentInputValue = '';
    if (hiddenInput) hiddenInput.value = '';
    renderCustomInput('');
    updateCursorPosition();

    let startDisplayLineIndex = 0;
    let initialInputOffset = 0;
    let focusInput = true; // Flag to control if input should be focused

    // Reset stats and display elements first
    timerElement.textContent = 0;
    wpmElement.textContent = 0;
    accuracyElement.textContent = 100;
    errorsElement.textContent = 0;
    document.getElementById('results').classList.remove('completed');
    totalErrors = 0;
    totalTypedChars = 0;
    totalTypedEntries = 0;
    currentOverallCharIndex = 0; // Default to start

    if (startFromSaved && initialProgressIndex > 0) {
        // Check if saved progress indicates completion
        if (initialProgressIndex >= totalDisplayLength) {
            console.log("Resuming from completed state.");
            currentOverallCharIndex = totalDisplayLength;
            startDisplayLineIndex = lines.length; // Set index beyond last line to trigger completion message
            focusInput = false; // Don't focus input if already complete
            // Stats are already reset to 0/100%
        } else {
            // Resuming mid-text
            currentOverallCharIndex = initialProgressIndex;
            const startPos = getDisplayLineAndOffset(currentOverallCharIndex);
            startDisplayLineIndex = startPos.lineIndex;
            initialInputOffset = startPos.charOffset;
            console.log(`Resuming at Display Line ${startDisplayLineIndex + 1}, Char Offset ${initialInputOffset}`);
            // Approximate stats based on starting point
            totalTypedChars = currentOverallCharIndex;
            totalTypedEntries = currentOverallCharIndex;
            // Errors are reset
        }
    } else {
        console.log("Starting from beginning.");
        // Stats are already reset
    }

    currentDisplayLineIndex = startDisplayLineIndex;

    // Update completion percentage based on the determined starting index
    updateCompletionPercentage();

    // Render the starting line (or completion message)
    renderLine(currentDisplayLineIndex);

    // Ensure hidden input is focused only if not completed on load
    if (focusInput) {
        focusHiddenInput();
    }
} // End resetPractice


// --- Event Listeners ---
resetButton.addEventListener('click', () => resetPractice(false)); // Reset to beginning
saveButton.addEventListener('click', saveProgressToServer); // Explicit save
window.addEventListener('resize', updateCursorPosition); // Re-add resize listener for cursor


// --- Initial Setup ---
createHiddenInput(); // Create the hidden input field


// Use a fixed line width for simplicity during refactoring
let dynamicTargetWidth = 60; // Default fallback
console.log(`Using fixed line width: ${dynamicTargetWidth} chars`);

lines = splitIntoLines(fullText, dynamicTargetWidth); // Generate display lines using dynamic width
totalDisplayLength = calculateTotalDisplayLength(lines); // Calculate total length of display structure
console.log(`Total display structure length: ${totalDisplayLength} characters (including separators)`);
resetPractice(true); // Initial load attempts to resume from saved progress

// Initial focus on load
focusHiddenInput();

// TODO:
// - Implement proper cursor movement (arrow keys, click).
// - Refine resume logic for custom input (MAJOR TASK).
// - Handle selection within the custom input.
// - Improve wrap detection for cursor positioning.

}); // End DOMContentLoaded