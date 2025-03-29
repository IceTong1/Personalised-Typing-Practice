// --- Dependencies ---
const express = require('express');
const router = express.Router(); // Create a new router object to handle requests
const db = require('../models/db'); // Import database access functions from the model

// --- Authentication Routes ---

/**
 * Route: GET /login
 * Description: Displays the login page.
 * Redirects: To /profile if the user is already logged in.
 */
router.get('/login', (req, res) => {
    // Check if user information already exists in the session
    if (req.session.user) {
        console.log('User already logged in, redirecting to profile.');
        return res.redirect('/profile'); // Redirect logged-in users away from login page
    }
    // Render the login view ('login.ejs')
    // Pass 'error: null' initially and 'user: null' for the header partial
    res.render('login', { error: null, user: null });
});

/**
 * Route: POST /login
 * Description: Handles the login form submission. Authenticates the user.
 * Redirects: To /profile on successful login, back to /login with error on failure.
 */
router.post('/login', (req, res) => {
    // Extract username and password from the request body (form data)
    const { username, password } = req.body;
    // Attempt to log in using the database function
    const userId = db.login(username, password);

    // Check if login was successful (db.login returns user ID or -1)
    if (userId !== -1) {
        // Login successful: Store user ID and username in the session object
        req.session.user = { id: userId, username: username };
        console.log(`User logged in: ${username} (ID: ${userId})`);
        // Redirect the user to their profile page
        res.redirect('/profile');
    } else {
        // Login failed: Log the attempt and re-render the login page with an error message
        console.log(`Login failed for user: ${username}`);
        res.render('login', { error: 'Invalid username or password.', user: null });
    }
});

/**
 * Route: GET /register
 * Description: Displays the user registration page.
 * Redirects: To /profile if the user is already logged in.
 */
router.get('/register', (req, res) => {
    // Redirect logged-in users away from registration page
    if (req.session.user) {
        console.log('User already logged in, redirecting to profile.');
        return res.redirect('/profile');
    }
    // Render the registration view ('register.ejs')
    res.render('register', { error: null, user: null });
});

/**
 * Route: POST /register
 * Description: Handles the registration form submission. Creates a new user.
 * Redirects: To /profile on successful registration, back to /register with error on failure.
 */
router.post('/register', (req, res) => {
    // Extract registration details from the request body
    const { username, password, confirmPassword } = req.body;

    // --- Input Validation ---
    // Check if passwords match
    if (password !== confirmPassword) {
        console.log(`Registration failed for ${username}: Passwords do not match.`);
        return res.render('register', { error: 'Passwords do not match.', user: null });
    }

    // Check if username is already taken
    if (db.user_exists(username)) {
        console.log(`Registration failed for ${username}: Username already taken.`);
        return res.render('register', { error: 'Username already taken.', user: null });
    }

    // Basic check for empty username or password
    if (!username || !password) {
         console.log(`Registration failed: Username or password empty.`);
         return res.render('register', { error: 'Username and password are required.', user: null });
    }
    // --- End Validation ---

    // Attempt to create the new user in the database
    const newUserId = db.new_user(username, password);

    // Check if user creation was successful
    if (newUserId !== -1) {
        // Success: Automatically log in the new user by setting session data
        req.session.user = { id: newUserId, username: username };
        console.log(`User registered and logged in: ${username} (ID: ${newUserId})`);
        // Redirect to the profile page
        res.redirect('/profile');
    } else {
        // Failure: Log the error and re-render registration page with a generic error
        // This case might happen due to rare database errors or race conditions.
        console.error(`Registration failed unexpectedly for user: ${username}`);
        res.render('register', { error: 'Registration failed. Please try again.', user: null });
    }
});

/**
 * Route: GET /logout
 * Description: Logs the user out by destroying their session.
 * Redirects: To the homepage ('/').
 */
router.get('/logout', (req, res) => {
    // Destroy the current session
    req.session.destroy(err => {
        if (err) {
            // Log error if session destruction fails
            console.error("Error destroying session:", err);
            // Redirect to homepage even if there's an error destroying session
            return res.redirect('/');
        }
        // Log successful logout and redirect to homepage
        console.log('User logged out');
        res.redirect('/');
    });
});

// --- Export Router ---
// Make the router object available for mounting in server.js
module.exports = router;