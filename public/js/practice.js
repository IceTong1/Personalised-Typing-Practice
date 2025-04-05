import {
    // These are now primarily used by the initializer module
    // splitIntoLines,
    // calculateTotalDisplayLength,
    getDisplayLineAndOffset, // Still needed for resize handler
} from './textUtils.js';
import {
    calculateWPM,
    calculateAccuracy,
    calculateCompletionPercentage,
} from './statsUtils.js';
import {
    renderCustomInput, // Needed by inputHandler
    updateCursorPosition, // Needed by inputHandler
} from './domUtils.js';
import saveProgressToServer from './apiUtils.js';
import createTimerManager from './timerManager.js';
import createInputHandler from './inputHandler.js';
import createPracticeInitializer from './practiceInitializer.js'; // Import the new initializer

// This script runs after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const lineContainer = document.getElementById('current-line-container');
    const lineDisplay = document.getElementById('current-line-display');
    const typingInputArea = document.getElementById('typing-input-area');
    const typingInputContent = document.getElementById('typing-input-content');
    const typingCursor = document.getElementById('typing-cursor');
    const wpmElement = document.getElementById('wpm');
    const accuracyElement = document.getElementById('accuracy');
    const errorsElement = document.getElementById('errors');
    const timerElement = document.getElementById('timer');
    const completionElement = document.getElementById('completion');
    const resetButton = document.getElementById('reset-button');
    const saveButton = document.getElementById('save-button');
    const skipLineButton = document.getElementById('skip-line-button');
    const linesToShowSelect = document.getElementById('lines-to-show-select'); // Added lines to show select reference
    const toggleFullTextButton = document.getElementById('toggle-full-text-button'); // Added toggle full text button reference
    const fullTextContainer = document.getElementById('full-text-container'); // Added full text container reference
    const fullTextDisplay = document.getElementById('full-text-display'); // Added full text display reference
    const resultsContainer = document.getElementById('results');

    // --- Audio Elements ---
    const correctSound = new Audio('/sounds/correct.wav');
    const incorrectSound = new Audio('/sounds/incorrect.wav');
    const lineCompleteSound = new Audio('/sounds/line-complete.wav');
    correctSound.load();
    incorrectSound.load();
    lineCompleteSound.load();

    // --- Initial Check ---
    if (
        !lineContainer || !lineDisplay || !typingInputArea || !typingInputContent ||
        !typingCursor || !resetButton || !saveButton || !completionElement ||
        !resultsContainer || !wpmElement || !accuracyElement || !errorsElement ||
        !timerElement || !skipLineButton || !toggleFullTextButton || // Added checks for full text elements
        !fullTextContainer || !fullTextDisplay || !linesToShowSelect // Added check for lines select
    ) {
        console.error('Required elements not found for practice script. Aborting.');
        return;
    }

    // --- Constants from DOM ---
    const fullText = lineContainer.dataset.textContent || '';
    const textId = lineContainer.dataset.textId || null;
    const initialProgressIndex = parseInt(lineContainer.dataset.progressIndex || '0', 10);

    // --- Practice State Object (Shared between modules) ---
    let practiceState = {
        // Input state (managed by inputHandler)
        hiddenInput: null,
        currentInputValue: '',
        isCustomInputFocused: false,
        // Core text/progress state (managed by initializer/renderLine/inputHandler)
        lines: [],
        totalDisplayLength: 0,
        currentDisplayLineIndex: 0,
        currentOverallCharIndex: 0,
        currentCharSpans: [],
        // Timer state (managed by timerManager)
        timer: null,
        startTime: null,
        timerRunning: false,
        timeElapsed: 0,
        // Stats state (updated by inputHandler/initializer)
        totalErrors: 0,
        totalTypedChars: 0,
        totalTypedEntries: 0,
        linesToShow: 1, // Added state for number of lines to display
    };

    // --- Initialize Managers ---
    // Timer Manager needs state, timerElement, wpmElement
    const timerManager = createTimerManager(practiceState, timerElement, wpmElement);

    // --- Core Rendering & Logic (Shared/Remaining Functions) ---
    // These functions are passed as dependencies to other modules

    /**
     * Renders a specific line. Called by initializer and inputHandler.
     * @param {number} lineIndex - The index of the line to render.
     */
    function renderLine(startIndex) {
        console.log(`[Debug] renderLine called with start index: ${startIndex}, lines to show: ${practiceState.linesToShow}`);
        lineDisplay.innerHTML = ''; // Clear previous content
        practiceState.currentCharSpans = []; // Reset spans for the new block

        if (startIndex >= practiceState.lines.length) {
            lineDisplay.innerHTML = '<span class="correct">Text Complete!</span>';
            timerManager.stop();
            if (resultsContainer) resultsContainer.classList.add('completed');
            // Ensure index reflects full completion if somehow overshot
            practiceState.currentOverallCharIndex = practiceState.totalDisplayLength;
            updateStats(); // Final stats update
            console.log('Text completed!');
            return;
        }

        const endIndex = Math.min(startIndex + practiceState.linesToShow, practiceState.lines.length);
        console.log(`[Debug] Rendering lines from ${startIndex} to ${endIndex - 1}`);

        for (let i = startIndex; i < endIndex; i++) {
            const lineText = practiceState.lines[i];
            console.log(`[Debug] Rendering line ${i}: "${lineText}"`);

            // Add spans for the current line
            for (let j = 0; j < lineText.length; j++) {
                const char = lineText[j];
                const span = document.createElement('span');
                span.textContent = char;
                if (char === ' ') span.classList.add('space-char');
                lineDisplay.appendChild(span);
                practiceState.currentCharSpans.push(span);
            }

            // Add line break if not the last line in the block AND not the last line overall
            if (i < endIndex - 1) {
                const br = document.createElement('br');
                lineDisplay.appendChild(br);
                // Add a placeholder span for the newline character in our tracking array
                // This is crucial for the input handler to correctly calculate offsets
                const newlineSpan = document.createElement('span');
                newlineSpan.textContent = '\n'; // Represent newline
                newlineSpan.classList.add('newline-char'); // Add class for potential styling/debugging
                newlineSpan.style.display = 'none'; // Don't actually show it
                practiceState.currentCharSpans.push(newlineSpan);
            }
        }

        // Reset visual input for the new block
        renderCustomInput('', typingInputContent);
        updateCursorPosition(typingCursor, typingInputArea, typingInputContent, practiceState.isCustomInputFocused);

        // Ensure input handler is focused for the new block
        if (inputHandler) { // Check if inputHandler is initialized
             inputHandler.focus();
        } else {
            // This might happen during initial setup before inputHandler is fully created by initializer
            console.warn("renderLine called before inputHandler fully initialized.");
        }
    }

    /**
     * Updates all displayed statistics. Called by initializer and inputHandler.
     */
    function updateStats() {
        wpmElement.textContent = calculateWPM(practiceState.totalTypedChars, practiceState.timeElapsed);
        accuracyElement.textContent = calculateAccuracy(practiceState.totalTypedEntries, practiceState.totalErrors);
        errorsElement.textContent = practiceState.totalErrors;
        completionElement.textContent = calculateCompletionPercentage(
            practiceState.currentOverallCharIndex,
            practiceState.totalDisplayLength,
            fullText
        );
    }

     /**
     * Calculates the starting overall index for a given display line index.
     * Needed by inputHandler and initializer.
     * @param {number} lineIndex - The index of the display line.
     * @returns {number} - The starting overall character index.
     */
    function calculateStartIndexForLine(lineIndex) {
        let startIndex = 0;
        // Ensure lines array exists and has content before iterating
        if (practiceState.lines && practiceState.lines.length > 0) {
            for (let i = 0; i < lineIndex && i < practiceState.lines.length; i++) {
                 // Add length of the line + 1 for the separator
                 // Check if lines[i] exists and has a length property
                 if (practiceState.lines[i] && typeof practiceState.lines[i].length === 'number') {
                    startIndex += practiceState.lines[i].length + 1;
                 } else {
                    console.warn(`Invalid line data at index ${i} in calculateStartIndexForLine`);
                 }
            }
        }
        return startIndex;
    }

    // --- Initialize Input Handler ---
    // Needs state, DOM elements, sounds, timerManager, and callback functions
    const inputHandler = createInputHandler({
        practiceState,
        typingInputArea,
        typingInputContent,
        typingCursor,
        correctSound,
        incorrectSound,
        lineCompleteSound,
        timerManager,
        renderLine,
        updateStats,
        calculateStartIndexForLine
    });

    // --- Initialize Practice Initializer ---
    // Needs state, constants, DOM elements, and other managers/handlers
     const practiceInitializer = createPracticeInitializer({
        practiceState,
        fullText,
        initialProgressIndex,
        lineDisplay,
        resultsContainer,
        saveButton,
        timerManager,
        inputHandler, // Pass the created input handler
        renderLine,
        updateStats,
        calculateStartIndexForLine,
        linesToShowSelect // Pass the select element - Already present from previous step
    });


    // --- Event Listeners ---
    resetButton.addEventListener('click', practiceInitializer.reset); // Use initializer method

    if (saveButton) {
        saveButton.addEventListener('click', () => {
            if (textId) {
                saveProgressToServer(textId, practiceState.currentOverallCharIndex, saveButton);
            } else {
                console.warn('Cannot save progress: Text ID is missing.');
                alert('Cannot save progress: Text ID not found.');
            }
        });
    }

    const saveAndProfileLink = document.getElementById('save-and-profile-link');
    if (saveAndProfileLink) {
        saveAndProfileLink.addEventListener('click', async (event) => {
            event.preventDefault();
            console.log('Save and profile link clicked.');
            if (textId) {
                saveAndProfileLink.textContent = 'Saving...';
                saveAndProfileLink.style.pointerEvents = 'none';
                try {
                    await saveProgressToServer(textId, practiceState.currentOverallCharIndex, null);
                    console.log('Save attempt finished.');
                } catch (error) {
                    console.error('Unexpected error during saveProgressToServer call:', error);
                } finally {
                    console.log('Redirecting to profile...');
                    window.location.href = saveAndProfileLink.href;
                }
            } else {
                console.warn('Cannot save progress: Text ID is missing. Navigating directly.');
                window.location.href = saveAndProfileLink.href;
            }
        });
    } else {
        console.warn('Save and profile link element not found.');
    }

    // Skip Line (Block) Button Listener
    if (skipLineButton) {
        skipLineButton.addEventListener('click', () => {
            console.log('Skip Line button clicked.');
            const currentBlockStartIndex = practiceState.currentDisplayLineIndex;
            // Use the current linesToShow from state
            const linesInCurrentBlock = Math.min(practiceState.linesToShow, practiceState.lines.length - currentBlockStartIndex);
            const nextBlockStartIndex = currentBlockStartIndex + linesInCurrentBlock;

            // Check if there's a next block to skip to
            if (nextBlockStartIndex < practiceState.lines.length) {
                timerManager.stop(); // Stop the timer when skipping

                // Move state to the start of the next block
                practiceState.currentDisplayLineIndex = nextBlockStartIndex;
                practiceState.currentOverallCharIndex = calculateStartIndexForLine(practiceState.currentDisplayLineIndex);

                // Render the new block (this also resets input and focuses)
                renderLine(practiceState.currentDisplayLineIndex);

                // Update stats (completion will change)
                updateStats();

                console.log(`Skipped to block starting at line index: ${practiceState.currentDisplayLineIndex}, overall index: ${practiceState.currentOverallCharIndex}`);
            } else {
                console.log('Already on the last block, cannot skip.');
                // Optionally disable the button here if needed
            }
        });
    } else {
        console.warn('Skip Line button element not found.');
    }

    // Toggle Full Text Button Listener
    if (toggleFullTextButton && fullTextContainer && fullTextDisplay) {
        toggleFullTextButton.addEventListener('click', () => {
            const isToggled = toggleFullTextButton.getAttribute('data-toggled') === 'true';
            if (!isToggled) {
                // Show full text
                fullTextDisplay.textContent = fullText; // Use the fullText constant from line 58
                fullTextContainer.style.display = 'block';
                toggleFullTextButton.innerHTML = '<i class="fas fa-eye-slash me-2"></i>Hide Full Text';
                toggleFullTextButton.setAttribute('data-toggled', 'true');
                console.log('Showing full text.');
            } else {
                // Hide full text
                fullTextContainer.style.display = 'none';
                toggleFullTextButton.innerHTML = '<i class="fas fa-eye me-2"></i>Show Full Text';
                toggleFullTextButton.setAttribute('data-toggled', 'false');
                console.log('Hiding full text.');
            }
        });
    } else {
        console.warn('Toggle Full Text button or container/display elements not found.');
    }

    // --- Lines to Show Dropdown Listener ---
    if (linesToShowSelect) {
        linesToShowSelect.addEventListener('change', () => {
            console.log('Lines to show changed.');
            const savedIndex = practiceState.currentOverallCharIndex;
            const newLinesToShow = parseInt(linesToShowSelect.value, 10) || 1;

            // Update state immediately so initializer picks it up
            practiceState.linesToShow = newLinesToShow;

            // Reset layout (recalculates lines based on width, uses new linesToShow)
            // We pass 'false' to reset() so it doesn't use initialProgressIndex
            practiceInitializer.reset(false);

            // Find where the saved index falls in the *new* line layout
            const { lineIndex: newStartIndex, charOffset: newOffset } =
                getDisplayLineAndOffset(savedIndex, practiceState.lines);

            // Update state to reflect the position within the new layout
            practiceState.currentDisplayLineIndex = newStartIndex;
            practiceState.currentOverallCharIndex = savedIndex; // Restore the exact character index

            // Render the correct block based on the new start index
            renderLine(practiceState.currentDisplayLineIndex);

            // Update stats display
            updateStats();

            console.log(`Lines to show set to ${newLinesToShow}. Restored position to overall index: ${savedIndex} (New Start Line: ${newStartIndex})`);

            // Ensure focus is maintained
            inputHandler.focus();
        });
    } else {
        console.warn('Lines to show select element not found.');
    }

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

    // --- Resize Handling (Adapts similar logic to dropdown change) ---
    let indexBeforeResize = 0;
    const handleResize = debounce(() => {
        console.log('Window resized, recalculating layout...');
        indexBeforeResize = practiceState.currentOverallCharIndex;

        // Use the initializer to reset and recalculate layout
        // Pass false to reset() to ensure it doesn't revert to initialProgressIndex
        // It will use the current linesToShow value from the state/dropdown
        practiceInitializer.reset(false);

        // Restore position based on the *newly calculated* lines array
        const { lineIndex: newLine, charOffset: newOffset } =
            getDisplayLineAndOffset(indexBeforeResize, practiceState.lines); // Use state lines

        // Update state and render the correct block
        practiceState.currentDisplayLineIndex = newLine; // This is the start line of the block
        practiceState.currentOverallCharIndex = indexBeforeResize; // Restore exact index
        renderLine(practiceState.currentDisplayLineIndex); // Render block starting at newLine

        console.log(`Restored position to overall index: ${practiceState.currentOverallCharIndex} (New Start Line: ${newLine}, Offset: ${newOffset})`);
        updateStats();
        inputHandler.focus(); // Ensure focus after resize adjustments
    }, 250);

    window.addEventListener('resize', handleResize);

    // --- Initial Setup ---
    practiceInitializer.resetFromSaved(); // Initialize the practice area using the initializer

}); // End DOMContentLoaded
