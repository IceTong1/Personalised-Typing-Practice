// --- Dependencies ---
const db = require('../models/db'); // Import database functions

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
    }

    // Check if the client accepts JSON
    if (req.accepts('json')) {
        // Send JSON error for API requests
        return res
            .status(401)
            .json({ message: 'Authentication required. Please log in.' });
    }
    // Redirect browser requests to the login page
    return res.redirect('/login');
}

/**
 * Middleware: requireOwnership
 * Description: Checks if the currently logged-in user owns the text specified by `req.params.text_id`.
 *              MUST be used *after* `requireLogin` in the route definition.
 *              If ownership is verified, attaches the fetched text object to `req.text` and calls `next()`.
 *              If not logged in, text not found, or user doesn't own text, redirects with an appropriate status/message.
 */
function requireOwnership(req, res, next) {
    // Use req.params.id if available (for summarize route), fallback to text_id
    const textId = req.params.id || req.params.text_id;
    const userId = req.session.user ? req.session.user.id : null;
    const text = db.get_text(textId);

    if (!text) {
        if (process.env.NODE_ENV === 'development') {
            console.log(
                `Ownership check failed: Text not found for ID ${textId}`
            );
        }
        if (req.accepts('json')) {
            return res.status(404).json({ message: 'Text not found.' });
        }
        // Redirect browser requests
        return res.status(404).redirect('/profile?message=Text not found');
    }

    if (text.user_id !== userId) {
        if (process.env.NODE_ENV === 'development') {
            console.log(
                `Ownership check failed: User ID ${userId} does not own text ID ${textId} (Owner: ${text.user_id})`
            );
        }
        if (req.accepts('json')) {
            return res.status(403).json({
                message: 'Permission denied. You do not own this text.',
            });
        }
        // Redirect browser requests
        return res
            .status(403)
            .redirect(
                '/profile?message=You do not have permission to access this text'
            );
    }

    // Attach text to request object for convenience in subsequent handlers
    req.text = text;
    
    next(); // User owns the text, proceed
}

/**
 * Middleware: redirectIfLoggedIn
 * Description: Checks if a user is already logged in.
 *              If logged in, redirects to the `/profile` page.
 *              If not logged in, calls `next()` to proceed.
 */
function redirectIfLoggedIn(req, res, next) {
    if (req.session && req.session.user) {
        if (process.env.NODE_ENV === 'development')
            console.log('User already logged in, redirecting to profile.');
        return res.redirect('/profile');
    }
    // User is not logged in, allow request to proceed
    next();
}

/**
 * Middleware: loadUserData
 * Description: If a user is logged in (req.session.user exists), fetches their full details
 *              (including coins) from the database and attaches them to res.locals.currentUser.
 *              This makes the user data available in all EJS templates for logged-in users.
 */
function loadUserData(req, res, next) {
    if (req.session && req.session.user && req.session.user.id) {
        const userDetails = db.get_user_details(req.session.user.id);
        if (userDetails) {
            res.locals.currentUser = userDetails; // Attach full user details
        } 
    } else {
        // No user logged in, ensure currentUser is null
        res.locals.currentUser = null;
    }
    next(); // Always call next()
}

module.exports = {
    requireLogin,
    requireOwnership,
    redirectIfLoggedIn,
    loadUserData, // Export the new middleware
};
