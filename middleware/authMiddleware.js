// --- Dependencies ---
const db = require('../models/db'); // Import database functions to check text ownership

// --- Middleware Functions ---

/**
 * Middleware: requireLogin
 * Description: Checks if a user is logged in by verifying `req.session.user`.
 *              If logged in, calls `next()` to proceed to the next middleware/route handler.
 *              If not logged in, redirects the user to the `/login` page.
 */
function requireLogin(req, res, next) {
    // Check if session exists and contains user information
    if (req.session && req.session.user) {
        // User is authenticated, allow request to proceed
        return next();
    } else {
        // User is not authenticated, deny access and redirect
        console.log('Access denied: User not logged in. Redirecting to /login');
        return res.redirect('/login');
    }
}


/**
 * Middleware: requireOwnership
 * Description: Checks if the currently logged-in user owns the text specified by `req.params.text_id`.
 *              MUST be used *after* `requireLogin` in the route definition.
 *              If ownership is verified, attaches the fetched text object to `req.text` and calls `next()`.
 *              If not logged in, text not found, or user doesn't own text, redirects with an appropriate status/message.
 */
function requireOwnership(req, res, next) {
    const textId = req.params.text_id;
    const userId = req.session.user ? req.session.user.id : null;

    // Should already be caught by requireLogin, but good for defense
    if (!userId) {
        console.log(`Ownership check failed: No user ID in session for text ID ${textId}`);
        return res.status(401).redirect('/login?message=Please log in');
    }

    try {
        const text = db.get_text(textId);

        if (!text) {
            console.log(`Ownership check failed: Text not found for ID ${textId}`);
            // Redirect to profile with an error message might be friendlier
            return res.status(404).redirect('/profile?message=Text not found');
        }

        if (text.user_id !== userId) {
            console.log(`Ownership check failed: User ID ${userId} does not own text ID ${textId} (Owner: ${text.user_id})`);
            // Redirect to profile with an error message
            return res.status(403).redirect('/profile?message=You do not have permission to access this text');
        }

        // Attach text to request object for convenience in subsequent handlers
        req.text = text;
        console.log(`Ownership check passed: User ID ${userId} owns text ID ${textId}`);
        next(); // User owns the text, proceed
    } catch (error) {
        console.error(`Error during ownership check for text ID ${textId}:`, error);
        return res.status(500).redirect('/profile?message=An error occurred while verifying text ownership');
    }
}


module.exports = {
    requireLogin,
    requireOwnership // Export the middleware
};