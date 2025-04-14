// --- Dependencies ---
const express = require('express');

const router = express.Router(); // Create a new router object
// const multer = require('multer'); // No longer needed at top level? Let's re-add it.
const multer = require('multer'); // Ensure multer is required before use
// const pdfParse = require('pdf-parse'); // No longer needed (using pdftotext)
// const { URLSearchParams } = require('url'); // No longer needed here, moved to urlUtils
const { GoogleGenerativeAI } = require('@google/generative-ai'); // Added for Gemini
require('dotenv').config(); // Added to load .env variables
const {
    requireLogin,
    requireOwnership,
} = require('../middleware/authMiddleware'); // Import authentication middleware
const db = require('../models/db'); // Import database functions from the model
const { cleanupText, processPdfUpload } = require('../utils/textProcessing'); // Import text utils
const { buildRedirectUrl } = require('../utils/urlUtils'); // Import URL utils

// --- Gemini AI Client Initialization ---
// Ensure GEMINI_API_KEY is set in your .env file
const genAI = process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;
const geminiModel = genAI
    ? genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' })
    : null;

if (!genAI) {
    console.warn(
        'GEMINI_API_KEY not found in .env file. AI summarization feature will be disabled.'
    );
}

/**
 * Route: GET /texts
 * Description: Displays the user's texts page, showing a list of their saved texts.
 * Middleware: Requires the user to be logged in (`requireLogin`).
 */
router.get('/texts', requireLogin, (req, res) => {
    
    const userId = req.session.user.id;
    // Get current category ID from query param, default to null (root)
    // Ensure it's either null or a valid integer
    let currentCategoryId = req.query.category_id
        ? parseInt(req.query.category_id, 10) // Already has radix 10
        : null;

    // Fetch categories within the current category (subfolders)
    const categories = db.get_categories(userId, currentCategoryId);

    // Fetch texts within the current category
    const texts = db.get_texts(userId, currentCategoryId);

    // TODO: Fetch breadcrumbs if currentCategoryId is not null (requires recursive DB query or logic)
    const breadcrumbs = []; // Placeholder for now

    // Fetch all categories flat list for the "Move" dropdown
    const allCategoriesFlat = db.get_all_categories_flat(userId);

    res.render('texts', {
        user: req.session.user,
        texts,
        categories,
        currentCategoryId, // Pass the current category ID to the view
        breadcrumbs, // Pass breadcrumbs
        message: req.query.message || null,
        allCategoriesFlat, // Pass the flat list for the move dropdown
    });

});

/**
 * Route: GET /add_text
 * Description: Displays the form for adding a new text.
 * Middleware: Requires the user to be logged in (`requireLogin`).
 */
router.get('/add_text', requireLogin, (req, res) => {
    const userId = req.session.user.id; // Moved outside try block
    
    // Fetch all categories for the dropdown
    const categories = db.get_all_categories_flat(userId);

    // Get potential folderId from query parameters to pre-select dropdown
    const requestedFolderId = req.query.folderId;
    let selectedFolderId = null;
    if (requestedFolderId) {
        const parsedId = parseInt(requestedFolderId, 10);
        if (!Number.isNaN(parsedId)) {
            selectedFolderId = parsedId;
        }
    }

    // Render the 'add_text.ejs' view
    res.render('add_text', {
        user: req.session.user, // Pass user data
        error: null, // No error initially
        title: '', // Empty title for new text
        content: '', // Empty content for new text
        categories, // Pass the flat list of categories
        selectedFolderId, // Pass the ID for pre-selection
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
// Define file filter here, just before it's used in the route below
const pdfFileFilter = (req, file, cb) => {
    // Function to control which files are accepted
    if (file.mimetype === 'application/pdf') {
        cb(null, true); // Accept the file if it's a PDF
    } else {
        // Reject the file if it's not a PDF, passing an error message
        cb(new Error('Only PDF files are allowed!'), false);
    }
};
router.post(
    '/add_text',
    requireLogin,
    // Define and use multer middleware inline
    multer({
        storage: multer.memoryStorage(),
        fileFilter: pdfFileFilter,
    }).single('pdfFile'),
    async (req, res) => {
        // Extract title from form body
        // Extract title, content, and category_id from form body
        const { title, category_id } = req.body;
        const { content } = req.body; // Content from textarea
        const userId = req.session.user.id; // User ID from session

        // Parse category_id (can be 'root' or an integer ID)
        let targetCategoryId = null; // Default to root
        if (category_id && category_id !== 'root') {
            const parsedId = parseInt(category_id, 10); // Already has radix 10
            if (!Number.isNaN(parsedId)) {
                targetCategoryId = parsedId;
            } else {
                // Handle invalid category ID if necessary, maybe return error
                console.warn(
                    `Invalid category_id received in POST /add_text: ${category_id}`
                );
                // For now, let's default to root if parsing fails
            }
        }
        // Get uploaded file info from multer (will be undefined if no file uploaded)
        const uploadedFile = req.file;

        // Prepare arguments for rendering the form again in case of errors
        const renderArgs = {
            user: req.session.user,
            title, // Keep submitted title
            content, // Keep submitted content
            categories: [], // Need to re-fetch categories on error render
        };

        // --- Input Validation ---
        if (!title) {
            renderArgs.error = 'Title cannot be empty.';
            return res.render('add_text', renderArgs);
        }
        // Must provide either text content OR a PDF file
        if (!uploadedFile && !content) {
            renderArgs.error =
                'Please provide text content or upload a PDF file.';
            return res.render('add_text', renderArgs);
        }
        // Cannot provide both text content AND a PDF file
        if (uploadedFile && content) {
            renderArgs.error =
                'Please provide text content OR upload a PDF, not both.';
            return res.render('add_text', renderArgs);
        }

        // --- Process Input (PDF or Textarea) ---
        try {
            let textToSave = content; // Default to textarea content

            // If a file was uploaded, process it using pdftotext

            // If a file was uploaded, process it using the helper function
            if (uploadedFile) {
                try {
                    // Assign the result to the existing textToSave variable
                    textToSave = await processPdfUpload(uploadedFile);
                } catch (pdfError) {
                    // Handle errors from PDF processing
                    renderArgs.error = pdfError.message; // Use the error message from the helper
                    // Re-fetch categories before rendering error
                    try {
                        renderArgs.categories =
                            db.get_all_categories_flat(userId);
                    } catch (fetchErr) {
                        console.error(
                            'Error re-fetching categories for PDF error render:',
                            fetchErr
                        );
                        renderArgs.categories = []; // Default to empty if fetch fails
                    }
                    return res.render('add_text', renderArgs);
                }
            }

            // --- Apply Common Text Cleanup (using function defined at module level) ---
            // Apply cleanup to the text regardless of source (PDF or textarea)
            // Make sure textToSave is not null/undefined before cleaning
            const finalContentToSave = cleanupText(textToSave || '');

            // --- Save to Database ---
            // Ensure we don't try to save completely empty content after cleanup if it wasn't intended
            // (Re-check validation logic - maybe empty content is allowed?)
            // Assuming empty content IS allowed if explicitly entered or extracted:
            // --- Save to Database ---
            // Pass the targetCategoryId to the updated db.add_text function
            const newTextId = db.add_text(
                userId,
                title,
                finalContentToSave,
                targetCategoryId
            );
            if (newTextId !== -1) {
                // Success: Redirect to the folder where the text was added
                if (process.env.NODE_ENV === 'development')
                    console.log(
                        `Text added: ID ${newTextId}, Title: ${title}, User ID: ${userId}, Category: ${targetCategoryId} (Source: ${uploadedFile ? 'PDF' : 'Textarea'}), Final Length: ${finalContentToSave.length}`
                    );
                let redirectUrl = '/texts?message=Text added successfully!';
                if (targetCategoryId) {
                    redirectUrl += `&category_id=${targetCategoryId}`;
                }
                res.redirect(redirectUrl);
            } else {
                // Database insertion failed
                console.error(
                    `Failed to add text to DB for user ID: ${userId}, Category: ${targetCategoryId}`
                );
                // Re-fetch categories before rendering error
                try {
                    renderArgs.categories = db.get_all_categories_flat(userId);
                } catch (fetchErr) {
                    console.error(
                        'Error re-fetching categories for error render:',
                        fetchErr
                    );
                    renderArgs.categories = [];
                }
                renderArgs.error =
                    'Failed to save text to the database. Please try again.';
                res.render('add_text', renderArgs); // Re-render form with error
            }
        } catch (error) {
            // Catch any other unexpected errors during the process
            console.error('Unexpected error adding text:', error);
            renderArgs.error =
                'An unexpected error occurred while adding the text.';
            // Re-fetch categories before rendering error
            try {
                renderArgs.categories = db.get_all_categories_flat(userId);
            } catch (fetchErr) {
                console.error(
                    'Error re-fetching categories for error render:',
                    fetchErr
                );
                renderArgs.categories = [];
            }
            res.render('add_text', renderArgs); // Re-render form with error
        }
    }
);

/**
 * Route: GET /edit_text/:text_id
 * Description: Displays the form for editing an existing text.
 * Middleware:
 *   - `requireLogin`: Ensures user is logged in.
 *   - `requireOwnership`: Ensures the logged-in user owns the text specified by `:text_id`.
 *                         Attaches the fetched text object to `req.text`.
 */
router.get(
    '/edit_text/:text_id',
    requireLogin,
    requireOwnership,
    (req, res) => {
        // The text object (req.text) is guaranteed to exist and belong to the user
        // due to the requireOwnership middleware succeeding.
        const userId = req.session.user.id;
        
        // Fetch all categories for the dropdown
        const categories = db.get_all_categories_flat(userId);

        res.render('edit_text', {
            user: req.session.user, // Pass user data
            text: req.text, // Pass the text object to pre-fill the form
            categories, // Pass the flat list of categories
            error: null, // No error initially
        });
    }
);

/**
 * Route: POST /edit_text/:text_id
 * Description: Handles the submission of the edit text form.
 * Middleware:
 *   - `requireLogin`: Ensures user is logged in.
 *   - `requireOwnership`: Ensures the logged-in user owns the text specified by `:text_id`.
 */
router.post(
    '/edit_text/:text_id',
    requireLogin,
    requireOwnership,
    (req, res) => {
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
            const parsedId = parseInt(category_id, 10); // Already has radix 10
            if (!Number.isNaN(parsedId))
                targetCategoryId = parsedId;  
        }

        // --- Update Database ---
        
        // Clean the content before saving
        const cleanedContent = cleanupText(content);
        // Attempt to update the text in the database, now including category_id
        const success = db.update_text(
            textId,
            title,
            cleanedContent,
            targetCategoryId
        );
        if (success) {
            // Success: Redirect to the folder where the text now resides
            let redirectUrl = '/texts?message=Text updated successfully!';
            if (targetCategoryId) {
                redirectUrl += `&category_id=${targetCategoryId}`;
            }
            res.redirect(redirectUrl);
        }   
    }
);

/**
 * Route: POST /texts/summarize/:id
 * Description: Summarizes a given text using AI and saves it as a new text.
 * Middleware: requireLogin, requireOwnership (to ensure user owns the text being summarized)
 */
router.post(
    '/texts/summarize/:id',
    requireLogin,
    requireOwnership,
    async (req, res) => {
        if (!geminiModel) {
            return res.status(503).json({
                message:
                    'AI Service is not configured or unavailable. Missing API Key.',
            });
        }

        try {
            const originalTextId = req.params.id; // Renamed from text_id for clarity
            const userId = req.session.user.id;

            // req.text is populated by requireOwnership middleware
            const originalText = req.text;

            if (!originalText) {
                // This case should ideally be caught by requireOwnership, but double-check
                return res.status(404).json({
                    message: 'Original text not found or not owned by user.',
                });
            }

            if (
                !originalText.content ||
                originalText.content.trim().length === 0
            ) {
                return res
                    .status(400)
                    .json({ message: 'Cannot summarize empty text.' });
            }

            const prompt = `Detect the language of the following text and provide a detailed summary (in that same language):\n\n---\n${originalText.content}\n---`;

            if (process.env.NODE_ENV === 'development') {
                console.log(
                    `Sending prompt to Gemini for text ID ${originalTextId} (first 100 chars): ${prompt.substring(0, 100)}...`
                );
            }

            const result = await geminiModel.generateContent(prompt);
            const response = await result.response;
            const summaryContent = response.text();

            if (!summaryContent) {
                console.error(
                    `Gemini API did not return content for text ID: ${originalTextId}`
                );
                throw new Error('AI did not return a summary.');
            }

            if (process.env.NODE_ENV === 'development') {
                console.log(
                    `Received summary from Gemini (first 100 chars): ${summaryContent.substring(0, 100)}...`
                );
            }

            // Create a new text entry for the summary
            // Save in the same category as the original text
            const newTextId = db.add_text(
                userId,
                `Summary of: ${originalText.title}`,
                summaryContent.trim(), // Trim the summary content
                originalText.category_id // Save summary in the same folder as the original
            );

            if (newTextId === -1) {
                console.error(
                    `Failed to save summary to DB for original text ID: ${originalTextId}, User ID: ${userId}`
                );
                throw new Error('Failed to save the summary to the database.');
            }

            const newTextTitle = `Summary of: ${originalText.title}`; // Get the title for the response
            if (process.env.NODE_ENV === 'development') {
                console.log(
                    `Summary saved as new text ID: ${newTextId}, Title: ${newTextTitle}`
                );
            }

            res.status(201).json({
                message: 'Summary created successfully',
                newTextId,
                newTextTitle,
            });
        } catch (error) {
            console.error(`Error summarizing text ID ${req.params.id}:`, error);
            let errorMessage =
                'Failed to summarize text due to an internal error.';
            let statusCode = 500;

            if (error.message.includes('AI did not return')) {
                errorMessage = error.message;
                statusCode = 502; // Bad Gateway (issue communicating with AI)
            } else if (
                error.message.includes('FETCH_ERROR') ||
                error.message.includes(
                    'request to https://generativelanguage.googleapis.com failed'
                )
            ) {
                errorMessage = 'Network error communicating with AI service.';
                statusCode = 504; // Gateway Timeout
            } else if (error.message.includes('API key not valid')) {
                errorMessage = 'AI Service Error: Invalid API Key.';
                statusCode = 503; // Service Unavailable (config issue)
            } else if (error.message.includes('Failed to save the summary')) {
                errorMessage = error.message;
                statusCode = 500; // Internal DB error
            }
            // Consider more specific error handling based on AI API responses if needed

            res.status(statusCode).json({
                message: errorMessage,
                details: error.message,
            });
        }
    }
);

/**
 * Route: POST /delete_text/:text_id
 * Description: Handles the deletion of a text.
 * Middleware:
 *   - `requireLogin`: Ensures user is logged in.
 *   - `requireOwnership`: Ensures the logged-in user owns the text specified by `:text_id`.
 */
router.post(
    '/delete_text/:text_id',
    requireLogin,
    requireOwnership,
    (req, res) => {
        // Get text ID from URL parameters
        const textId = req.params.text_id;
        // Get user ID from session
        const userId = req.session.user.id;

        // --- Delete from Database ---
        // Define parentCategoryId outside the try block to ensure it's available in catch
        let parentCategoryId = null;
        
        // Get the parent category ID *before* deleting, for redirection
        parentCategoryId = req.text ? req.text.category_id : null;
        

        // Attempt to delete the text
        const success = db.delete_text(textId);
        if (success) {
            // Success: Redirect back to the folder
            res.redirect(
                buildRedirectUrl('/texts', {
                    message: 'Text deleted successfully!',
                    category_id: parentCategoryId,
                })
            );
        } 
    }
);

/**
 * Route: POST /update_text_order
 * Description: Updates the display order of texts for the logged-in user.
 *              Expects an 'order' array in the request body containing text IDs.
 * Middleware: Requires the user to be logged in (`requireLogin`).
 */
router.post('/update_text_order', requireLogin, (req, res) => {
    const { order } = req.body; // Array of text IDs in the new order
    const userId = req.session.user.id;

    // Call the database function to update the order
    const success = db.update_text_order(userId, order);
    if (success) {
        res.status(200).json({
            success: true,
            message: 'Order updated successfully.',
        });
    } 
});


// --- Export Router ---
// Make the router object available for mounting in server.js
module.exports = router;
