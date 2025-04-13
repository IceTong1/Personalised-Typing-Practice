// public/js/practiceInitializer.js
import {
    splitIntoLines,
    calculateTotalDisplayLength,
    getDisplayLineAndOffset,
} from './textUtils.js';

/**
 * Calculates the target character width for lines based on container width and font style.
 * @param {HTMLElement} containerElement - The element whose width determines the line length.
 * @returns {number} - The calculated target width in characters.
 */
function calculateTargetWidth(containerElement) {
    const containerWidth = containerElement.clientWidth;
    let targetWidth = 60; // Default fallback

    if (containerWidth > 0) {
        const tempSpan = document.createElement('span');
        const displayStyle = window.getComputedStyle(containerElement);
        tempSpan.style.fontFamily = displayStyle.fontFamily;
        tempSpan.style.fontSize = displayStyle.fontSize;
        tempSpan.style.position = 'absolute';
        tempSpan.style.visibility = 'hidden';
        tempSpan.style.whiteSpace = 'nowrap';
        document.body.appendChild(tempSpan);

        let charCount = 0;
        const testChar = 'm';
        try {
            while (tempSpan.offsetWidth <= containerWidth) {
                charCount++;
                tempSpan.textContent = testChar.repeat(charCount);
                if (charCount > 1000) {
                    console.warn('Width calculation safety break triggered.');
                    break;
                }
            }
            const charBuffer = 12;
            targetWidth = Math.max(1, charCount - 1 - charBuffer);
            console.log(
                `Direct Measurement: Container: ${containerWidth}px, Chars ('${testChar}') fit before buffer: ${charCount - 1}, Final Target Width: ${targetWidth}`
            );
        } catch (e) {
            console.error('Error during direct width measurement:', e);
        } finally {
            if (tempSpan.parentNode === document.body) {
                // Check parent before removing
                document.body.removeChild(tempSpan);
            }
        }
        targetWidth = Math.max(20, targetWidth);
    } else {
        console.warn(
            `Container clientWidth is 0. Using default targetWidth: ${targetWidth}`
        );
    }
    return targetWidth;
}

/**
 * Creates a practice initializer module.
 * @param {object} dependencies - Object containing necessary dependencies.
 * @param {object} dependencies.practiceState - The shared state object.
 * @param {string} dependencies.fullText - The original full text content.
 * @param {number} dependencies.initialProgressIndex - The starting progress index from server.
 * @param {HTMLElement} dependencies.lineDisplay - The DOM element displaying the current line.
 * @param {HTMLElement} dependencies.resultsContainer - The container for results styling.
 * @param {HTMLElement} dependencies.saveButton - The save button element.
 * @param {object} dependencies.timerManager - The timer manager instance.
 * @param {object} dependencies.inputHandler - The input handler instance.
 * @param {function} dependencies.renderLine - Function to render a specific line.
 * @param {function} dependencies.updateStats - Function to update displayed statistics.
 * @param {function} dependencies.calculateStartIndexForLine - Function to get the start index of a line.
 * @param {HTMLElement} dependencies.linesToShowSelect - The dropdown for selecting lines to show.
 * @returns {object} - The initializer instance with an initialize method.
 */
function createPracticeInitializer(dependencies) {
    const {
        practiceState,
        fullText,
        initialProgressIndex,
        lineDisplay,
        resultsContainer,
        saveButton,
        timerManager,
        inputHandler,
        renderLine,
        updateStats,
        calculateStartIndexForLine,
        linesToShowSelect, // Added dependency
    } = dependencies;

    /**
     * Resets the practice area to its initial state or saved progress.
     * @param {boolean} [startFromSaved=false] - If true, starts from the saved progress index.
     */
    function initialize(startFromSaved = false) {
        console.log(
            `Initializing/Resetting practice. Start from saved: ${startFromSaved}`
        );
        timerManager.reset();

        // --- Read Lines to Show Setting ---
        practiceState.linesToShow = parseInt(linesToShowSelect.value, 10) || 1;
        console.log(
            `[Debug] Lines to show set to: ${practiceState.linesToShow}`
        );

        // --- Width Calculation & Line Splitting ---
        const targetWidth = calculateTargetWidth(lineDisplay);
        console.log(`[Debug] Calculated targetWidth: ${targetWidth}`);
        practiceState.lines = splitIntoLines(fullText, targetWidth);
        console.log(
            `[Debug] Generated lines array (length ${practiceState.lines.length}):`,
            practiceState.lines
        );
        practiceState.totalDisplayLength = calculateTotalDisplayLength(
            practiceState.lines
        );

        // --- Determine Starting Point ---
        let startingOverallIndex = 0;
        if (
            startFromSaved &&
            initialProgressIndex > 0 &&
            initialProgressIndex < practiceState.totalDisplayLength
        ) {
            startingOverallIndex = initialProgressIndex;
            console.log(
                `Starting from saved progress index: ${startingOverallIndex}`
            );
        } else {
            console.log('Starting from the beginning.');
        }

        const { lineIndex: startLine, charOffset: startOffset } =
            getDisplayLineAndOffset(startingOverallIndex, practiceState.lines);

        // --- Reset State ---
        practiceState.currentDisplayLineIndex = startLine;
        practiceState.currentOverallCharIndex = startingOverallIndex;
        practiceState.totalErrors = 0;
        practiceState.totalTypedChars = 0;
        practiceState.totalTypedEntries = 0;
        practiceState.currentInputValue = ''; // Reset input value state
        // Note: hiddenInput, isCustomInputFocused are managed by inputHandler
        // Note: timer, startTime, timerRunning, timeElapsed are managed by timerManager

        // --- Render Initial Line ---
        // This needs to happen *before* potential mid-line adjustments
        renderLine(practiceState.currentDisplayLineIndex);

        // --- Handle Starting Mid-line (Potential Enhancement) ---
        if (startOffset > 0) {
            console.warn(
                `Starting offset ${startOffset} detected, but currently starting line fresh.`
            );
            // If implementing resume mid-line, logic would go here to:
            // - Set practiceState.currentInputValue
            // - Call renderCustomInput
            // - Mark spans as correct
            // - Adjust totalTypedChars/Entries
            // For now, reset index to start of the line if we started fresh visually
            practiceState.currentOverallCharIndex =
                calculateStartIndexForLine(startLine);
        }

        // --- Reset Visual Elements ---
        if (resultsContainer) resultsContainer.classList.remove('completed');
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.classList.remove('saved');
            saveButton.textContent = 'Save Progress';
        }

        // --- Update Stats Display ---
        updateStats();

        // --- Initialize and Focus Input Handler ---
        // Ensures the hidden input exists and is ready
        inputHandler.initialize();
    }

    // --- Public API ---
    return {
        initialize, // Expose the main initialization/reset function
        reset: () => initialize(false), // Convenience method for resetting to start
        resetFromSaved: () => initialize(true), // Convenience method for resetting to saved
    };
}

export default createPracticeInitializer;
