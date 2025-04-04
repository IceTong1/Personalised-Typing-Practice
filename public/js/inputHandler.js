// public/js/inputHandler.js
import { renderCustomInput, updateCursorPosition, applyEffect } from './domUtils.js';

/**
 * Creates an input handler module for the typing practice.
 * @param {object} dependencies - Object containing necessary dependencies.
 * @param {object} dependencies.practiceState - The shared state object.
 * @param {HTMLElement} dependencies.typingInputArea - The clickable area for focus.
 * @param {HTMLElement} dependencies.typingInputContent - The element displaying typed characters.
 * @param {HTMLElement} dependencies.typingCursor - The cursor element.
 * @param {HTMLAudioElement} dependencies.correctSound - Sound for correct characters.
 * @param {HTMLAudioElement} dependencies.incorrectSound - Sound for incorrect characters.
 * @param {HTMLAudioElement} dependencies.lineCompleteSound - Sound for line completion.
 * @param {object} dependencies.timerManager - The timer manager instance.
 * @param {function} dependencies.renderLine - Function to render a specific line.
 * @param {function} dependencies.updateStats - Function to update displayed statistics.
 * @param {function} dependencies.calculateStartIndexForLine - Function to get the start index of a line.
 * @returns {object} - The input handler instance with an initialize method.
 */
function createInputHandler(dependencies) {
    const {
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
    } = dependencies;

    // --- Internal Helper Functions (Moved from practice.js) ---

    function processCharacterInput(inputValue, targetSpans, lineText) {
        const inputLength = inputValue.length;
        let lineCorrect = true;
        let lineErrors = 0;
        let lastCharCorrect = false;
        let correctLength = 0;

        targetSpans.forEach((charSpan, index) => {
            const expectedChar = charSpan.textContent;
            if (index < inputLength) {
                const typedChar = inputValue[index];
                const isCorrect = typedChar === expectedChar;

                const wasPreviouslyIncorrect = charSpan.classList.contains('incorrect');
                if (!isCorrect && !wasPreviouslyIncorrect) {
                    lineErrors++;
                }

                charSpan.classList.toggle('correct', isCorrect);
                charSpan.classList.toggle('incorrect', !isCorrect);

                if (isCorrect && lineCorrect) {
                    correctLength = index + 1;
                } else {
                    lineCorrect = false;
                }
                if (index === inputLength - 1) lastCharCorrect = isCorrect;
            } else {
                charSpan.classList.remove(
                    'correct',
                    'incorrect',
                    'effect-correct',
                    'effect-incorrect'
                );
                lineCorrect = false;
            }
        });

        if (inputLength !== lineText.length) {
            lineCorrect = false;
        }
        return { correctLength, lineCorrect, lineErrors, lastCharCorrect };
    }

    function handleCharacterFeedback(isCorrect, inputLength, previousInputValue, targetSpans) {
         if (inputLength === 0) return;

        if (inputLength <= targetSpans.length) {
            const lastCharSpan = targetSpans[inputLength - 1];
            if (isCorrect) {
                if (inputLength > previousInputValue.length) {
                    correctSound.play().catch((e) => console.log('Sound play interrupted'));
                    applyEffect(lastCharSpan, 'effect-correct');
                }
            } else {
                 if (inputLength > previousInputValue.length) {
                    incorrectSound.play().catch((e) => console.log('Sound play interrupted'));
                    applyEffect(lastCharSpan, 'effect-incorrect');
                 }
            }
        } else { // Typed past end of line
             if (inputLength > previousInputValue.length) {
                incorrectSound.play().catch((e) => console.log('Sound play interrupted'));
                practiceState.totalErrors++; // Access shared state
                console.log('Error: Typed past end of line.');
             }
        }
    }

     function checkAndHandleLineCompletion(isLineCorrect, inputLength, currentLineText) {
         if (
            isLineCorrect &&
            inputLength === currentLineText.length &&
            currentLineText.length > 0
        ) {
            console.log(`Line ${practiceState.currentDisplayLineIndex} complete.`);
            lineCompleteSound.play().catch((e) => console.log('Sound play interrupted'));
            practiceState.currentDisplayLineIndex++;
            if (practiceState.currentDisplayLineIndex < practiceState.lines.length) {
                practiceState.currentOverallCharIndex++;
            }
            renderLine(practiceState.currentDisplayLineIndex); // Call external function passed as dependency
            return true;
        }
        return false;
    }

    // --- Event Handlers ---

    function handleKeyDown(event) {
        // Minimal logic, keep as is for now
        // console.log('Keydown:', event.key);
    }

    function handleHiddenInput() {
        if (!practiceState.hiddenInput) return;
        const previousInputValue = practiceState.currentInputValue;
        practiceState.currentInputValue = practiceState.hiddenInput.value;
        const inputLength = practiceState.currentInputValue.length;

        // Start timer if not running
        if (!practiceState.timerRunning && practiceState.currentDisplayLineIndex < practiceState.lines.length) {
            timerManager.start(); // Use timerManager passed in dependencies
        }

        // Update visual input display and cursor
        renderCustomInput(practiceState.currentInputValue, typingInputContent);
        updateCursorPosition(
            typingCursor,
            typingInputArea,
            typingInputContent,
            practiceState.isCustomInputFocused
        );

        // Get current line text and check for completion state
        const currentLineText = practiceState.lines[practiceState.currentDisplayLineIndex] || '';
        if (!currentLineText && practiceState.currentDisplayLineIndex >= practiceState.lines.length) {
             console.log("Attempting input after text completion.");
             practiceState.hiddenInput.value = ''; // Prevent further input
             practiceState.currentInputValue = '';
             renderCustomInput('', typingInputContent); // Clear visual input
             updateCursorPosition(typingCursor, typingInputArea, typingInputContent, practiceState.isCustomInputFocused); // Update cursor
             return; // Exit
        }

        // Increment total entries
        practiceState.totalTypedEntries++;

        // Process character comparison and get results
        const { correctLength, lineCorrect, lineErrors, lastCharCorrect } =
            processCharacterInput(practiceState.currentInputValue, practiceState.currentCharSpans, currentLineText);

        // Update total errors (line errors only)
        practiceState.totalErrors += lineErrors;

        // Handle sound/effect feedback (also handles errors for typing past end)
        handleCharacterFeedback(lastCharCorrect, inputLength, previousInputValue, practiceState.currentCharSpans);

        // Update total typed characters and overall progress index based on correct prefix
        const lineStartIndex = calculateStartIndexForLine(practiceState.currentDisplayLineIndex);
        practiceState.totalTypedChars = lineStartIndex + correctLength;
        practiceState.currentOverallCharIndex = lineStartIndex + correctLength;

        // Check if the line was completed
        const lineCompleted = checkAndHandleLineCompletion(lineCorrect, inputLength, currentLineText);

        // Update stats display if the line wasn't just completed
        if (!lineCompleted) {
            updateStats(); // Call external function passed as dependency
        }
    }

    // --- Setup Functions ---

    function focusHiddenInput() {
        // Check if hiddenInput exists on practiceState before focusing
        if (practiceState.hiddenInput && document.activeElement !== practiceState.hiddenInput) {
            practiceState.hiddenInput.focus();
        } else if (!practiceState.hiddenInput) {
            console.warn("Attempted to focus non-existent hidden input.");
        }
    }

    function createHiddenInputElement() {
        // Check if already created
        if (practiceState.hiddenInput) {
            return;
        }
        practiceState.hiddenInput = document.createElement('input');
        practiceState.hiddenInput.type = 'text';
        practiceState.hiddenInput.style.position = 'absolute';
        practiceState.hiddenInput.style.opacity = '0';
        practiceState.hiddenInput.style.pointerEvents = 'none';
        practiceState.hiddenInput.style.left = '-9999px';
        practiceState.hiddenInput.style.top = '-9999px';
        practiceState.hiddenInput.setAttribute('autocomplete', 'off');
        practiceState.hiddenInput.setAttribute('autocorrect', 'off');
        practiceState.hiddenInput.setAttribute('autocapitalize', 'off');
        practiceState.hiddenInput.setAttribute('spellcheck', 'false');
        practiceState.hiddenInput.setAttribute('tabindex', '-1');

        document.body.appendChild(practiceState.hiddenInput);

        // Add event listeners
        practiceState.hiddenInput.addEventListener('input', handleHiddenInput);
        practiceState.hiddenInput.addEventListener('keydown', handleKeyDown);

        typingInputArea.addEventListener('click', focusHiddenInput);
        practiceState.hiddenInput.addEventListener('focus', () => {
            practiceState.isCustomInputFocused = true;
            typingInputArea.classList.add('focused');
            updateCursorPosition(
                typingCursor,
                typingInputArea,
                typingInputContent,
                practiceState.isCustomInputFocused
            );
        });
        practiceState.hiddenInput.addEventListener('blur', () => {
            practiceState.isCustomInputFocused = false;
            typingInputArea.classList.remove('focused');
            if (typingCursor) typingCursor.style.opacity = '0';
        });
         console.log("Hidden input created and listeners attached.");
    }

    // --- Public API ---
    const handler = {
        initialize() {
            createHiddenInputElement(); // Create the element and attach listeners
            focusHiddenInput(); // Attempt to focus
        },
        focus: focusHiddenInput, // Expose focus method
    };

    return handler;
}

export default createInputHandler;