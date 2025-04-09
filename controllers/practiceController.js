// --- Dependencies ---
const express = require('express');

const router = express.Router(); // Create a new router object
const {
    requireLogin,
    requireOwnership,
} = require('../middleware/authMiddleware'); // Import authentication middleware
const db = require('../models/db'); // Import database functions from the model

// --- Practice Routes ---

/**
 * Route: GET /:text_id
 * Description: Displays the typing practice page for a specific text. Corresponds to GET /practice/:text_id in original file.
 * Middleware:
 *   - `requireLogin`: Ensures user is logged in.
 *   - `requireOwnership`: Ensures the logged-in user owns the text specified by `:text_id`.
 *                         Attaches the fetched text object to `req.text`.
 */
router.get('/:text_id', requireLogin, requireOwnership, (req, res) => {
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
            console.error(
                `Text not found in GET /practice/:text_id even after ownership check? ID: ${textId}`
            );
            return res.redirect('/texts?message=Text not found.'); // Redirect to the texts page
        }

        if (process.env.NODE_ENV === 'development')
            console.log(
                `Rendering practice page for text ID: ${textId}, User ID: ${userId}, Progress: ${textData.progress_index}`
            );
        // Render the 'practice.ejs' view, passing user and the full text data (including progress)
        res.render('practice', {
            user: req.session.user,
            text: textData, // Pass the object containing id, title, content, progress_index
        });
    } catch (error) {
        console.error(
            `Error fetching text/progress for practice page (Text ID: ${textId}, User ID: ${userId}):`,
            error
        );
        res.redirect('/texts?message=Error loading practice text.'); // Redirect to the texts page
    }
});

/**
 * Route: POST /api/progress
 * Description: Saves the user's typing progress for a specific text. Corresponds to POST /api/progress in original file.
 *              Expects 'text_id' and 'progress_index' in the request body.
 * Middleware: Requires the user to be logged in (`requireLogin`).
 */
router.post('/api/progress', requireLogin, (req, res) => {
    // Global bodyParser.json() middleware in server.js already handles parsing
    const { text_id, progress_index } = req.body;
    const user_id = req.session.user.id;

    // Basic validation
    if (text_id === undefined || progress_index === undefined) {
        console.error(
            `Save progress failed: Missing text_id or progress_index. Body:`,
            req.body
        );
        return res
            .status(400)
            .json({ success: false, message: 'Missing required data.' });
    }

    // Convert to numbers just in case they came as strings
    const textIdNum = parseInt(text_id, 10); // Already has radix 10
    const progressIndexNum = parseInt(progress_index, 10); // Already has radix 10

    if (
        Number.isNaN(textIdNum) ||
        Number.isNaN(progressIndexNum) ||
        progressIndexNum < 0
    ) {
        console.error(
            `Save progress failed: Invalid data types or negative index. text_id: ${text_id}, progress_index: ${progress_index}`
        );
        return res
            .status(400)
            .json({ success: false, message: 'Invalid data.' });
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
            console.error(
                `Save progress DB error: User ${user_id}, Text ${textIdNum}`
            );
            res.status(500).json({
                success: false,
                message: 'Database error saving progress.',
            });
        }
    } catch (error) {
        console.error(
            `Unexpected error saving progress: User ${user_id}, Text ${textIdNum}:`,
            error
        );
        res.status(500).json({
            success: false,
            message: 'Server error saving progress.',
        });
    }
});

// --- Export Router ---
module.exports = router;