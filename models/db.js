    // --- Dependencies ---
const Database = require('better-sqlite3'); // SQLite database driver
const path = require('path'); // Utility for working with file paths

// --- Database Connection ---
// Construct the absolute path to the database file
const dbPath = path.join(__dirname, 'typing_trainer.db');
// Create or open the SQLite database file at the specified path
const db = new Database(dbPath);
console.log(`Database connected at: ${dbPath}`);

// --- Schema Initialization ---
// Use `exec` for executing multiple SQL statements (or statements without results)
// Create the 'users' table if it doesn't already exist
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, -- Unique user ID, automatically increments
        username TEXT UNIQUE NOT NULL,        -- Username, must be unique and cannot be null
        password TEXT NOT NULL                -- Password (plain text - INSECURE, use hashing in production)
    );
`);

// Create the 'texts' table if it doesn't already exist
db.exec(`
    CREATE TABLE IF NOT EXISTS texts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, -- Unique text ID, automatically increments
        user_id INTEGER NOT NULL,             -- Foreign key linking to the user who owns the text
        category_id INTEGER,                  -- Foreign key linking to the category it belongs to (NULL if root)
        title TEXT NOT NULL,                  -- Title of the text, cannot be null
        content TEXT NOT NULL,                -- The actual text content for typing practice
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE, -- If user deleted, delete text
        FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL -- If category deleted, move text to root
    );
`);

// Create the 'user_text_progress' table to store user progress on specific texts
db.exec(`
    CREATE TABLE IF NOT EXISTS user_text_progress (
        user_id INTEGER NOT NULL,             -- Foreign key to users table
        text_id INTEGER NOT NULL,             -- Foreign key to texts table
        progress_index INTEGER DEFAULT 0,     -- Index of the next character to be typed (0-based)
        PRIMARY KEY (user_id, text_id),       -- Ensure only one progress entry per user per text
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, -- Delete progress if user is deleted
        FOREIGN KEY(text_id) REFERENCES texts(id) ON DELETE CASCADE  -- Delete progress if text is deleted
    );
`);

// Create the 'categories' table for organizing texts
db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        parent_category_id INTEGER, -- NULL for root level categories for a user (allows nesting if desired later)
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (parent_category_id) REFERENCES categories (id) ON DELETE CASCADE, -- Self-referencing for subcategories
        UNIQUE (user_id, parent_category_id, name) -- Ensure unique category names within the same parent level for a user
    );
`);

// Removed 'files' table definition.


console.log('Database tables checked/created successfully.');

// --- Database Access Functions (Model Logic) ---

/**
 * Checks if a username already exists in the 'users' table.
 * @param {string} username - The username to check.
 * @returns {boolean} - True if the username exists, false otherwise.
 */
function user_exists(username) {
    // Prepare an SQL statement for better performance and security
    const stmt = db.prepare('SELECT id FROM users WHERE username = ?');
    // Execute the statement with the provided username and get the first result
    const user = stmt.get(username);
    // Return true if a user object was found, false otherwise
    return !!user; // Convert result (object or undefined) to boolean
}

/**
 * Creates a new user in the 'users' table.
 * @param {string} username - The desired username.
 * @param {string} password - The user's password (should be hashed in a real app).
 * @returns {number} - The new user's ID if successful, or -1 if the username is taken or an error occurs.
 */
function new_user(username, password) {
    // Check if username is already taken
    if (user_exists(username)) {
        console.warn(`Attempt to create existing user: ${username}`);
        return -1; // Username already taken
    }
    // IMPORTANT: In a real application, hash the password before storing!
    const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
    try {
        // Execute the insert statement with username and password
        const info = stmt.run(username, password);
        // Return the ID of the newly inserted row
        console.log(`User created: ${username} (ID: ${info.lastInsertRowid})`);
        return info.lastInsertRowid;
    } catch (err) {
        // Log any database errors during insertion
        console.error("Error creating user:", err);
        return -1; // Indicate error
    }
}

/**
 * Attempts to log in a user by verifying username and password.
 * @param {string} username - The username provided by the user.
 * @param {string} password - The password provided by the user.
 * @returns {number} - The user's ID if credentials are correct, otherwise -1.
 */
function login(username, password) {
    // Prepare statement to select user ID and password based on username
    const stmt = db.prepare('SELECT id, password FROM users WHERE username = ?');
    // Get the user record
    const user = stmt.get(username);

    // If no user found with that username
    if (!user) {
        console.log(`Login attempt failed: User not found - ${username}`);
        return -1;
    }

    // --- INSECURE Plain Text Comparison (for demonstration only) ---
    if (user.password === password) {
        console.log(`User logged in: ${username} (ID: ${user.id})`);
        return user.id; // Correct password
    } else {
        console.log(`Login attempt failed: Incorrect password for ${username}`);
        return -1; // Incorrect password
    }
    // --- End INSECURE Comparison ---
}

/**
 * Retrieves all texts (ID and title only) belonging to a specific user.
 * @param {number} user_id - The user's ID.
 * @returns {Array<object>} - A list of the user's texts, including progress (e.g., [{ id: 1, title: 'Text A', content_length: 100, progress_index: 50 }, ...]).
 */
function get_texts(user_id) {
    // Prepare statement to select text details and join with user_text_progress
    // Calculate content length directly in the query
    const stmt = db.prepare(`
        SELECT
            t.id,
            t.title,
            LENGTH(t.content) as content_length,
            COALESCE(utp.progress_index, 0) as progress_index
        FROM texts t
        LEFT JOIN user_text_progress utp ON t.id = utp.text_id AND utp.user_id = ?
        WHERE t.user_id = ?
        ORDER BY t.title
    `);
    // Execute with user_id for the JOIN condition and the WHERE clause
    return stmt.all(user_id, user_id);
}

/**
 * Retrieves a specific text by its ID, including the current user's progress.
 * @param {number} text_id - The ID of the text to retrieve.
 * @param {number} user_id - The ID of the user requesting the text (for progress).
 * @returns {object|null} - The text object ({ id, user_id, title, content, progress_index }) or null if not found.
 */
function get_text(text_id, user_id) {
    // Prepare statement to select text details and join with user_text_progress
    const stmt = db.prepare(`
        SELECT
            t.id,
            t.user_id,
            t.title,
            t.content,
            COALESCE(utp.progress_index, 0) as progress_index
        FROM texts t
        LEFT JOIN user_text_progress utp ON t.id = utp.text_id AND utp.user_id = ?
        WHERE t.id = ?
    `);
    // Execute with user_id (for the JOIN condition) and text_id (for the WHERE clause)
    return stmt.get(user_id, text_id) || null;
}


/**
 * Adds a new text record to the 'texts' table for a specific user.
 * @param {number} user_id - The ID of the user adding the text.
 * @param {string} title - The title of the text.
 * @param {string} content - The content of the text.
 * @returns {number} - The ID of the newly added text, or -1 on error.
 */
function add_text(user_id, title, content) {
    // Prepare statement to insert a new text record
    const stmt = db.prepare('INSERT INTO texts (user_id, title, content) VALUES (?, ?, ?)');
    try {
        // Execute the insert statement
        const info = stmt.run(user_id, title, content);
        // Return the ID of the newly inserted row
        console.log(`Text added to DB: ID ${info.lastInsertRowid}, User ${user_id}`);
        return info.lastInsertRowid;
    } catch (err) {
        // Log errors during insertion
        console.error("Error adding text to DB:", err);
        return -1; // Indicate error
    }
}

/**
 * Updates the title and content of an existing text in the 'texts' table.
 * @param {number} text_id - The ID of the text to update.
 * @param {string} title - The new title.
 * @param {string} content - The new content.
 * @returns {boolean} - True if the update was successful (at least one row changed), false otherwise.
 */
function update_text(text_id, title, content) {
    // Prepare statement to update title and content for a specific text ID
    const stmt = db.prepare('UPDATE texts SET title = ?, content = ? WHERE id = ?');
    try {
        // Execute the update statement
        const info = stmt.run(title, content, text_id);
        // Return true if any rows were changed, false otherwise
        console.log(`Text updated in DB: ID ${text_id}, Changes: ${info.changes}`);
        return info.changes > 0;
    } catch (err) {
        // Log errors during update
        console.error("Error updating text in DB:", err);
        return false; // Indicate error
    }
}

/**
 * Deletes a text from the 'texts' table based on its ID.
 * @param {number} text_id - The ID of the text to delete.
 * @returns {boolean} - True if the deletion was successful (at least one row changed), false otherwise.
 */
function delete_text(text_id) {
    // Prepare statement to delete a text by its ID
    const stmt = db.prepare('DELETE FROM texts WHERE id = ?');
    try {
        // Execute the delete statement
        const info = stmt.run(text_id);
        // Return true if any rows were deleted, false otherwise
        console.log(`Text deleted from DB: ID ${text_id}, Changes: ${info.changes}`);
        return info.changes > 0;
    } catch (err) {
        // Log errors during deletion
        console.error("Error deleting text from DB:", err);
        return false; // Indicate error
    }
}

/**
 * Saves or updates the user's typing progress for a specific text.
 * Uses INSERT OR REPLACE (UPSERT) to handle both new and existing progress records.
 * @param {number} user_id - The user's ID.
 * @param {number} text_id - The text's ID.
 * @param {number} progress_index - The index of the next character to type (0-based).
 * @returns {boolean} - True if successful, false otherwise.
 */
function save_progress(user_id, text_id, progress_index) {
    // Prepare statement using INSERT ... ON CONFLICT ... DO UPDATE (UPSERT)
    const stmt = db.prepare(`
        INSERT INTO user_text_progress (user_id, text_id, progress_index)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, text_id) DO UPDATE SET progress_index = excluded.progress_index
    `);
    try {
        // Execute the UPSERT statement
        const info = stmt.run(user_id, text_id, progress_index);
        return true;
    } catch (err) {
        // Log errors during save/update
        console.error("Error saving progress:", err);
        return false; // Indicate error
    }
}


// --- Exports ---
// Make the database functions available for other modules (like controllers) to import
module.exports = {
    db, // Export db instance (use with caution, better to encapsulate all DB logic here)
    user_exists,
    new_user,
    login,
    get_texts,
    get_text,
    add_text,
    update_text,
    delete_text,
    save_progress,

    // --- Category Functions ---

    /**
     * Creates a new category for a user.
     * @param {number} user_id - The ID of the user creating the category.
     * @param {string} name - The name of the new category.
     * @param {number|null} parent_category_id - The ID of the parent category, or null for a root category.
     * @returns {number} - The ID of the newly created category, or -1 on error (e.g., name conflict).
     */
    create_category: (user_id, name, parent_category_id = null) => {
        const stmt = db.prepare(`
            INSERT INTO categories (user_id, name, parent_category_id)
            VALUES (?, ?, ?)
        `);
        try {
            const info = stmt.run(user_id, name, parent_category_id);
            console.log(`Category created: ID ${info.lastInsertRowid}, Name "${name}", User ${user_id}, Parent ${parent_category_id}`);
            return info.lastInsertRowid;
        } catch (err) {
            console.error(`Error creating category "${name}" for user ${user_id}:`, err);
            return -1;
        }
    },

    /**
     * Retrieves categories for a specific user, optionally filtered by parent category.
     * @param {number} user_id - The ID of the user.
     * @param {number|null} parent_category_id - The ID of the parent category (null for root categories).
     * @returns {Array<object>} - A list of category objects ({ id, name, parent_category_id, created_at }).
     */
    get_categories: (user_id, parent_category_id = null) => {
        let sql = 'SELECT id, name, parent_category_id, created_at FROM categories WHERE user_id = ?';
        const params = [user_id];
        if (parent_category_id === null) {
            sql += ' AND parent_category_id IS NULL';
        } else {
            sql += ' AND parent_category_id = ?';
            params.push(parent_category_id);
        }
        sql += ' ORDER BY name';
        const stmt = db.prepare(sql);
        return stmt.all(...params);
    },

     /**
     * Deletes a category record from the database.
     * Does NOT check if the category is empty. Controller should handle this.
     * @param {number} category_id - The ID of the category to delete.
     * @param {number} user_id - The ID of the user attempting deletion (for authorization).
     * @returns {boolean} - True if deletion was successful (row affected), false otherwise.
     */
    delete_category: (category_id, user_id) => {
        // Note: Texts within this category will have their category_id set to NULL due to FOREIGN KEY constraint.
        const stmt = db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?');
        try {
            const info = stmt.run(category_id, user_id);
            console.log(`Category delete attempt: ID ${category_id}, User ${user_id}, Changes: ${info.changes}`);
            return info.changes > 0;
        } catch (err) {
            console.error(`Error deleting category ID ${category_id} (User ${user_id}):`, err);
            return false;
        }
    },

    /**
     * Updates the category_id for a specific text.
     * @param {number} text_id - The ID of the text to move.
     * @param {number|null} new_category_id - The ID of the target category (or null to move to root).
     * @param {number} user_id - The ID of the user attempting the move (for authorization).
     * @returns {boolean} - True if the update was successful, false otherwise.
     */
    move_text_to_category: (text_id, new_category_id, user_id) => {
        // First, verify the user owns the text
        // Then, if moving to a category (not root), verify the user owns the target category (optional but good practice)
        // For simplicity here, we only check text ownership.
        const stmt = db.prepare('UPDATE texts SET category_id = ? WHERE id = ? AND user_id = ?');
        try {
            // TODO: Add check if new_category_id exists and belongs to user if new_category_id is not null
            const info = stmt.run(new_category_id, text_id, user_id);
            console.log(`Move text attempt: TextID ${text_id}, TargetCategoryID ${new_category_id}, User ${user_id}, Changes: ${info.changes}`);
            return info.changes > 0; // Returns true if the text was found and belonged to the user
        } catch (err) {
            console.error(`Error moving text ID ${text_id} to category ${new_category_id} for user ${user_id}:`, err);
            return false;
        }
    }
};