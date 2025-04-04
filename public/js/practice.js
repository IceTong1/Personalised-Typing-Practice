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
        !timerElement
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
    function renderLine(lineIndex) {
        console.log(`[Debug] renderLine called with index: ${lineIndex}`);
        if (lineIndex >= practiceState.lines.length) {
            lineDisplay.innerHTML = '<span class="correct">Text Complete!</span>';
            timerManager.stop();
            if (resultsContainer) resultsContainer.classList.add('completed');
            practiceState.currentOverallCharIndex = practiceState.totalDisplayLength;
            updateStats(); // Final stats update
            console.log('Text completed!');
            return;
        }
        const lineText = practiceState.lines[lineIndex];
        console.log(`[Debug] Rendering line text: "${lineText}"`);
        lineDisplay.innerHTML = '';
        practiceState.currentCharSpans = []; // Reset spans for the new line
        for (let i = 0; i < lineText.length; i++) {
            const char = lineText[i];
            const span = document.createElement('span');
            span.textContent = char;
            if (char === ' ') span.classList.add('space-char');
            lineDisplay.appendChild(span);
            practiceState.currentCharSpans.push(span);
        }

        // Reset visual input for the new line
        renderCustomInput('', typingInputContent);
        updateCursorPosition(typingCursor, typingInputArea, typingInputContent, practiceState.isCustomInputFocused);

        // Ensure input handler is focused for the new line
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
        calculateStartIndexForLine
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
    let indexBeforeResize = 0;
    const handleResize = debounce(() => {
        console.log('Window resized, recalculating layout...');
        indexBeforeResize = practiceState.currentOverallCharIndex;

        // Use the initializer to reset and recalculate layout
        practiceInitializer.reset(); // Resets to start based on new width

        // Restore position based on the *newly calculated* lines array
        const { lineIndex: newLine, charOffset: newOffset } =
            getDisplayLineAndOffset(indexBeforeResize, practiceState.lines); // Use state lines

        // Update state and render the correct line
        practiceState.currentDisplayLineIndex = newLine;
        practiceState.currentOverallCharIndex = indexBeforeResize;
        renderLine(practiceState.currentDisplayLineIndex); // This calls inputHandler.focus()

        console.log(`Restored position to overall index: ${practiceState.currentOverallCharIndex} (Line: ${newLine}, Offset: ${newOffset})`);
        updateStats();
    }, 250);

    window.addEventListener('resize', handleResize);

    // --- Initial Setup ---
    practiceInitializer.resetFromSaved(); // Initialize the practice area using the initializer

}); // End DOMContentLoaded
