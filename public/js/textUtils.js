/**
 * Splits the original text into lines suitable for display, applying word wrapping.
 * @param {string} text - The original full text.
 * @param {number} targetWidth - The desired maximum line width.
 * @returns {string[]} - An array of strings, each representing a line for display.
 */
export function splitIntoLines(text, targetWidth) {
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
export function calculateTotalDisplayLength(displayLines) {
    if (!displayLines || displayLines.length === 0) {
        return 0;
    }
    // Sum of lengths of all lines + number of separators (length - 1)
    const totalChars = displayLines.reduce((sum, line) => sum + line.length, 0);
    const totalSeparators = displayLines.length - 1;
    return totalChars + totalSeparators;
}


/**
 * Determines the display line index and character offset within that line
 * corresponding to a given overall index in the display structure.
 * @param {number} targetIndex - The overall index in the display structure.
 * @param {string[]} lines - The array of display lines.
 * @returns {{lineIndex: number, charOffset: number}}
 */
export function getDisplayLineAndOffset(targetIndex, lines) {
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