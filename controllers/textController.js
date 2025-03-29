// --- Dependencies ---
const express = require('express');
const router = express.Router(); // Create a new router object
const db = require('../models/db'); // Import database functions from the model
const { requireLogin, requireOwnership } = require('../middleware/authMiddleware'); // Import authentication middleware
const multer = require('multer'); // Middleware for handling multipart/form-data (file uploads)
// const pdfParse = require('pdf-parse'); // No longer needed (using pdftotext)
const { execFileSync } = require('child_process'); // For running external commands synchronously (pdftotext)
const fs = require('fs'); // File system module for writing/deleting temporary files
const tmp = require('tmp'); // Library for creating temporary file paths

// --- Multer Configuration for PDF Uploads ---
// Configure where and how uploaded files are stored
const storage = multer.memoryStorage(); // Store the uploaded file as a Buffer in memory
const upload = multer({
    storage: storage, // Use the memory storage engine
    fileFilter: (req, file, cb) => { // Function to control which files are accepted
        if (file.mimetype === 'application/pdf') {
            cb(null, true); // Accept the file if it's a PDF
        } else {
            // Reject the file if it's not a PDF, passing an error message
            cb(new Error('Only PDF files are allowed!'), false);
        }
    }
}); // 'upload' is now middleware configured for single PDF file uploads

// --- Text Management Routes ---

/**
 * Route: GET /profile
 * Description: Displays the user's profile page, showing a list of their saved texts.
 * Middleware: Requires the user to be logged in (`requireLogin`).
 */
router.get('/profile', requireLogin, (req, res) => {
    try {
        // Get user ID from the session
        const userId = req.session.user.id;
        // Fetch the list of texts (id and title) for this user from the database
        const texts = db.get_texts(userId); // Use original get_texts without category filter
        console.log(`Fetching profile for user ID: ${userId}, Texts found: ${texts.length}`);
        // Render the 'profile.ejs' view
        res.render('profile', {
            user: req.session.user, // Pass user data for the header/navigation
            texts: texts,          // Pass the array of text objects
            message: req.query.message || null // Pass any message from query params (e.g., success/error after actions)
        });
    } catch (error) {
        // Handle potential errors during database fetching or rendering
        console.error("Error fetching profile:", error);
        res.status(500).send("Error loading profile."); // Send a generic server error response
    }
});


/**
 * Route: GET /add_text
 * Description: Displays the form for adding a new text.
 * Middleware: Requires the user to be logged in (`requireLogin`).
 */
router.get('/add_text', requireLogin, (req, res) => {
    // Render the 'add_text.ejs' view
    res.render('add_text', {
        user: req.session.user, // Pass user data
        error: null,            // No error initially
        title: '',              // Empty title for new text
        content: ''             // Empty content for new text
    });
});

/**
 * Route: POST /add_text
 * Description: Handles the submission of the add text form (either text content or PDF upload).
 * Middleware:
 *   - `requireLogin`: Ensures user is logged in.
 *   - `upload.single('pdfFile')`: Processes a potential single file upload with the field name 'pdfFile'.
 *                                  Adds `req.file` (if uploaded) and `req.body` (for text fields).
 */
router.post('/add_text', requireLogin, upload.single('pdfFile'), async (req, res) => {
    // Extract title from form body
    const { title } = req.body;
    // Get content from textarea (might be empty if PDF is used)
    let content = req.body.content;
    // Get user ID from session
    const userId = req.session.user.id;
    // Get uploaded file info from multer (will be undefined if no file uploaded)
    const uploadedFile = req.file;

    // Prepare arguments for rendering the form again in case of errors
    const renderArgs = {
        user: req.session.user,
        title: title, // Keep submitted title
        content: content // Keep submitted content
    };

    // --- Input Validation ---
    if (!title) {
        renderArgs.error = 'Title cannot be empty.';
        return res.render('add_text', renderArgs);
    }
    // Must provide either text content OR a PDF file
    if (!uploadedFile && !content) {
        renderArgs.error = 'Please provide text content or upload a PDF file.';
        return res.render('add_text', renderArgs);
    }
    // Cannot provide both text content AND a PDF file
    if (uploadedFile && content) {
        renderArgs.error = 'Please provide text content OR upload a PDF, not both.';
        return res.render('add_text', renderArgs);
    }

    // --- Process Input (PDF or Textarea) ---
    try {
        let textToSave = content; // Default to textarea content

        // If a file was uploaded, process it using pdftotext
        if (uploadedFile) {
            console.log(`Processing uploaded PDF with pdftotext: ${uploadedFile.originalname}`);
            let tempFilePath = null; // Variable to hold the temporary file path
            try {
                // 1. Create a unique temporary file path with a .pdf extension
                tempFilePath = tmp.tmpNameSync({ postfix: '.pdf' });
                console.log(`Created temp file: ${tempFilePath}`);

                // 2. Write the PDF data (from memory buffer) to the temporary file
                fs.writeFileSync(tempFilePath, uploadedFile.buffer);

                // 3. Execute the 'pdftotext' command-line tool
                let extractedText = execFileSync('pdftotext', ['-enc', 'UTF-8', tempFilePath, '-'], { encoding: 'utf8' }).trim();
                console.log(`Extracted ${extractedText.length} characters using pdftotext (requested UTF-8 output).`);

                // --- Text Cleanup (Handling pdftotext inconsistencies) ---
                const acute = /[\u00B4\u0301]/;
                const grave = /[`\u0300]/;
                const circumflex = /[\u005E\u0302]/;
                const cedilla = /[\u00B8\u0327]/;
                const diaeresis = /[\u00A8\u0308]/;

                let cleanedText = extractedText;
                console.log(`Initial length: ${cleanedText.length}`);

                // Pass 1: Fix Accent OptionalSpace Letter -> Precomposed
                cleanedText = cleanedText
                    .replace(new RegExp(acute.source + '\\s*e', 'gi'), 'é')
                    .replace(new RegExp(grave.source + '\\s*a', 'gi'), 'à')
                    .replace(new RegExp(grave.source + '\\s*e', 'gi'), 'è')
                    .replace(new RegExp(grave.source + '\\s*u', 'gi'), 'ù')
                    .replace(new RegExp(circumflex.source + '\\s*a', 'gi'), 'â')
                    .replace(new RegExp(circumflex.source + '\\s*e', 'gi'), 'ê')
                    .replace(new RegExp(circumflex.source + '\\s*i', 'gi'), 'î')
                    .replace(new RegExp(circumflex.source + '\\s*o', 'gi'), 'ô')
                    .replace(new RegExp(circumflex.source + '\\s*u', 'gi'), 'û')
                    .replace(new RegExp(cedilla.source + '\\s*c', 'gi'), 'ç')
                    .replace(new RegExp(diaeresis.source + '\\s*e', 'gi'), 'ë')
                    .replace(new RegExp(diaeresis.source + '\\s*i', 'gi'), 'ï')
                    .replace(new RegExp(diaeresis.source + '\\s*u', 'gi'), 'ü');
                console.log(`Length after Pass 1 (Accent Letter): ${cleanedText.length}`);

                // Pass 2: Fix Letter OptionalSpace Accent -> Precomposed
                cleanedText = cleanedText
                    .replace(new RegExp('a\\s*' + grave.source, 'gi'), 'à')
                    .replace(new RegExp('a\\s*' + circumflex.source, 'gi'), 'â')
                    .replace(new RegExp('c\\s*' + cedilla.source, 'gi'), 'ç')
                    .replace(new RegExp('e\\s*' + acute.source, 'gi'), 'é')
                    .replace(new RegExp('e\\s*' + grave.source, 'gi'), 'è')
                    .replace(new RegExp('e\\s*' + circumflex.source, 'gi'), 'ê')
                    .replace(new RegExp('e\\s*' + diaeresis.source, 'gi'), 'ë')
                    .replace(new RegExp('i\\s*' + circumflex.source, 'gi'), 'î')
                    .replace(new RegExp('i\\s*' + diaeresis.source, 'gi'), 'ï')
                    .replace(new RegExp('o\\s*' + circumflex.source, 'gi'), 'ô')
                    .replace(new RegExp('u\\s*' + grave.source, 'gi'), 'ù')
                    .replace(new RegExp('u\\s*' + circumflex.source, 'gi'), 'û')
                    .replace(new RegExp('u\\s*' + diaeresis.source, 'gi'), 'ü');
                console.log(`Length after Pass 2 (Letter Accent): ${cleanedText.length}`);

                // Replace typographic apostrophe with standard apostrophe
                cleanedText = cleanedText.replace(/’/g, "'");
                console.log(`Length after apostrophe replacement: ${cleanedText.length}`);

                // Final Unicode normalization (NFC form)
                textToSave = cleanedText.normalize('NFC');
                console.log(`Length after final NFC normalization: ${textToSave.length}`);
                // NOTE: The actual cleanup is now done *after* this block, applied to all text sources.
                // We still need to check if extraction yielded *anything* though.
                // --- End Text Cleanup (within PDF block) ---

                // Check if text extraction resulted in empty content
                if (!textToSave) { // textToSave here is the raw extracted text before common cleanup
                    renderArgs.error = 'Could not extract text using pdftotext. PDF might be empty or image-based.';
                    // Cleanup temp file before returning error
                    if (tempFilePath) fs.unlinkSync(tempFilePath);
                    return res.render('add_text', renderArgs);
                }
                // If extraction was successful, textToSave now holds the raw extracted text,
                // which will be passed to the common cleanup function later.

            } catch (execError) {
                // Handle errors during pdftotext execution
                console.error("Error executing pdftotext:", execError);
                // Check if the error is because the command wasn't found
                if (execError.code === 'ENOENT') {
                     renderArgs.error = 'Error processing PDF: pdftotext command not found. Please ensure Poppler utilities are installed and in the system PATH.';
                } else {
                    // Otherwise, show a generic error message
                    renderArgs.error = `Error processing PDF with pdftotext: ${execError.message}`;
                }
                 // Cleanup temp file before returning error
                if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
                return res.render('add_text', renderArgs);
            } finally {
                // 4. Clean up the temporary file regardless of success or failure
                if (tempFilePath && fs.existsSync(tempFilePath)) {
                    try {
                        fs.unlinkSync(tempFilePath);
                        console.log(`Cleaned up temp file: ${tempFilePath}`);
                    } catch (cleanupError) {
                        // Log error if cleanup fails, but don't stop the response
                        console.error(`Error cleaning up temp file ${tempFilePath}:`, cleanupError);
                    }
                }
            }
        } // End if(uploadedFile)

        // --- Apply Common Text Cleanup ---
        // Define cleanup function (could be moved outside the route handler for better organization)
        const cleanupText = (inputText) => {
            if (!inputText) return ''; // Handle null/undefined input gracefully

            const acute = /[\u00B4\u0301]/;
            const grave = /[`\u0300]/;
            const circumflex = /[\u005E\u0302]/;
            const cedilla = /[\u00B8\u0327]/;
            const diaeresis = /[\u00A8\u0308]/;

            let cleaned = inputText;
            // console.log(`Cleanup - Initial length: ${cleaned.length}`); // Reduce console noise

            // Pass 1: Fix Accent OptionalSpace Letter -> Precomposed
            cleaned = cleaned
                .replace(new RegExp(acute.source + '\\s*e', 'gi'), 'é')
                .replace(new RegExp(grave.source + '\\s*a', 'gi'), 'à')
                .replace(new RegExp(grave.source + '\\s*e', 'gi'), 'è')
                .replace(new RegExp(grave.source + '\\s*u', 'gi'), 'ù')
                .replace(new RegExp(circumflex.source + '\\s*a', 'gi'), 'â')
                .replace(new RegExp(circumflex.source + '\\s*e', 'gi'), 'ê')
                .replace(new RegExp(circumflex.source + '\\s*i', 'gi'), 'î')
                .replace(new RegExp(circumflex.source + '\\s*o', 'gi'), 'ô')
                .replace(new RegExp(circumflex.source + '\\s*u', 'gi'), 'û')
                .replace(new RegExp(cedilla.source + '\\s*c', 'gi'), 'ç')
                .replace(new RegExp(diaeresis.source + '\\s*e', 'gi'), 'ë')
                .replace(new RegExp(diaeresis.source + '\\s*i', 'gi'), 'ï')
                .replace(new RegExp(diaeresis.source + '\\s*u', 'gi'), 'ü');
            // console.log(`Cleanup - Length after Pass 1 (Accent Letter): ${cleaned.length}`);

            // Pass 2: Fix Letter OptionalSpace Accent -> Precomposed
            cleaned = cleaned
                .replace(new RegExp('a\\s*' + grave.source, 'gi'), 'à')
                .replace(new RegExp('a\\s*' + circumflex.source, 'gi'), 'â')
                .replace(new RegExp('c\\s*' + cedilla.source, 'gi'), 'ç')
                .replace(new RegExp('e\\s*' + acute.source, 'gi'), 'é')
                .replace(new RegExp('e\\s*' + grave.source, 'gi'), 'è')
                .replace(new RegExp('e\\s*' + circumflex.source, 'gi'), 'ê')
                .replace(new RegExp('e\\s*' + diaeresis.source, 'gi'), 'ë')
                .replace(new RegExp('i\\s*' + circumflex.source, 'gi'), 'î')
                .replace(new RegExp('i\\s*' + diaeresis.source, 'gi'), 'ï')
                .replace(new RegExp('o\\s*' + circumflex.source, 'gi'), 'ô')
                .replace(new RegExp('u\\s*' + grave.source, 'gi'), 'ù')
                .replace(new RegExp('u\\s*' + circumflex.source, 'gi'), 'û')
                .replace(new RegExp('u\\s*' + diaeresis.source, 'gi'), 'ü');
            // console.log(`Cleanup - Length after Pass 2 (Letter Accent): ${cleaned.length}`);

            // Replace typographic apostrophe with standard apostrophe
            cleaned = cleaned.replace(/’/g, "'");
            // console.log(`Cleanup - Length after apostrophe replacement: ${cleaned.length}`);

            // Final Unicode normalization (NFC form)
            const normalizedText = cleaned.normalize('NFC');
            // console.log(`Cleanup - Length after final NFC normalization: ${normalizedText.length}`);
            return normalizedText;
        };

        // Apply cleanup to the text regardless of source (PDF or textarea)
        // Make sure textToSave is not null/undefined before cleaning
        const finalContentToSave = cleanupText(textToSave || '');

        // --- Save to Database ---
        // Ensure we don't try to save completely empty content after cleanup if it wasn't intended
        // (Re-check validation logic - maybe empty content is allowed?)
        // Assuming empty content IS allowed if explicitly entered or extracted:
        const newTextId = db.add_text(userId, title, finalContentToSave); // Use original add_text with cleaned content
        if (newTextId !== -1) {
            // Success: Redirect to profile page with a success message
            console.log(`Text added: ID ${newTextId}, Title: ${title}, User ID: ${userId} (Source: ${uploadedFile ? 'PDF' : 'Textarea'}), Final Length: ${finalContentToSave.length}`);
            res.redirect('/profile?message=Text added successfully!');
        } else {
            // Database insertion failed
            console.error(`Failed to add text to DB for user ID: ${userId}`);
            renderArgs.error = 'Failed to save text to the database. Please try again.';
            res.render('add_text', renderArgs); // Re-render form with error
        }
    } catch (error) {
        // Catch any other unexpected errors during the process
        console.error("Unexpected error adding text:", error);
        renderArgs.error = 'An unexpected error occurred while adding the text.';
        res.render('add_text', renderArgs); // Re-render form with error
    }
});

/**
 * Route: GET /edit_text/:text_id
 * Description: Displays the form for editing an existing text.
 * Middleware:
 *   - `requireLogin`: Ensures user is logged in.
 *   - `requireOwnership`: Ensures the logged-in user owns the text specified by `:text_id`.
 *                         Attaches the fetched text object to `req.text`.
 */
router.get('/edit_text/:text_id', requireLogin, requireOwnership, (req, res) => {
    // The text object (req.text) is guaranteed to exist and belong to the user
    // due to the requireOwnership middleware succeeding.
    res.render('edit_text', {
        user: req.session.user, // Pass user data
        text: req.text,         // Pass the text object to pre-fill the form
        error: null             // No error initially
    });
    // Error handling (text not found, not owned) is done within requireOwnership middleware
});

/**
 * Route: POST /edit_text/:text_id
 * Description: Handles the submission of the edit text form.
 * Middleware:
 *   - `requireLogin`: Ensures user is logged in.
 *   - `requireOwnership`: Ensures the logged-in user owns the text specified by `:text_id`.
 */
router.post('/edit_text/:text_id', requireLogin, requireOwnership, (req, res) => {
    // Get text ID from URL parameters
    const textId = req.params.text_id;
    // Get updated title and content from form body
    const { title, content } = req.body;
    // Get user ID from session
    const userId = req.session.user.id;
    // req.text (original text) is available from requireOwnership if needed, but not used here

    // --- Input Validation ---
    if (!title || !content) {
        console.log(`Edit failed for text ID ${textId}: Title or content empty.`);
        // Re-render edit form with error and submitted data
        return res.render('edit_text', {
            user: req.session.user,
            // Pass a temporary text object with the submitted (invalid) data
            text: { id: textId, title: title, content: content },
            error: 'Title and content cannot be empty.'
        });
    }

    // --- Update Database ---
    try {
        // Attempt to update the text in the database
        const success = db.update_text(textId, title, content);
        if (success) {
            // Success: Redirect to profile page with success message
            console.log(`Text updated: ID ${textId}, Title: ${title}, User ID: ${userId}`);
            res.redirect('/profile?message=Text updated successfully!');
        } else {
            // Database update failed (e.g., text deleted between check and update)
            console.error(`Failed to update text ID ${textId} for user ID ${userId}`);
            res.render('edit_text', {
                user: req.session.user,
                text: { id: textId, title: title, content: content }, // Show submitted data
                error: 'Failed to update text. Please try again.'
            });
        }
    } catch (error) {
        // Catch unexpected errors during database operation
        console.error(`Error updating text ID ${textId} for user ID ${userId}:`, error);
        res.render('edit_text', {
            user: req.session.user,
            text: { id: textId, title: title, content: content }, // Show submitted data
            error: 'An unexpected error occurred while updating the text.'
        });
    }
});

/**
 * Route: POST /delete_text/:text_id
 * Description: Handles the deletion of a text.
 * Middleware:
 *   - `requireLogin`: Ensures user is logged in.
 *   - `requireOwnership`: Ensures the logged-in user owns the text specified by `:text_id`.
 */
router.post('/delete_text/:text_id', requireLogin, requireOwnership, (req, res) => {
    // Get text ID from URL parameters
    const textId = req.params.text_id;
    // Get user ID from session
    const userId = req.session.user.id;

    // --- Delete from Database ---
    try {
        // Attempt to delete the text
        const success = db.delete_text(textId);
        if (success) {
            // Success: Redirect to profile with success message
            console.log(`Text deleted: ID ${textId}, User ID: ${userId}`);
            res.redirect('/profile?message=Text deleted successfully!');
        } else {
            // Deletion failed (e.g., text already deleted)
            console.warn(`Failed to delete text ID ${textId} for user ID ${userId} (already deleted or DB issue?)`);
            res.redirect('/profile?message=Could not delete text. It might have already been removed.');
        }
    } catch (error) {
        // Catch unexpected errors during database operation
        console.error(`Error deleting text ID ${textId} for user ID ${userId}:`, error);
        res.redirect('/profile?message=An error occurred while deleting the text.');
    }
});

/**
 * Route: GET /practice/:text_id
 * Description: Displays the typing practice page for a specific text.
 * Middleware:
 *   - `requireLogin`: Ensures user is logged in.
 *   - `requireOwnership`: Ensures the logged-in user owns the text specified by `:text_id`.
 *                         Attaches the fetched text object to `req.text`.
 */
router.get('/practice/:text_id', requireLogin, requireOwnership, (req, res) => {
    // The requireOwnership middleware already fetched the text and verified ownership.
    // It also attached the text object to req.text.
    // Now, we need to pass the user_id to get_text to fetch progress as well.
    const textId = req.params.text_id;
    const userId = req.session.user.id;

    try {
        // Fetch text data *including* user progress
        const textData = db.get_text(textId, userId); // Use original get_text

        if (!textData) {
            // This case should ideally be caught by requireOwnership, but check again.
            console.error(`Text not found in GET /practice/:text_id even after ownership check? ID: ${textId}`);
            return res.redirect('/profile?message=Text not found.');
        }

        console.log(`Rendering practice page for text ID: ${textId}, User ID: ${userId}, Progress: ${textData.progress_index}`);
        // Render the 'practice.ejs' view, passing user and the full text data (including progress)
        res.render('practice', {
            user: req.session.user,
            text: textData // Pass the object containing id, title, content, progress_index
        });

    } catch (error) {
        console.error(`Error fetching text/progress for practice page (Text ID: ${textId}, User ID: ${userId}):`, error);
        res.redirect('/profile?message=Error loading practice text.');
    }
});

/**
 * Route: POST /save_progress
 * Description: Saves the user's typing progress for a specific text.
 *              Expects 'text_id' and 'progress_index' in the request body.
 * Middleware: Requires the user to be logged in (`requireLogin`).
 */
router.post('/save_progress', requireLogin, (req, res) => {
    // Global bodyParser.json() middleware in server.js already handles parsing
    const { text_id, progress_index } = req.body;
    const user_id = req.session.user.id;

    // Basic validation
    if (text_id === undefined || progress_index === undefined) {
        console.error(`Save progress failed: Missing text_id or progress_index. Body:`, req.body);
        return res.status(400).json({ success: false, message: 'Missing required data.' });
    }

    // Convert to numbers just in case they came as strings
    const textIdNum = parseInt(text_id, 10);
    const progressIndexNum = parseInt(progress_index, 10);

    if (isNaN(textIdNum) || isNaN(progressIndexNum) || progressIndexNum < 0) {
         console.error(`Save progress failed: Invalid data types or negative index. text_id: ${text_id}, progress_index: ${progress_index}`);
        return res.status(400).json({ success: false, message: 'Invalid data.' });
    }

    try {
        // TODO: Optional - Add a check here to verify the user actually owns textIdNum before saving progress?
        // This adds DB overhead but increases security if API is exposed differently.
        // For now, assume requireLogin is sufficient protection as only logged-in users can reach this.

        const success = db.save_progress(user_id, textIdNum, progressIndexNum);

        if (success) {
            // console.log(`Progress saved via API: User ${user_id}, Text ${textIdNum}, Index ${progressIndexNum}`); // Optional logging
            res.status(200).json({ success: true });
        } else {
            console.error(`Save progress DB error: User ${user_id}, Text ${textIdNum}`);
            res.status(500).json({ success: false, message: 'Database error saving progress.' });
        }
    } catch (error) {
        console.error(`Unexpected error saving progress: User ${user_id}, Text ${textIdNum}:`, error);
        res.status(500).json({ success: false, message: 'Server error saving progress.' });
    }
});


// --- Export Router ---
// Make the router object available for mounting in server.js
module.exports = router;