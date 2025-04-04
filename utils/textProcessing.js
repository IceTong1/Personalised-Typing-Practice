/**
 * Cleans text extracted from PDFs or submitted via textarea.
 * Handles common accent issues from pdftotext and normalizes Unicode.
 * @param {string | null | undefined} inputText The text to clean.
 * @returns {string} The cleaned and normalized text.
 */
const cleanupText = (inputText) => {
    if (!inputText) return ''; // Handle null/undefined input gracefully

    // Define regexes for different accent types, matching both spacing and combining forms
    const acute = /[\u00B4\u0301]/; // ´ or combining acute
    const grave = /[`\u0300]/;     // ` or combining grave
    const circumflex = /[\u005E\u0302]/; // ^ or combining circumflex
    const cedilla = /[\u00B8\u0327]/;   // ¸ or combining cedilla
    const diaeresis = /[\u00A8\u0308]/; // ¨ or combining diaeresis

    let cleaned = inputText;

    // Pass 1: Fix Accent OptionalSpace Letter -> Precomposed
    // Handles cases like ´ e -> é
    cleaned = cleaned
        .replace(new RegExp(`${acute.source}\\s*e`, 'gi'), 'é')
        .replace(new RegExp(`${grave.source}\\s*a`, 'gi'), 'à')
        .replace(new RegExp(`${grave.source}\\s*e`, 'gi'), 'è')
        .replace(new RegExp(`${grave.source}\\s*u`, 'gi'), 'ù')
        .replace(new RegExp(`${circumflex.source}\\s*a`, 'gi'), 'â')
        .replace(new RegExp(`${circumflex.source}\\s*e`, 'gi'), 'ê')
        .replace(new RegExp(`${circumflex.source}\\s*i`, 'gi'), 'î')
        .replace(new RegExp(`${circumflex.source}\\s*o`, 'gi'), 'ô')
        .replace(new RegExp(`${circumflex.source}\\s*u`, 'gi'), 'û')
        .replace(new RegExp(`${cedilla.source}\\s*c`, 'gi'), 'ç')
        .replace(new RegExp(`${diaeresis.source}\\s*e`, 'gi'), 'ë')
        .replace(new RegExp(`${diaeresis.source}\\s*i`, 'gi'), 'ï')
        .replace(new RegExp(`${diaeresis.source}\\s*u`, 'gi'), 'ü');

    // Pass 2: Fix Letter OptionalSpace Accent -> Precomposed
    // Handles cases like e ´ -> é
    cleaned = cleaned
        .replace(new RegExp(`a\\s*${grave.source}`, 'gi'), 'à')
        .replace(new RegExp(`a\\s*${circumflex.source}`, 'gi'), 'â')
        .replace(new RegExp(`c\\s*${cedilla.source}`, 'gi'), 'ç')
        .replace(new RegExp(`e\\s*${acute.source}`, 'gi'), 'é')
        .replace(new RegExp(`e\\s*${grave.source}`, 'gi'), 'è')
        .replace(new RegExp(`e\\s*${circumflex.source}`, 'gi'), 'ê')
        .replace(new RegExp(`e\\s*${diaeresis.source}`, 'gi'), 'ë')
        .replace(new RegExp(`i\\s*${circumflex.source}`, 'gi'), 'î')
        .replace(new RegExp(`i\\s*${diaeresis.source}`, 'gi'), 'ï')
        .replace(new RegExp(`o\\s*${circumflex.source}`, 'gi'), 'ô')
        .replace(new RegExp(`u\\s*${grave.source}`, 'gi'), 'ù')
        .replace(new RegExp(`u\\s*${circumflex.source}`, 'gi'), 'û')
        .replace(new RegExp(`u\\s*${diaeresis.source}`, 'gi'), 'ü');

    // Replace typographic apostrophe with standard apostrophe
    cleaned = cleaned.replace(/’/g, "'");

    // Final Unicode normalization (NFC form) - applied AFTER manual replacements
    const normalizedText = cleaned.normalize('NFC');

    // Trim whitespace from start/end
    return normalizedText.trim();
};

// --- PDF Processing Helper ---
// (Requires fs, tmp, child_process - ensure these are installed/available)
const fs = require('fs');
const tmp = require('tmp');
const { execFileSync } = require('child_process');

// Helper function to process PDF upload using pdftotext
async function processPdfUpload(uploadedFile) {
    if (!uploadedFile || !uploadedFile.buffer) {
        throw new Error('Invalid file buffer provided for PDF processing.');
    }
    if (process.env.NODE_ENV === 'development')
        console.log(
            `Processing uploaded PDF with pdftotext: ${uploadedFile.originalname}`
        );
    let tempFilePath = null;
    try {
        tempFilePath = tmp.tmpNameSync({ postfix: '.pdf' });
        if (process.env.NODE_ENV === 'development')
            console.log(`Created temp file: ${tempFilePath}`);

        fs.writeFileSync(tempFilePath, uploadedFile.buffer);

        const extractedText = execFileSync(
            'pdftotext',
            ['-enc', 'UTF-8', tempFilePath, '-'],
            { encoding: 'utf8' }
        ).trim();
        if (process.env.NODE_ENV === 'development')
            console.log(
                `Extracted ${extractedText.length} characters using pdftotext.`
            );

        if (!extractedText) {
            // Throw specific error for empty extraction
            throw new Error(
                'Could not extract text using pdftotext. PDF might be empty or image-based.'
            );
        }
        return extractedText; // Return raw extracted text
    } catch (execError) {
        console.error('Error executing pdftotext:', execError);
        if (execError.code === 'ENOENT') {
            throw new Error(
                'Error processing PDF: pdftotext command not found. Please ensure Poppler utilities are installed and in the system PATH.'
            );
        } else if (execError.message.includes('Could not extract text')) {
            // Re-throw the specific error from above
            throw execError;
        } else {
            throw new Error(`Error processing PDF with pdftotext: ${execError.message}`);
        }
    } finally {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
                if (process.env.NODE_ENV === 'development')
                    console.log(`Cleaned up temp file: ${tempFilePath}`);
            } catch (cleanupError) {
                console.error(
                    `Error cleaning up temp file ${tempFilePath}:`,
                    cleanupError
                );
            }
        }
    }
}


module.exports = {
    cleanupText,
    processPdfUpload,
};