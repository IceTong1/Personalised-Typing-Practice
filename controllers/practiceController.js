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

    // Fetch text data *including* user progress
    const textData = db.get_text(textId, userId); // Use original get_text

    // Render the 'practice.ejs' view, passing user and the full text data (including progress)
    res.render('practice', {
        user: req.session.user,
        text: textData, // Pass the object containing id, title, content, progress_index
    });
     
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

    
    // Convert to numbers just in case they came as strings
    const textIdNum = parseInt(text_id, 10); // Already has radix 10
    const progressIndexNum = parseInt(progress_index, 10); // Already has radix 10

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
    }    
);

/**
 * API Route: POST /practice/line-complete
 * Description: Increments user coins and updates incremental statistics (time, accuracy) after a line is completed.
 * Middleware: requireLogin
 * Request Body: { line_time_seconds: number, line_accuracy: number }
 * Response:
 *  - 200 OK: { success: true, newCoinCount: number }
 *  - 400 Bad Request: { success: false, message: string } (for invalid input)
 *  - 500 Internal Server Error: { success: false, message: string }
 */
router.post('/line-complete', requireLogin, (req, res) => {
    // Changed path
    console.log('--- Reached /practice/api/line-complete endpoint ---');
    const userId = req.session.user.id;
    const { line_time_seconds, line_accuracy } = req.body;

    // --- Validate Input ---
    if (line_time_seconds === undefined || line_accuracy === undefined) {
        console.error(
            `Line complete failed: Missing time or accuracy. Body:`,
            req.body,
            `User: ${userId}`
        );
        return res.status(400).json({
            success: false,
            message: 'Missing required line statistics data.',
        });
    }
    const timeSecondsNum = parseFloat(line_time_seconds);
    const accuracyNum = parseFloat(line_accuracy);

    if (
        Number.isNaN(timeSecondsNum) ||
        Number.isNaN(accuracyNum) ||
        timeSecondsNum < 0 ||
        accuracyNum < 0 ||
        accuracyNum > 100
    ) {
        console.error(
            `Line complete failed: Invalid data types or values. Body:`,
            req.body,
            `User: ${userId}`
        );
        return res.status(400).json({
            success: false,
            message: 'Invalid line statistics data provided.',
        });
    }

    try {
        // --- Update Stats Incrementally ---
        const statsUpdateSuccess = db.update_user_stats(
            userId,
            timeSecondsNum,
            accuracyNum
        );
        if (!statsUpdateSuccess) {
            // Log the error but proceed to coin increment, as stats update failure might not be critical for user experience
            console.error(
                `API (/line-complete): Failed to update incremental stats for user ${userId}. Proceeding with coin increment.`
            );
        } else if (process.env.NODE_ENV === 'development') {
            console.log(
                `API (/line-complete): Incremental stats updated for user ${userId}. Time: ${timeSecondsNum}s, Accuracy: ${accuracyNum}%`
            );
        }

        // --- Increment Coins ---
        const coinIncrementSuccess = db.increment_user_coins(userId, 1); // Increment by 1 coin

        if (coinIncrementSuccess) {
            // Fetch the updated coin count to send back
            const userDetails = db.get_user_details(userId);
            const newCoinCount = userDetails ? userDetails.coins : null;

            if (newCoinCount !== null) {
                if (process.env.NODE_ENV === 'development') {
                    console.log(
                        `API (/line-complete): Awarded 1 coin to user ${userId}. New total: ${newCoinCount}`
                    );
                }
                res.status(200).json({
                    success: true,
                    newCoinCount,
                });
            } else {
                console.error(
                    `API (/line-complete): Failed to fetch updated coin count for user ${userId} after increment.`
                );
                // Still return success=true as the increment likely worked, but indicate count fetch issue
                res.status(200).json({ success: true, newCoinCount: null }); // Indicate success but null count
            }
        } else {
            console.error(
                `API (/line-complete): Failed to increment coins in DB for user ${userId}.`
            );
            // Even if coin increment fails, the stats might have updated. Send 500 but maybe client can handle?
            res.status(500).json({
                success: false,
                message: 'Failed to update coin count.',
            });
        }
    } catch (error) {
        console.error(`API Error in /line-complete for user ${userId}:`, error); // Updated log message
        res.status(500).json({
            success: false,
            message: 'An unexpected error occurred.',
        });
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
router.post('/penalty', requireLogin, (req, res) => {
    // Corrected path
    const userId = req.session.user.id;
    const penaltyAmount = 1; // Decrement by 1 coin per 10 errors
    const success = db.decrement_user_coins(userId, penaltyAmount);

    if (success) {
        // Fetch the updated coin count to send back
        const userDetails = db.get_user_details(userId);
        const newCoinCount = userDetails ? userDetails.coins : null;
        res.status(200).json({ success: true, newCoinCount });
    } else {
        // Decrement failed - likely because coins were already 0
        if (process.env.NODE_ENV === 'development') {
            console.log(
                `API (/penalty): Failed to apply penalty to user ${userId} (likely coins already 0).`
            ); // Updated log message
        }
        // Decrement failed, assume coins are 0.
        const currentCoinCount = 0;
        // Send 400 Bad Request
        res.status(400).json({
            success: false,
            message: 'Cannot apply penalty, coins already zero.',
            currentCoinCount,
        });
    
        } 
});

/**
 * API Route: POST /api/complete
 * Description: Records the completion of a practice session by incrementing the texts_practiced count.
 * Middleware: requireLogin
 * Request Body: { text_id: number }
 * Response:
 *  - 200 OK: { success: true }
 *  - 400 Bad Request: { success: false, message: string }
 *  - 500 Internal Server Error: { success: false, message: string }
 */
router.post('/api/complete', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const { text_id } = req.body; // Only need text_id now


    
    // Call the DB function to increment the texts practiced count
    const success = db.increment_texts_practiced(userId);

    if (success) {
        res.status(200).json({ success: true });
    } else {
        console.error(
            `Practice complete DB error: Failed to increment texts_practiced for User ${userId}, Text ${textIdNum}`
        );
        res.status(500).json({
            success: false,
            message: 'Database error incrementing texts practiced count.',
            });
        }
    } 
);

// --- Export Router ---
module.exports = router;
