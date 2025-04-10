// --- Dependencies ---
const express = require('express'); // Web framework
// Middleware to parse form data (using built-in express methods now)
const session = require('express-session'); // Middleware for session management
const SQLiteStore = require('connect-sqlite3')(session); // Store sessions in SQLite
const path = require('path'); // Utility for working with file paths
const fs = require('fs'); // File system module (needed for error view check)

// --- Controller Imports ---
// Import route handlers defined in separate controller files
const authController = require('./controllers/authController'); // Handles authentication routes
const textController = require('./controllers/textController'); // Handles core text management routes (list, add, edit, delete, summarize)
const categoryController = require('./controllers/categoryController'); // Handles category (folder) routes
const practiceController = require('./controllers/practiceController'); // Handles practice session routes
const profileController = require('./controllers/profileController'); // Handles profile routes
const { router: storeRouter, storeItems } = require('./controllers/storeController'); // Import router and items
const db = require('./models/db'); // Import db for owned items check

// --- Middleware Imports ---
const { loadUserData, requireLogin } = require('./middleware/authMiddleware'); // Import requireLogin

// --- Express App Initialization ---
const app = express(); // Create an Express application instance
const port = 3000; // Define the port the server will listen on

// --- Middleware Configuration ---

// Body Parser: Parses incoming request bodies with URL-encoded payloads (form submissions)
app.use(express.urlencoded({ extended: true }));
// Body Parser: Parses incoming request bodies with JSON payloads
app.use(express.json());

// Static Files: Serve static files (like CSS, client-side JS, images) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
// Session Management: Configure session handling
app.use(
    session({
        store: new SQLiteStore({ db: 'sessions.db', dir: './models' }),
        secret: 'your secret key', // IMPORTANT: Change this in production!
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 7 * 24 * 60 * 60 * 1000, // Cookie expiration time: 1 week
        },
    })
);

// Middleware to load full user data (including coins) if logged in
app.use(loadUserData); // Makes res.locals.currentUser available in templates

// --- View Engine Setup ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Route Definitions ---

// Homepage Route
app.get('/', (req, res) => {
    res.render('index');
});

// Favicon Route
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Mount Authentication & Text Controllers
app.use('/', authController); // Handles /login, /register, /logout etc.
app.use('/', textController); // Mount text routes under root (e.g., /texts, /add_text)
app.use('/', profileController); // Mount profile routes under root (/profile)
app.use('/categories', categoryController); // Mount category routes under /categories (e.g., /categories, /categories/:id/rename)
app.use('/practice', practiceController); // Mount practice routes under /practice (e.g., /practice/:id, /practice/api/progress)

// Store Page Route (GET) - Fetch owned items and render
app.get('/store', requireLogin, (req, res) => {
    try {
        const userId = req.session.user.id;
        const ownedItems = db.get_owned_item_ids(userId); // Get a Set of owned item IDs
        // Pass both the available items and the user's owned items
        res.render('store', { storeItems, ownedItems });
    } catch (error) {
        console.error("Error loading store page:", error);
        // Handle error appropriately, maybe render store with empty owned items or an error message
        res.status(500).send("Error loading store page.");
    }
});
app.use('/store', storeRouter); // Mount the store router (for POST /store/buy etc.)

// --- Error Handling Middleware (Generic - place after all routes) ---
// Catch-all for other errors not handled by specific routes
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack || err); // Log stack trace if available
    const statusCode = err.status || 500;
    res.status(statusCode);

    // Check if the client accepts JSON
    if (req.accepts('json')) {
        // Send JSON error for API requests
        res.json({
            success: false, // Indicate failure
            message: err.message || `Server Error (${statusCode})`,
            // Optionally include stack trace in development
            error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        });
    } else {
        // Attempt to render a dedicated HTML error page for browser requests
        try {
            const errorViewPath = path.join(__dirname, 'views', 'error.ejs');
            if (fs.existsSync(errorViewPath)) {
                res.render('error', {
                    message: err.message || 'An unexpected error occurred.',
                    error: process.env.NODE_ENV === 'development' ? err : {},
                    status: statusCode,
                });
            } else {
                console.warn("Warning: 'views/error.ejs' not found. Sending plain text error.");
                res.type('text/plain').send(`Server Error (${statusCode})`);
            }
        } catch (renderError) {
            console.error('Error rendering error page:', renderError);
            res.type('text/plain').send(`Server Error (${statusCode})`);
        }
    }
});

// --- Server Start ---
// Only start listening if the script is run directly (not required by another module like tests)
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}

// --- Export App for Testing ---
module.exports = app; // Export the configured Express app
