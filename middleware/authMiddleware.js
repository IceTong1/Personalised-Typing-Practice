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
    }

    // User is not authenticated
    if (process.env.NODE_ENV === 'development') {
        console.log('Access denied: User not logged in.');
    }

    // Check if the client accepts JSON
    if (req.accepts('json')) {
        // Send JSON error for API requests
        return res.status(401).json({ message: 'Authentication required. Please log in.' });
    } else {
        // Redirect browser requests to the login page
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
    // Use req.params.id if available (for summarize route), fallback to text_id
    const textId = req.params.id || req.params.text_id;
    const userId = req.session.user ? req.session.user.id : null;

    // Should already be caught by requireLogin, but good for defense
    if (!userId) {
        if (process.env.NODE_ENV === 'development') {
            console.log(`Ownership check failed: No user ID in session for text ID ${textId}`);
        }
        // Check if the client accepts JSON
        if (req.accepts('json')) {
            return res.status(401).json({ message: 'Authentication required. Please log in.' });
        } else {
            return res.redirect('/login?message=Please log in');
        }
    }

    try {
        const text = db.get_text(textId);

        if (!text) {
            if (process.env.NODE_ENV === 'development') {
                console.log(`Ownership check failed: Text not found for ID ${textId}`);
            }
            if (req.accepts('json')) {
                 return res.status(404).json({ message: 'Text not found.' });
            } else {
                // Redirect browser requests
                return res.status(404).redirect('/profile?message=Text not found');
            }
        }

        if (text.user_id !== userId) {
            if (process.env.NODE_ENV === 'development') {
                console.log(`Ownership check failed: User ID ${userId} does not own text ID ${textId} (Owner: ${text.user_id})`);
            }
             if (req.accepts('json')) {
                 return res.status(403).json({ message: 'Permission denied. You do not own this text.' });
            } else {
                // Redirect browser requests
                return res.status(403).redirect('/profile?message=You do not have permission to access this text');
            }
        }

        // Attach text to request object for convenience in subsequent handlers
        req.text = text;
        // Log the category_id found in the middleware
        if (process.env.NODE_ENV === 'development')
            console.log(
                `Ownership check passed: User ID ${userId} owns text ID ${textId}. Text category_id: ${text?.category_id}`
            );
        next(); // User owns the text, proceed
    } catch (error) {
        console.error(
            `Error during ownership check for text ID ${textId}:`,
            error
        );
        if (req.accepts('json')) {
            return res.status(500).json({ message: 'An internal error occurred while verifying text ownership.' });
        } else {
            // Redirect browser requests
            return res.status(500).redirect('/profile?message=An error occurred while verifying text ownership');
        }
    }
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

module.exports = {
    requireLogin,
    requireOwnership,
    redirectIfLoggedIn, // Export the new middleware
};
