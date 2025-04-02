/**
 * Calculates Words Per Minute (WPM).
 * WPM is based on 5-character "words".
 * @param {number} totalTypedChars - Total number of correctly typed characters.
 * @param {number} timeElapsed - Time elapsed in seconds.
 * @returns {number} - The calculated WPM.
 */
export function calculateWPM(totalTypedChars, timeElapsed) {
    if (timeElapsed === 0 || totalTypedChars === 0) {
        return 0;
    }
    const wordsTyped = totalTypedChars / 5;
    const timeInMinutes = timeElapsed / 60;
    const wpm = Math.round(wordsTyped / timeInMinutes);
    return wpm;
}

/**
 * Calculates typing accuracy.
 * Accuracy is based on total inputs vs errors.
 * @param {number} totalTypedEntries - Total number of characters typed (including errors).
 * @param {number} totalErrors - Total number of errors made.
 * @returns {number} - The calculated accuracy percentage.
 */
export function calculateAccuracy(totalTypedEntries, totalErrors) {
    if (totalTypedEntries === 0) {
        return 100;
    }
    const correctChars = Math.max(0, totalTypedEntries - totalErrors);
    const accuracy = Math.round((correctChars / totalTypedEntries) * 100);
    return accuracy;
}

/**
 * Calculates the completion percentage based on the current position.
 * @param {number} currentOverallCharIndex - The current character index in the overall display structure.
 * @param {number} totalDisplayLength - The total length of the display structure.
 * @param {string} fullText - The original full text (used for empty text check).
 * @returns {number} - The calculated completion percentage (0-100).
 */
export function calculateCompletionPercentage(currentOverallCharIndex, totalDisplayLength, fullText) {
    let percentage = 0;
    // Use the total length of the display structure
    const currentIndex = Math.min(currentOverallCharIndex, totalDisplayLength);

    if (totalDisplayLength > 0) {
        percentage = Math.round((currentIndex / totalDisplayLength) * 100);
    } else {
        // If the text is effectively empty after processing
        percentage = (fullText.trim() === '') ? 100 : 0;
    }
    return Math.min(percentage, 100); // Cap at 100%
}