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
        order_index INTEGER NOT NULL DEFAULT 0, -- Display order for the user's list
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE, -- If user deleted, delete text
        FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL -- If category deleted, move text to root
    );
`); // Close the template literal and db.exec call


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


// --- Schema Migration: Add order_index to texts if it doesn't exist ---
// This should run after all initial table creations are defined.
try {
    // Check if the column already exists
    const columns = db.pragma('table_info(texts)');
    const hasOrderIndex = columns.some(col => col.name === 'order_index');

    if (!hasOrderIndex) {
        // Add the column if it doesn't exist
        db.exec(`ALTER TABLE texts ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0;`);
        console.log("Successfully added 'order_index' column to 'texts' table.");
    }
} catch (err) {
    // Log error if PRAGMA or ALTER fails, but don't necessarily stop the app
    console.error("Error checking/adding 'order_index' column:", err);
}

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
 * Retrieves texts belonging to a specific user, optionally filtered by category.
 * @param {number} user_id - The user's ID.
 * @param {number|null} [category_id=null] - The category ID to filter by. If null, fetches texts in the root (category_id IS NULL).
 * @returns {Array<object>} - A list of the user's texts in the specified category, including progress.
 */
function get_texts(user_id, category_id = null) {
    let sql = `
        SELECT
            t.id,
            t.title,
            LENGTH(t.content) as content_length,
            COALESCE(utp.progress_index, 0) as progress_index,
            t.category_id -- Include category_id for potential frontend use
        FROM texts t
        LEFT JOIN user_text_progress utp ON t.id = utp.text_id AND utp.user_id = ?
        WHERE t.user_id = ?
    `;
    const params = [user_id, user_id]; // Params for JOIN and initial WHERE

    if (category_id === null) {
        sql += ' AND t.category_id IS NULL';
    } else {
        sql += ' AND t.category_id = ?';
        params.push(category_id);
    }

    sql += ' ORDER BY t.order_index ASC, t.id ASC'; // Order by custom index, then ID

    const stmt = db.prepare(sql);
    return stmt.all(...params);
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
function add_text(user_id, title, content, category_id = null) {
    // Determine the next order_index for this user *within the target category*
    const orderStmt = db.prepare('SELECT MAX(order_index) as max_index FROM texts WHERE user_id = ? AND category_id IS ?'); // Use IS for NULL comparison
    const result = orderStmt.get(user_id, category_id);
    const next_index = (result && result.max_index !== null) ? result.max_index + 1 : 0;

    // Prepare statement to insert a new text record including the order_index and category_id
    const insertStmt = db.prepare('INSERT INTO texts (user_id, title, content, category_id, order_index) VALUES (?, ?, ?, ?, ?)');
    try {
        // Execute the insert statement
        const info = insertStmt.run(user_id, title, content, category_id, next_index);
        // Return the ID of the newly inserted row
        console.log(`Text added to DB: ID ${info.lastInsertRowid}, User ${user_id}, Category ${category_id}, OrderIndex ${next_index}`);
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

/**
 * Updates the order_index for multiple texts belonging to a user within a transaction.
 * @param {number} user_id - The ID of the user whose text order is being updated.
 * @param {Array<number>} order - An array of text IDs in the desired order.
 * @returns {boolean} - True if the transaction was successful, false otherwise.
 */
const update_text_order = db.transaction((user_id, order) => {
    // Prepare the update statement once
    const stmt = db.prepare('UPDATE texts SET order_index = ? WHERE id = ? AND user_id = ?');
    let changes = 0;
    // Loop through the provided order array
    for (let i = 0; i < order.length; i++) {
        const text_id = order[i];
        // Execute the update for each text ID with its new index (i)
        // Ensure text_id is treated as a number
        const info = stmt.run(i, Number(text_id), user_id);
        changes += info.changes;
    }
    // Optional: Check if the number of changes matches the order length for verification
    if (changes !== order.length) {
        console.warn(`Update text order warning: Expected ${order.length} changes, but got ${changes} for user ${user_id}. Some text IDs might not belong to the user or might not exist.`);
        // Decide if this should be an error or just a warning. For robustness, let's allow partial updates.
    }
    // The transaction automatically commits if no exceptions are thrown.
    // If an exception occurs, the transaction automatically rolls back.
    // We need to explicitly return true on success from the transaction function for the controller.
    return true; // Indicate success
});


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
    update_text_order, // Export the new function

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
 * Renames a category.
 * @param {number} category_id - The ID of the category to rename.
 * @param {string} new_name - The new name for the category.
 * @param {number} user_id - The ID of the user attempting the rename (for authorization).
 * @returns {boolean} - True if rename was successful, false otherwise (e.g., name conflict, not found, not owned).
 */
rename_category: (category_id, new_name, user_id) => {
    // Need to check for name conflicts within the same parent category first
    const checkStmt = db.prepare(`
        SELECT c2.id
        FROM categories c1
        LEFT JOIN categories c2 ON c1.user_id = c2.user_id AND COALESCE(c1.parent_category_id, -1) = COALESCE(c2.parent_category_id, -1) AND c2.name = ? AND c2.id != ?
        WHERE c1.id = ? AND c1.user_id = ?
    `);
    const conflict = checkStmt.get(new_name, category_id, category_id, user_id);

    if (conflict) {
        console.warn(`Rename category failed: Name conflict for "${new_name}" (Category ID: ${category_id}, User ID: ${user_id})`);
        return false; // Name conflict exists at the same level
    }

    // Proceed with rename if no conflict
    const stmt = db.prepare('UPDATE categories SET name = ? WHERE id = ? AND user_id = ?');
    try {
        const info = stmt.run(new_name, category_id, user_id);
        console.log(`Category rename attempt: ID ${category_id}, New Name "${new_name}", User ${user_id}, Changes: ${info.changes}`);
        return info.changes > 0;
    } catch (err) {
        // This catch block might be redundant if the UNIQUE constraint handles it, but good for other errors.
         if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
             console.warn(`Rename category failed due to UNIQUE constraint: Name "${new_name}" likely exists. (Category ID: ${category_id}, User ID: ${user_id})`);
         } else {
            console.error(`Error renaming category ID ${category_id} to "${new_name}" (User ${user_id}):`, err);
         }
        return false;
    }
},

/**
 * Checks if a category is empty (contains no texts and no subcategories).
 * @param {number} category_id - The ID of the category to check.
 * @param {number} user_id - The ID of the user (for authorization).
 * @returns {boolean} - True if the category is empty, false otherwise or if not found/owned.
 */
is_category_empty: (category_id, user_id) => {
    // Check for texts in this category
    const textStmt = db.prepare('SELECT 1 FROM texts WHERE category_id = ? AND user_id = ? LIMIT 1');
    const hasText = textStmt.get(category_id, user_id);
    if (hasText) {
        return false; // Contains texts
    }

    // Check for subcategories in this category
    const subCatStmt = db.prepare('SELECT 1 FROM categories WHERE parent_category_id = ? AND user_id = ? LIMIT 1');
    const hasSubCategory = subCatStmt.get(category_id, user_id);
    if (hasSubCategory) {
        return false; // Contains subcategories
    }

    // Optional: Verify the category actually exists and belongs to the user before declaring it empty
    const categoryExistsStmt = db.prepare('SELECT 1 FROM categories WHERE id = ? AND user_id = ? LIMIT 1');
    const categoryExists = categoryExistsStmt.get(category_id, user_id);
    if (!categoryExists) {
        console.warn(`is_category_empty check failed: Category ID ${category_id} not found or not owned by User ID ${user_id}`);
        return false; // Category doesn't exist or isn't owned, so can't be considered "empty" in this context
    }

    return true; // No texts and no subcategories found, and category exists/is owned
},

// move_text_to_category function removed

/**
 * Retrieves all categories for a user as a flat list, indicating hierarchy.
 * Uses a recursive Common Table Expression (CTE) for efficiency.
 * @param {number} user_id - The ID of the user.
 * @returns {Array<object>} - A flat list of category objects ({ id, name, level, path_name }).
 */
get_all_categories_flat: (user_id) => {
    const stmt = db.prepare(`
        WITH RECURSIVE category_path (id, name, parent_category_id, level, path_name) AS (
            SELECT
                id,
                name,
                parent_category_id,
                0 as level,
                name as path_name
            FROM categories
            WHERE parent_category_id IS NULL AND user_id = ?
            UNION ALL
            SELECT
                c.id,
                c.name,
                c.parent_category_id,
                cp.level + 1,
                cp.path_name || ' / ' || c.name
            FROM categories c
            JOIN category_path cp ON c.parent_category_id = cp.id
            WHERE c.user_id = ? -- Ensure we only join user's categories
        )
        SELECT id, name, level, path_name FROM category_path ORDER BY path_name;
    `);
    try {
        // Pass user_id twice: once for the anchor part, once for the recursive part
        return stmt.all(user_id, user_id);
    } catch (err) {
        console.error(`Error fetching all categories flat for user ${user_id}:`, err);
        return []; // Return empty array on error
    }
}
};