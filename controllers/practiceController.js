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

    console.log(
        `--- Reached /practice/penalty endpoint for user ${userId} ---`
    ); // Updated log message

    try {
        const success = db.decrement_user_coins(userId, penaltyAmount);

        if (success) {
            // Fetch the updated coin count to send back
            const userDetails = db.get_user_details(userId);
            const newCoinCount = userDetails ? userDetails.coins : null;

            if (process.env.NODE_ENV === 'development') {
                console.log(
                    `API (/penalty): Applied penalty of ${penaltyAmount} coin(s) to user ${userId}. New total: ${newCoinCount ?? 'N/A'}`
                ); // Updated log message
            }
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
    } catch (error) {
        console.error(`API Error in /penalty for user ${userId}:`, error); // Updated log message
        res.status(500).json({
            success: false,
            message: 'An unexpected error occurred while applying penalty.',
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

    // Basic validation
    if (text_id === undefined) {
        console.error(
            `Practice complete failed: Missing text_id. Body:`,
            req.body,
            `User: ${userId}`
        );
        return res
            .status(400)
            .json({ success: false, message: 'Missing required text_id.' });
    }

    // Type validation
    const textIdNum = parseInt(text_id, 10);
    if (Number.isNaN(textIdNum)) {
        console.error(
            `Practice complete failed: Invalid text_id. Body:`,
            req.body,
            `User: ${userId}`
        );
        return res
            .status(400)
            .json({ success: false, message: 'Invalid text_id provided.' });
    }

    try {
        // Call the DB function to increment the texts practiced count
        const success = db.increment_texts_practiced(userId);

        if (success) {
            if (process.env.NODE_ENV === 'development') {
                console.log(
                    `Practice complete recorded (texts_practiced incremented) for User ${userId}, Text ${textIdNum}.`
                );
            }
            // Optionally: Reset progress for this text upon completion?
            // db.save_progress(userId, textIdNum, 0); // Uncomment to reset progress

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
    } catch (error) {
        console.error(
            `Unexpected error recording practice completion for User ${userId}, Text ${textIdNum}:`,
            error
        );
        res.status(500).json({
            success: false,
            message: 'Server error recording completion.',
        });
    }
});

// --- Export Router ---
module.exports = router;
