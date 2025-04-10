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
            
            // This block was incorrectly placed here by the previous diff. Removing it.
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

/**
 * API Route: POST /practice/line-complete
 * Description: Increments the user's coin count when a line is successfully completed.
 * Middleware: requireLogin
 * Request Body: (None needed, user ID comes from session)
 * Response:
 *  - 200 OK: { success: true, newCoinCount: number }
 *  - 500 Internal Server Error: { success: false, message: string }
 */
router.post('/line-complete', requireLogin, (req, res) => { // Changed path
    console.log('--- Reached /practice/api/line-complete endpoint ---'); // Add entry log
    const userId = req.session.user.id;

    try {
        const success = db.increment_user_coins(userId, 1); // Increment by 1 coin

        if (success) {
            // Fetch the updated coin count to send back
            const userDetails = db.get_user_details(userId);
            const newCoinCount = userDetails ? userDetails.coins : null; // Handle case where user details might fail to fetch immediately

            if (newCoinCount !== null) {
                 if (process.env.NODE_ENV === 'development') {
                    console.log(`API (/line-complete): Awarded 1 coin to user ${userId}. New total: ${newCoinCount}`); // Updated log message
                 }
                res.status(200).json({ success: true, newCoinCount: newCoinCount });
            } else {
                 console.error(`API (/line-complete): Failed to fetch updated coin count for user ${userId} after increment.`); // Updated log message
                 // Still return success=true as the increment likely worked, but indicate count fetch issue
                 res.status(200).json({ success: true, newCoinCount: null });
            }
        } else {
            console.error(`API (/line-complete): Failed to increment coins in DB for user ${userId}.`); // Updated log message
            res.status(500).json({ success: false, message: 'Failed to update coin count.' });
        }
    } catch (error) {
        console.error(`API Error in /line-complete for user ${userId}:`, error); // Updated log message
        res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
    }
});

/**
 * API Route: POST /practice/penalty
 * Description: Decrements the user's coin count due to accumulated errors.
 * Middleware: requireLogin
 * Request Body: (None needed, user ID comes from session)
 * Response:
 *  - 200 OK: { success: true, newCoinCount: number | null } (null if count couldn't be fetched after decrement)
 *  - 400 Bad Request: { success: false, message: string } (e.g., if coins already 0)
 *  - 500 Internal Server Error: { success: false, message: string }
 */
router.post('/penalty', requireLogin, (req, res) => { // Corrected path
    const userId = req.session.user.id;
    const penaltyAmount = 1; // Decrement by 1 coin per 10 errors

    console.log(`--- Reached /practice/penalty endpoint for user ${userId} ---`); // Updated log message

    try {
        const success = db.decrement_user_coins(userId, penaltyAmount);

        if (success) {
            // Fetch the updated coin count to send back
            const userDetails = db.get_user_details(userId);
            const newCoinCount = userDetails ? userDetails.coins : null;

            if (process.env.NODE_ENV === 'development') {
                console.log(`API (/penalty): Applied penalty of ${penaltyAmount} coin(s) to user ${userId}. New total: ${newCoinCount ?? 'N/A'}`); // Updated log message
            }
            res.status(200).json({ success: true, newCoinCount: newCoinCount });

        } else {
            // Decrement failed - likely because coins were already 0
             if (process.env.NODE_ENV === 'development') {
                console.log(`API (/penalty): Failed to apply penalty to user ${userId} (likely coins already 0).`); // Updated log message
            }
            // Decrement failed, assume coins are 0.
            const currentCoinCount = 0;
            // Send 400 Bad Request
            res.status(400).json({ success: false, message: 'Cannot apply penalty, coins already zero.', currentCoinCount: currentCoinCount });
        }
    } catch (error) {
        console.error(`API Error in /penalty for user ${userId}:`, error); // Updated log message
        res.status(500).json({ success: false, message: 'An unexpected error occurred while applying penalty.' });
    }
});


// --- Export Router ---
module.exports = router;