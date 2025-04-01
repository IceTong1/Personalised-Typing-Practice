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

        // --- Fetch User Statistics (Placeholder) ---
        // TODO: Implement db.get_user_stats(userId) in models/db.js
        // For now, using placeholder data
        const stats = {
            textsPracticed: 0, // Example stat
            totalPracticeTime: '0h 0m', // Example stat
            averageAccuracy: 0 // Example stat
        };
        // const stats = db.get_user_stats(userId); // Uncomment when implemented

        console.log(`Fetching profile stats for user ID: ${userId}`);

        // Render the 'profile.ejs' view
        res.render('profile', {
            user: req.session.user, // Pass user data for the header/navigation
            stats: stats,           // Pass the user statistics object
            message: req.query.message || null // Pass any message from query params
        });
    } catch (error) {
        // Handle potential errors during database fetching or rendering
        console.error("Error fetching profile stats:", error);
        res.status(500).send("Error loading profile."); // Send a generic server error response
    }
});

/**
 * Route: GET /texts
 * Description: Displays the user's texts page, showing a list of their saved texts.
 * Middleware: Requires the user to be logged in (`requireLogin`).
 */
router.get('/texts', requireLogin, (req, res) => {
    try {
        const userId = req.session.user.id;
        // Get current category ID from query param, default to null (root)
        // Ensure it's either null or a valid integer
        let currentCategoryId = req.query.category_id ? parseInt(req.query.category_id, 10) : null;
        if (isNaN(currentCategoryId)) {
            currentCategoryId = null; // Default to root if parsing fails
        }

        // Fetch categories within the current category (subfolders)
        const categories = db.get_categories(userId, currentCategoryId);

        // Fetch texts within the current category
        const texts = db.get_texts(userId, currentCategoryId);

        // TODO: Fetch breadcrumbs if currentCategoryId is not null (requires recursive DB query or logic)
        const breadcrumbs = []; // Placeholder for now

        // Fetch all categories flat list for the "Move" dropdown
        const allCategoriesFlat = db.get_all_categories_flat(userId);

        console.log(`Fetching texts page for user ID: ${userId}, Category ID: ${currentCategoryId}, Texts: ${texts.length}, Categories: ${categories.length}, All Categories: ${allCategoriesFlat.length}`);

        res.render('texts', {
            user: req.session.user,
            texts: texts,
            categories: categories,
            currentCategoryId: currentCategoryId, // Pass the current category ID to the view
            breadcrumbs: breadcrumbs, // Pass breadcrumbs
            message: req.query.message || null,
            allCategoriesFlat: allCategoriesFlat // Pass the flat list for the move dropdown
        });
    } catch (error) {
        console.error("Error fetching texts page:", error);
        res.status(500).send("Error loading texts.");
    }
});


/**
 * Route: GET /add_text
 * Description: Displays the form for adding a new text.
 * Middleware: Requires the user to be logged in (`requireLogin`).
 */
router.get('/add_text', requireLogin, (req, res) => {
    const userId = req.session.user.id; // Moved outside try block
    try {
        // Fetch all categories for the dropdown
        const categories = db.get_all_categories_flat(userId);
        console.log(`Fetching categories for add_text dropdown for user ${userId}: ${categories.length} found.`);

        // Render the 'add_text.ejs' view
        res.render('add_text', {
            user: req.session.user, // Pass user data
            error: null,            // No error initially
            title: '',              // Empty title for new text
            content: '',            // Empty content for new text
            categories: categories  // Pass the flat list of categories
        });
    } catch (error) {
        console.error(`Error fetching categories for add_text page (User ${userId}):`, error);
        // Render with an error message, but maybe without categories
        res.render('add_text', {
            user: req.session.user,
            error: 'Could not load folder list.',
            title: '',
            content: '',
            categories: [] // Send empty array
        });
    }
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
    // Extract title, content, and category_id from form body
    const { title, category_id } = req.body;
    let content = req.body.content; // Content from textarea
    const userId = req.session.user.id; // User ID from session

    // Parse category_id (can be 'root' or an integer ID)
    let targetCategoryId = null; // Default to root
    if (category_id && category_id !== 'root') {
        const parsedId = parseInt(category_id, 10);
        if (!isNaN(parsedId)) {
            targetCategoryId = parsedId;
        } else {
            // Handle invalid category ID if necessary, maybe return error
            console.warn(`Invalid category_id received in POST /add_text: ${category_id}`);
            // For now, let's default to root if parsing fails
        }
    }
    // Get uploaded file info from multer (will be undefined if no file uploaded)
    const uploadedFile = req.file;

    // Prepare arguments for rendering the form again in case of errors
    const renderArgs = {
        user: req.session.user,
        title: title, // Keep submitted title
        content: content, // Keep submitted content
        categories: [] // Need to re-fetch categories on error render
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
        // --- Save to Database ---
        // Pass the targetCategoryId to the updated db.add_text function
        const newTextId = db.add_text(userId, title, finalContentToSave, targetCategoryId);
        if (newTextId !== -1) {
            // Success: Redirect to the folder where the text was added
            console.log(`Text added: ID ${newTextId}, Title: ${title}, User ID: ${userId}, Category: ${targetCategoryId} (Source: ${uploadedFile ? 'PDF' : 'Textarea'}), Final Length: ${finalContentToSave.length}`);
            let redirectUrl = '/texts?message=Text added successfully!';
            if (targetCategoryId) {
                redirectUrl += '&category_id=' + targetCategoryId;
            }
            res.redirect(redirectUrl);
        } else {
            // Database insertion failed
            console.error(`Failed to add text to DB for user ID: ${userId}, Category: ${targetCategoryId}`);
            // Re-fetch categories before rendering error
            try {
                renderArgs.categories = db.get_all_categories_flat(userId);
            } catch (fetchErr) {
                console.error("Error re-fetching categories for error render:", fetchErr);
                renderArgs.categories = [];
            }
            renderArgs.error = 'Failed to save text to the database. Please try again.';
            res.render('add_text', renderArgs); // Re-render form with error
        }
    } catch (error) {
        // Catch any other unexpected errors during the process
        console.error("Unexpected error adding text:", error);
        renderArgs.error = 'An unexpected error occurred while adding the text.';
        // Re-fetch categories before rendering error
        try {
            renderArgs.categories = db.get_all_categories_flat(userId);
        } catch (fetchErr) {
            console.error("Error re-fetching categories for error render:", fetchErr);
            renderArgs.categories = [];
        }
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
    const userId = req.session.user.id;
    try {
        // Fetch all categories for the dropdown
        const categories = db.get_all_categories_flat(userId);
        console.log(`Fetching categories for edit_text dropdown for user ${userId}: ${categories.length} found.`);

        res.render('edit_text', {
            user: req.session.user, // Pass user data
            text: req.text,         // Pass the text object to pre-fill the form
            categories: categories, // Pass the flat list of categories
            error: null             // No error initially
        });
    } catch (error) {
        console.error(`Error fetching categories for edit_text page (User ${userId}, Text ${req.params.text_id}):`, error);
        // Render with an error message, but still show the text data
        res.render('edit_text', {
            user: req.session.user,
            text: req.text, // Still pass the text data
            categories: [], // Send empty array for categories
            error: 'Could not load folder list.'
        });
    }
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
    // Get updated title, content, and category_id from form body
    const { title, content, category_id } = req.body;
    // Get user ID from session
    const userId = req.session.user.id;
    // req.text (original text) is available from requireOwnership if needed, but not used here

    // Parse category_id (can be 'root' or an integer ID)
    let targetCategoryId = null; // Default to root
    if (category_id && category_id !== 'root') {
        const parsedId = parseInt(category_id, 10);
        if (!isNaN(parsedId)) {
            targetCategoryId = parsedId;
        } else {
            console.warn(`Invalid category_id received in POST /edit_text: ${category_id}`);
            // Default to root if parsing fails
        }
    }

    // Prepare arguments for re-rendering the form in case of errors
    const renderArgs = {
        user: req.session.user,
        // Pass a temporary text object with the submitted data
        text: { id: textId, title: title, content: content, category_id: targetCategoryId }, // Include category_id
        categories: [], // Need to re-fetch categories on error render
        error: null
    };


    // --- Input Validation ---
    if (!title || !content) {
        console.log(`Edit failed for text ID ${textId}: Title or content empty.`);
        renderArgs.error = 'Title and content cannot be empty.';
        // Re-fetch categories before rendering error
        try {
            renderArgs.categories = db.get_all_categories_flat(userId);
        } catch (fetchErr) {
            console.error("Error re-fetching categories for error render:", fetchErr);
            renderArgs.categories = [];
        }
        return res.render('edit_text', renderArgs);
    }

    // --- Update Database ---
    try {
        // Attempt to update the text in the database, now including category_id
        const success = db.update_text(textId, title, content, targetCategoryId);
        if (success) {
            // Success: Redirect to the folder where the text now resides
            console.log(`Text updated: ID ${textId}, Title: ${title}, User ID: ${userId}, Category: ${targetCategoryId}`);
            let redirectUrl = '/texts?message=Text updated successfully!';
            if (targetCategoryId) {
                redirectUrl += '&category_id=' + targetCategoryId;
            }
            res.redirect(redirectUrl);
        } else {
            // Database update failed (e.g., text deleted between check and update)
            console.error(`Failed to update text ID ${textId} for user ID ${userId}, Category: ${targetCategoryId}`);
            renderArgs.error = 'Failed to update text. Please try again.';
            // Re-fetch categories before rendering error
            try {
                renderArgs.categories = db.get_all_categories_flat(userId);
            } catch (fetchErr) {
                console.error("Error re-fetching categories for error render:", fetchErr);
                renderArgs.categories = [];
            }
            res.render('edit_text', renderArgs);
        }
    } catch (error) {
        // Catch unexpected errors during database operation
        console.error(`Error updating text ID ${textId} for user ID ${userId}, Category: ${targetCategoryId}:`, error);
        renderArgs.error = 'An unexpected error occurred while updating the text.';
        // Re-fetch categories before rendering error
        try {
            renderArgs.categories = db.get_all_categories_flat(userId);
        } catch (fetchErr) {
            console.error("Error re-fetching categories for error render:", fetchErr);
            renderArgs.categories = [];
        }
        res.render('edit_text', renderArgs);
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
            res.redirect('/texts?message=Text deleted successfully!'); // Redirect to the new texts page
        } else {
            // Deletion failed (e.g., text already deleted)
            console.warn(`Failed to delete text ID ${textId} for user ID ${userId} (already deleted or DB issue?)`);
            res.redirect('/texts?message=Could not delete text. It might have already been removed.'); // Redirect to the new texts page
        }
    } catch (error) {
        // Catch unexpected errors during database operation
        console.error(`Error deleting text ID ${textId} for user ID ${userId}:`, error);
        res.redirect('/texts?message=An error occurred while deleting the text.'); // Redirect to the new texts page
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
            return res.redirect('/texts?message=Text not found.'); // Redirect to the new texts page
        }

        console.log(`Rendering practice page for text ID: ${textId}, User ID: ${userId}, Progress: ${textData.progress_index}`);
        // Render the 'practice.ejs' view, passing user and the full text data (including progress)
        res.render('practice', {
            user: req.session.user,
            text: textData // Pass the object containing id, title, content, progress_index
        });

    } catch (error) {
        console.error(`Error fetching text/progress for practice page (Text ID: ${textId}, User ID: ${userId}):`, error);
        res.redirect('/texts?message=Error loading practice text.'); // Redirect to the new texts page
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

/**
 * Route: POST /update_text_order
 * Description: Updates the display order of texts for the logged-in user.
 *              Expects an 'order' array in the request body containing text IDs.
 * Middleware: Requires the user to be logged in (`requireLogin`).
 */
router.post('/update_text_order', requireLogin, (req, res) => {
    const { order } = req.body; // Array of text IDs in the new order
    const userId = req.session.user.id;

    // Basic validation
    if (!Array.isArray(order)) {
        console.error(`Update text order failed: 'order' is not an array. User ID: ${userId}, Body:`, req.body);
        return res.status(400).json({ success: false, message: 'Invalid data format.' });
    }

    try {
        // Call the database function to update the order
        const success = db.update_text_order(userId, order);
        if (success) {
            console.log(`Text order updated for user ID: ${userId}`);
            res.status(200).json({ success: true, message: 'Order updated successfully.' });
        } else {
            console.error(`Update text order DB error for user ID: ${userId}`);
            res.status(500).json({ success: false, message: 'Database error updating order.' });
        }
    } catch (error) {
        console.error(`Unexpected error updating text order for user ID: ${userId}:`, error);
        res.status(500).json({ success: false, message: 'Server error updating order.' });
    }
});


// --- Category (Folder) Management Routes ---

/**
 * Route: POST /categories
 * Description: Creates a new category (folder).
 * Middleware: requireLogin
 * Body: { name: string, parent_category_id: number|null }
 */
router.post('/categories', requireLogin, (req, res) => {
    const { name, parent_category_id } = req.body;
    const userId = req.session.user.id;
    let parentId = parent_category_id ? parseInt(parent_category_id, 10) : null;

    if (isNaN(parentId) && parent_category_id != null) { // Check if parsing failed but it wasn't explicitly null
        return res.redirect(`/texts?message=Invalid parent category ID.`);
    }
    if (!name || name.trim().length === 0) {
        return res.redirect(`/texts${parentId ? '?category_id='+parentId : ''}&message=Folder name cannot be empty.`);
    }

    try {
        // TODO: Add check to ensure parentId (if not null) belongs to the user
        const newCategoryId = db.create_category(userId, name.trim(), parentId);
        if (newCategoryId !== -1) {
            console.log(`Category created: ID ${newCategoryId}, Name "${name.trim()}", User ${userId}, Parent ${parentId}`);
            // Construct redirect URL carefully
            let redirectUrl = '/texts?message=Folder created successfully!';
            if (parentId) {
                redirectUrl += '&category_id=' + parentId;
            }
            res.redirect(redirectUrl);
        } else {
            console.warn(`Failed to create category "${name.trim()}" for user ${userId}, Parent ${parentId} (likely name conflict)`);
            // Construct redirect URL carefully
            let redirectUrl = '/texts?message=Failed to create folder. Name might already exist.';
            if (parentId) {
                redirectUrl += '&category_id=' + parentId;
            }
            res.redirect(redirectUrl);
        }
    } catch (error) {
        console.error(`Error creating category "${name.trim()}" for user ${userId}:`, error);
        // Construct redirect URL carefully
        let redirectUrl = '/texts?message=Server error creating folder.';
        if (parentId) {
            redirectUrl += '&category_id=' + parentId;
        }
        res.redirect(redirectUrl);
    }
});

/**
 * Route: POST /categories/:category_id/rename
 * Description: Renames an existing category (folder).
 * Middleware: requireLogin
 * Params: category_id
 * Body: { new_name: string }
 */
router.post('/categories/:category_id/rename', requireLogin, (req, res) => {
    const categoryId = parseInt(req.params.category_id, 10);
    const { new_name } = req.body;
    const userId = req.session.user.id;

    if (isNaN(categoryId)) {
        return res.redirect('/texts?message=Invalid category ID.');
    }
    if (!new_name || new_name.trim().length === 0) {
        // Need parent ID to redirect correctly
        // TODO: Fetch category details to get parent ID before redirecting
        return res.redirect(`/texts?message=New folder name cannot be empty.`);
    }

    try {
        // TODO: Fetch category details to get parent ID for redirect
        const success = db.rename_category(categoryId, new_name.trim(), userId);
        if (success) {
            console.log(`Category renamed: ID ${categoryId}, New Name "${new_name.trim()}", User ${userId}`);
            // TODO: Use fetched parent ID in redirect
            res.redirect(`/texts?message=Folder renamed successfully!`);
        } else {
            console.warn(`Failed to rename category ID ${categoryId} to "${new_name.trim()}" for user ${userId} (not found, not owned, or name conflict)`);
            // TODO: Use fetched parent ID in redirect
            res.redirect(`/texts?message=Failed to rename folder. Name might already exist or folder not found.`);
        }
    } catch (error) {
        console.error(`Error renaming category ID ${categoryId} for user ${userId}:`, error);
        // TODO: Use fetched parent ID in redirect
        res.redirect(`/texts?message=Server error renaming folder.`);
    }
});

/**
 * Route: POST /categories/:category_id/delete
 * Description: Deletes an empty category (folder).
 * Middleware: requireLogin
 * Params: category_id
 */
router.post('/categories/:category_id/delete', requireLogin, (req, res) => {
    const categoryId = parseInt(req.params.category_id, 10);
    const userId = req.session.user.id;

    if (isNaN(categoryId)) {
        return res.redirect('/texts?message=Invalid category ID.');
    }

    try {
        // TODO: Fetch category details to get parent ID for redirect
        const isEmpty = db.is_category_empty(categoryId, userId);
        if (!isEmpty) {
            console.warn(`Attempt to delete non-empty category ID ${categoryId} by user ${userId}`);
            // TODO: Use fetched parent ID in redirect
            return res.redirect(`/texts?message=Cannot delete folder. It is not empty.`);
        }

        const success = db.delete_category(categoryId, userId);
        if (success) {
            console.log(`Category deleted: ID ${categoryId}, User ${userId}`);
            // TODO: Use fetched parent ID in redirect
            res.redirect(`/texts?message=Folder deleted successfully!`);
        } else {
            console.warn(`Failed to delete category ID ${categoryId} for user ${userId} (not found or not owned)`);
            // TODO: Use fetched parent ID in redirect
            res.redirect(`/texts?message=Failed to delete folder. Folder not found.`);
        }
    } catch (error) {
        console.error(`Error deleting category ID ${categoryId} for user ${userId}:`, error);
        // TODO: Use fetched parent ID in redirect
        res.redirect(`/texts?message=Server error deleting folder.`);
    }
});

// --- Route for moving text removed ---


// --- Export Router ---
// Make the router object available for mounting in server.js
module.exports = router;