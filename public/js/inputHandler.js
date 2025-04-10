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

    /**
     * Processes character input against the target spans for the current block.
     * @param {string} inputValue - The current value from the hidden input.
     * @param {Array<HTMLElement>} blockSpans - The array of spans for the current block (including newline placeholders).
     * @param {string} blockText - The expected text content for the block (including newlines).
     * @returns {object} - Results: { correctLength (non-newline chars), blockCorrect, blockErrors, lastCharCorrect }
     */
    function processCharacterInput(inputValue, blockSpans, blockText) {
        const inputLength = inputValue.length;
        let blockCorrect = true; // Assume correct until proven otherwise
        let blockErrors = 0;
        let lastCharCorrect = false;
        let correctLength = 0; // Tracks correctly typed *non-newline* characters in sequence
        let currentBlockIndex = 0; // Index within the blockSpans array

        for (let i = 0; i < blockSpans.length; i++) {
            const charSpan = blockSpans[i];
            const isNewlineSpan = charSpan.classList.contains('newline-char');
            const expectedChar = isNewlineSpan ? '\n' : charSpan.textContent;

            if (currentBlockIndex < inputLength) {
                const typedChar = inputValue[currentBlockIndex];
                const isCorrect = typedChar === expectedChar;

                // Only count errors for non-newline characters
                const wasPreviouslyIncorrect = charSpan.classList.contains('incorrect');
                if (!isCorrect && !wasPreviouslyIncorrect && !isNewlineSpan) {
                    blockErrors++;
                }

                // Update visual feedback
                charSpan.classList.toggle('correct', isCorrect);
                charSpan.classList.toggle('incorrect', !isCorrect);

                // Update overall block correctness and sequential correct length
                if (isCorrect && blockCorrect) {
                    if (!isNewlineSpan) { // Only increment correctLength for actual characters
                        correctLength = currentBlockIndex + 1; // +1 because index is 0-based
                    }
                } else {
                    blockCorrect = false;
                }

                // Track if the very last typed character was correct
                if (currentBlockIndex === inputLength - 1) {
                    lastCharCorrect = isCorrect;
                }

                currentBlockIndex++; // Move to the next character in the input

            } else { // Input is shorter than the block
                charSpan.classList.remove('correct', 'incorrect', 'effect-correct', 'effect-incorrect');
                blockCorrect = false; // Cannot be correct if input is too short
            }
        }

        // Final check: block is only correct if input length matches block length
        if (inputLength !== blockText.length) {
            blockCorrect = false;
        }

        // Adjust correctLength to represent the count of non-newline characters correctly typed sequentially
        let nonNewlineCorrectCount = 0;
        for(let k = 0; k < correctLength; k++) {
            if (inputValue[k] !== '\n') { // Assuming input mirrors block structure w/ newlines
                nonNewlineCorrectCount++;
            }
        }

        // console.log(`[Debug processInput] Input: "${inputValue}", BlockText: "${blockText}", CorrectLength (raw): ${correctLength}, NonNewlineCorrect: ${nonNewlineCorrectCount}, BlockCorrect: ${blockCorrect}, Errors: ${blockErrors}`);

        return { correctLength: nonNewlineCorrectCount, blockCorrect, blockErrors, lastCharCorrect };
    }

    function handleCharacterFeedback(isCorrect, inputLength, previousInputValue, targetSpans, isLineTextCorrect, lineLength) {
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
        } else { // Typed past end of line (inputLength > lineLength)
             // Check if it's the expected trailing space after a correct line
             const isExpectedTrailingSpace = inputLength === lineLength + 1 && isLineTextCorrect && previousInputValue.length === lineLength && isCorrect; // isCorrect checks if the last char typed *was* the space

             if (inputLength > previousInputValue.length && !isExpectedTrailingSpace) {
                // Play incorrect sound only if it's not the valid trailing space or if typed further
                incorrectSound.play().catch((e) => console.log('Sound play interrupted'));
                if (inputLength > lineLength + 1 || !isLineTextCorrect) { // Count error if too long or line wasn't correct before space
                    practiceState.totalErrors++; // Increment errors for extra/wrong characters
                }
                console.log('Error: Typed past end of line or incorrect trailing character.');
                // Optionally apply visual feedback to the input area itself if needed
             } else if (isExpectedTrailingSpace) {
                 // Don't play incorrect sound for the valid space, line completion sound handles it
                 // Apply correct effect to the *last character span* of the line text? Or maybe not needed.
             }
        }
    }

    /**
     * Checks if the *individual line currently being typed* is complete and correct.
     * Handles clearing input and advancing block if necessary.
     * @param {boolean} isLineCorrect - Whether the current line input matches the target line text.
     * @param {number} inputLength - The length of the current input value.
     * @param {string} currentLineText - The expected text for the *specific line* being typed.
     * @param {number} currentLineIndexInBlock - The 0-based index of the line within the current display block.
     * @param {number} linesInCurrentBlock - The total number of lines displayed in the current block.
     * @returns {boolean} - True if the *entire block* was completed and handled, false otherwise.
     */
    // isLineCorrect is now isLineReadyForCompletion (text correct + trailing space)
    function checkAndHandleIndividualLineCompletion(isLineReadyForCompletion, inputLength, currentLineText, currentLineIndexInBlock, linesInCurrentBlock) {
        // Condition now checks the flag passed from handleHiddenInput
        if (isLineReadyForCompletion && currentLineText.length > 0) {
            const absoluteLineIndex = practiceState.currentDisplayLineIndex + currentLineIndexInBlock;
            console.log(`Individual line ${absoluteLineIndex} complete.`);
            lineCompleteSound.play().catch((e) => console.log('Sound play interrupted'));

            // --- Award Coin ---
            fetch('/practice/line-complete', { // Updated path
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Add CSRF token header if necessary
                },
                // No body needed as user ID is from session
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success && data.newCoinCount !== null) {
                    console.log(`Coin awarded! New count: ${data.newCoinCount}`);
                    // Update the coin count in the header
                    const coinCountElement = document.getElementById('coin-count');
                    if (coinCountElement) {
                        coinCountElement.textContent = data.newCoinCount;
                    } else {
                        console.warn('Could not find coin count element in header to update.');
                    }
                } else if (!data.success) {
                     console.error('API call to award coin failed:', data.message);
                } else {
                    // Success was true, but newCoinCount was null (server-side fetch issue)
                    console.warn('Coin likely awarded, but failed to retrieve updated count from server.');
                }
            })
            .catch(error => {
                console.error('Error calling coin award API:', error);
            });

            // --- Clear Input ---
            if (practiceState.hiddenInput) {
                practiceState.hiddenInput.value = '';
            }
            practiceState.currentInputValue = '';
            renderCustomInput('', typingInputContent);
            updateCursorPosition(typingCursor, typingInputArea, typingInputContent, practiceState.isCustomInputFocused);

            // --- Check if Block is Complete ---
            const isLastLineOfBlock = currentLineIndexInBlock === linesInCurrentBlock - 1;

            if (isLastLineOfBlock) {
                console.log(`Last line of block completed. Advancing block.`);
                // Advance to the start of the next block
                practiceState.currentDisplayLineIndex += linesInCurrentBlock;
                practiceState.currentOverallCharIndex = calculateStartIndexForLine(practiceState.currentDisplayLineIndex);
                // Render the next block
                renderLine(practiceState.currentDisplayLineIndex);
                return true; // Block was completed
            } else {
                // Not the last line, just update overall index to the start of the *next* line within the block
                practiceState.currentOverallCharIndex = calculateStartIndexForLine(absoluteLineIndex + 1);
                console.log(`Line complete, but not end of block. New overall index: ${practiceState.currentOverallCharIndex}`);
                // No need to re-render the block, just update stats
                updateStats();
                return false; // Block not completed yet
            }
        }
        return false; // Block not completed
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
        const currentInput = practiceState.currentInputValue; // Use a shorter alias
        const inputLength = currentInput.length;

        // Start timer if not running and text not complete
        if (!practiceState.timerRunning && practiceState.currentDisplayLineIndex < practiceState.lines.length) {
            timerManager.start();
        }

        // Update visual input display and cursor
        renderCustomInput(currentInput, typingInputContent);
        updateCursorPosition(typingCursor, typingInputArea, typingInputContent, practiceState.isCustomInputFocused);

        // --- Determine current line within the block based on overall index ---
        const blockStartIndex = practiceState.currentDisplayLineIndex;
        const linesInBlock = Math.min(practiceState.linesToShow, practiceState.lines.length - blockStartIndex);
        const overallStartIndexForBlock = calculateStartIndexForLine(blockStartIndex);

        let currentLineAbsoluteIndex = -1;
        let currentLineIndexInBlock = -1;
        let startIndexOfCurrentLine = -1;
        let lengthOfCurrentLine = 0;
        let spansForCurrentLine = [];
        let textForCurrentLine = "";
        let cumulativeLengthInBlock = 0; // Tracks raw length (incl. newlines) for span indexing

        for (let i = 0; i < linesInBlock; i++) {
            const lineIdx = blockStartIndex + i;
            const lineText = practiceState.lines[lineIdx];
            const lineStartIndexAbsolute = calculateStartIndexForLine(lineIdx);
            const lineEndIndexAbsolute = lineStartIndexAbsolute + lineText.length; // End index is exclusive for comparison

            // Check if the current overall character index falls within this line
            // It should be >= start of line and < end of line (or exactly at start if inputLength is 0)
            if (practiceState.currentOverallCharIndex >= lineStartIndexAbsolute &&
                practiceState.currentOverallCharIndex <= lineEndIndexAbsolute) { // Use <= to catch start of line case

                // Special case: If index is exactly at the end, and input is empty, target the *next* line if available
                if (practiceState.currentOverallCharIndex === lineEndIndexAbsolute && inputLength === 0 && i < linesInBlock - 1) {
                   // Skip to next iteration, the next line's check will handle it
                   cumulativeLengthInBlock += lineText.length + 1; // Account for newline
                   continue;
                }

                currentLineAbsoluteIndex = lineIdx;
                currentLineIndexInBlock = i;
                startIndexOfCurrentLine = lineStartIndexAbsolute;
                lengthOfCurrentLine = lineText.length;
                textForCurrentLine = lineText;

                // Extract spans for this specific line from the block spans
                const spanStartIndexInBlock = cumulativeLengthInBlock;
                const spanEndIndexInBlock = spanStartIndexInBlock + lengthOfCurrentLine;
                spansForCurrentLine = practiceState.currentCharSpans.slice(spanStartIndexInBlock, spanEndIndexInBlock);
                break; // Found the line
            }
            // Add length of this line + newline (if applicable) for next iteration's span index calculation
            cumulativeLengthInBlock += lineText.length + (i < linesInBlock - 1 ? 1 : 0);
        }

        // Handle case where text is complete or line wasn't found (shouldn't happen)
        if (currentLineAbsoluteIndex === -1 || currentLineAbsoluteIndex >= practiceState.lines.length) {
            if (practiceState.currentDisplayLineIndex >= practiceState.lines.length) {
                console.log("Attempting input after text completion.");
                if (practiceState.hiddenInput) practiceState.hiddenInput.value = '';
                practiceState.currentInputValue = '';
                renderCustomInput('', typingInputContent);
                updateCursorPosition(typingCursor, typingInputArea, typingInputContent, practiceState.isCustomInputFocused);
            } else {
                console.error("Could not determine current line for input handling. State:", practiceState);
            }
            return;
        }

        // --- Process Input for the Current Line Only ---
        practiceState.totalTypedEntries++; // Increment regardless of line

        // Compare currentInput against textForCurrentLine using spansForCurrentLine
        let lineTextCorrect = true; // Check if the text part matches
        let lineErrors = 0;
        let lastCharCorrect = false;
        let correctPrefixLengthOnLine = 0; // Correct prefix *of the text part*

        // Process only the characters corresponding to the actual line text
        spansForCurrentLine.forEach((charSpan, index) => {
            const expectedChar = charSpan.textContent;
            if (index < inputLength && index < lengthOfCurrentLine) { // Only compare up to line length
                const typedChar = currentInput[index];
                const isCorrect = typedChar === expectedChar;

                const wasPreviouslyIncorrect = charSpan.classList.contains('incorrect');
                if (!isCorrect && !wasPreviouslyIncorrect) {
                    lineErrors++;
                    practiceState.totalErrors++; // Increment global errors
                    practiceState.errorsSinceLastPenalty++; // Increment penalty counter
                }

                charSpan.classList.toggle('correct', isCorrect);
                charSpan.classList.toggle('incorrect', !isCorrect);

                if (isCorrect && lineTextCorrect) {
                    correctPrefixLengthOnLine = index + 1;
                } else {
                    lineTextCorrect = false; // Text part is incorrect if any mismatch
                }
            } else if (index >= lengthOfCurrentLine && index < inputLength) {
                // Input is longer than the line text, but we haven't checked the space yet.
                // Don't mark spans incorrect here, handle trailing space logic below.
            }
             else { // Input is shorter than this character's position in the line
                charSpan.classList.remove('correct', 'incorrect', 'effect-correct', 'effect-incorrect');
                lineTextCorrect = false;
            }
        });

        // Check if the input matches the line text exactly up to the line's length
        if (correctPrefixLengthOnLine !== lengthOfCurrentLine) {
            lineTextCorrect = false;
        }

        // --- New Line Completion Logic ---
        const isTrailingSpaceTyped = inputLength === lengthOfCurrentLine + 1 && currentInput.endsWith(' ');
        const isLineReadyForCompletion = lineTextCorrect && isTrailingSpaceTyped;

        // Determine lastCharCorrect based on context (text or trailing space)
        if (inputLength === 0) {
            lastCharCorrect = false;
        } else if (isTrailingSpaceTyped) {
            lastCharCorrect = lineTextCorrect; // Space is "correct" if line was correct
        } else if (inputLength > lengthOfCurrentLine) {
            lastCharCorrect = false; // Typed something else or too many chars after line end
        } else { // Input is within or exactly at the line length
             const lastTypedIndex = inputLength - 1;
             if (lastTypedIndex >= 0 && lastTypedIndex < lengthOfCurrentLine) {
                 lastCharCorrect = currentInput[lastTypedIndex] === textForCurrentLine[lastTypedIndex];
             } else {
                 lastCharCorrect = false; // Should not happen if inputLength <= lengthOfCurrentLine
             }
        }

        // Clear formatting for any spans beyond the current input length (up to line length)
        // This handles backspace correctly.
        for (let i = inputLength; i < lengthOfCurrentLine; i++) {
             if (spansForCurrentLine[i]) {
                 spansForCurrentLine[i].classList.remove('correct', 'incorrect', 'effect-correct', 'effect-incorrect');
             }
        }

        // --- Check for Error Penalty ---
        if (practiceState.errorsSinceLastPenalty >= 10) {
            const coinCountElement = document.getElementById('coin-count');
            const currentCoins = coinCountElement ? parseInt(coinCountElement.textContent, 10) : 0;

            if (currentCoins <= 0) {
                // Coins are already 0 or less, skip penalty API call
                console.info(`Reached ${practiceState.errorsSinceLastPenalty} errors, but penalty skipped (coins already 0).`);
                practiceState.errorsSinceLastPenalty = 0; // Reset counter
            } else {
                // Proceed with penalty API call
                console.log(`Reached ${practiceState.errorsSinceLastPenalty} errors, applying penalty...`);
                const errorsBeforePenalty = practiceState.errorsSinceLastPenalty; // Store current count before resetting
                practiceState.errorsSinceLastPenalty = 0; // Reset counter immediately

                fetch('/practice/penalty', { // Corrected path
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            })
            .then(async response => { // Make async to potentially read body on error
                const status = response.status;
                const data = await response.json().catch(() => null); // Try to parse JSON, default to null if fails

                if (status === 200 && data && data.success && data.newCoinCount !== null) {
                    // --- Success Case ---
                    console.log(`Penalty applied! New coin count: ${data.newCoinCount}`);
                    const coinCountElement = document.getElementById('coin-count');
                    if (coinCountElement) {
                        coinCountElement.textContent = data.newCoinCount;
                    }
                } else if (status === 400 && data && !data.success && data.currentCoinCount !== undefined) {
                    // --- Expected "Already Zero" Case ---
                    console.info(`Penalty skipped (coins already 0). Current count: ${data.currentCoinCount}`); // Use console.info
                     const coinCountElement = document.getElementById('coin-count');
                    if (coinCountElement) {
                        // Update display just in case it was out of sync
                        coinCountElement.textContent = data.currentCoinCount;
                    }
                } else {
                    // --- Unexpected Error Case ---
                    console.error(`API call for penalty failed. Status: ${status}`, data || 'No response body');
                    // Revert the penalty counter for this attempt
                    practiceState.errorsSinceLastPenalty = errorsBeforePenalty;
                }
            })
            .catch(error => {
                 // --- Network or Fetch Error Case ---
                console.error('Network error calling penalty API:', error);
                // Revert the penalty counter if the fetch itself failed
                practiceState.errorsSinceLastPenalty = errorsBeforePenalty;
            });
            } // End of else block (proceed with penalty)
        }


        // Original lineCorrect check is replaced by isLineReadyForCompletion for the completion function
        // We still need lineTextCorrect for other logic potentially.

        // Handle feedback (sound/effect) for the last typed character on this line
        // Pass lineTextCorrect to determine if the trailing space should trigger incorrect sound
        handleCharacterFeedback(lastCharCorrect, inputLength, previousInputValue, spansForCurrentLine, lineTextCorrect, lengthOfCurrentLine);

        // Update overall progress index based on the correct prefix *on this line*
        practiceState.currentOverallCharIndex = startIndexOfCurrentLine + correctPrefixLengthOnLine;
        // Update totalTypedChars (used for WPM) - needs careful consideration
        // Let's base it on overall index for now, but this might need refinement for accuracy across clears.
        practiceState.totalTypedChars = practiceState.currentOverallCharIndex;

        // --- Check for Individual Line Completion ---
        // Use the new flag to check for completion
        const blockCompleted = checkAndHandleIndividualLineCompletion(
            isLineReadyForCompletion, // Use the new flag
            inputLength, // Pass inputLength for potential future use, though condition changed
            textForCurrentLine,
            currentLineIndexInBlock,
            linesInBlock
        );

        // Update stats display if the block wasn't just completed
        // (checkAndHandleIndividualLineCompletion updates stats if only a line was completed)
        if (!blockCompleted) {
            // If the line wasn't completed (didn't meet the new criteria), update stats
            if (!isLineReadyForCompletion) {
                 updateStats();
            }
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