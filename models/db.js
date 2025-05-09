// --- Dependencies ---
const Database = require('better-sqlite3'); // SQLite database driver
const path = require('path'); // Utility for working with file paths
const bcrypt = require('bcrypt');
// Library for password hashing
const saltRounds = 10; // Cost factor for bcrypt hashing

// --- Database Connection ---
// Construct the absolute path to the database file
const dbPath = path.join(__dirname, 'typing_trainer.db');
// Create or open the SQLite database file at the specified path
const db = new Database(dbPath);


// --- Schema Initialization ---
// Use `exec` for executing multiple SQL statements (or statements without results)
// Create the 'users' table if it doesn't already exist
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, -- Unique user ID, automatically increments
        username TEXT UNIQUE NOT NULL,        -- Username, must be unique and cannot be null
        password TEXT NOT NULL,               -- Hashed password
        coins INTEGER NOT NULL DEFAULT 0      -- Number of coins the user has
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

// Create the 'user_owned_items' table to track items owned by users
db.exec(`
    CREATE TABLE IF NOT EXISTS user_owned_items (
        user_id INTEGER NOT NULL,             -- Foreign key to users table
        item_id TEXT NOT NULL,                -- Identifier for the item (e.g., 'car', 'house')
        quantity INTEGER NOT NULL DEFAULT 1,  -- How many of this item the user owns
        acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- When the item was first acquired
        PRIMARY KEY (user_id, item_id),       -- Ensure user owns each item type at most once (or track quantity)
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE -- If user deleted, remove their items
        -- No foreign key for item_id yet, as items aren't in their own table
    );
`);

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
    // Hash the password before storing
    const hashedPassword = bcrypt.hashSync(password, saltRounds);
    const stmt = db.prepare(
        'INSERT INTO users (username, password) VALUES (?, ?)'
    );
    try {
        // Execute the insert statement with username and password
        const info = stmt.run(username, hashedPassword);
        // Return the ID of the newly inserted row
        if (process.env.NODE_ENV === 'development')
            console.log(
                `User created: ${username} (ID: ${info.lastInsertRowid})`
            );
        return info.lastInsertRowid;
    } catch (err) {
        // Log any database errors during insertion
        console.error('Error creating user:', err);
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
    const stmt = db.prepare(
        'SELECT id, password FROM users WHERE username = ?'
    );
    // Get the user record
    const user = stmt.get(username);

    // If no user found with that username
    if (!user) {
        console.log(`Login attempt failed: User not found - ${username}`);
        return -1;
    }

    // Compare the provided password with the stored hash
    const match = bcrypt.compareSync(password, user.password); // user.password is the hash from DB

    if (match) {
        if (process.env.NODE_ENV === 'development')
            console.log(`User logged in: ${username} (ID: ${user.id})`);
        return user.id; // Passwords match
    }
    console.log(`Login attempt failed: Incorrect password for ${username}`);
    return -1; // Passwords don't match
}

/**
 * Retrieves detailed information for a specific user.
 * @param {number} user_id - The user's ID.
 * @returns {object|null} - User object { id, username, coins } or null if not found.
 */
function get_user_details(user_id) {
    const stmt = db.prepare(
        'SELECT id, username, coins FROM users WHERE id = ?'
    );
    return stmt.get(user_id) || null;
}

/**
 * Increments the coin count for a specific user.
 * @param {number} user_id - The ID of the user whose coins to increment.
 * @param {number} amount - The amount to increment by (usually 1).
 * @returns {boolean} - True if the update was successful (at least one row changed), false otherwise.
 */
function increment_user_coins(user_id, amount = 1) {
    const stmt = db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?');
    try {
        const info = stmt.run(amount, user_id);
        if (process.env.NODE_ENV === 'development' && info.changes > 0) {
            console.log(
                `Incremented coins by ${amount} for user ID ${user_id}.`
            );
        }
        return info.changes > 0;
    } catch (err) {
        console.error(`Error incrementing coins for user ID ${user_id}:`, err);
        return false;
    }
}

/**
 * Decrements the coin count for a specific user, ensuring it doesn't go below zero.
 * @param {number} user_id - The ID of the user whose coins to decrement.
 * @param {number} amount - The positive amount to decrement by (usually 1).
 * @returns {boolean} - True if the update was successful (at least one row changed), false otherwise (e.g., user not found, already 0 coins).
 */
function decrement_user_coins(user_id, amount = 1) {
    // Ensure amount is positive
    if (amount <= 0) {
        console.warn(
            `Attempted to decrement coins by non-positive amount (${amount}) for user ${user_id}.`
        );
        return false;
    }
    // Use MAX(0, coins - ?) to prevent going below zero
    // Ensure the user has enough coins *before* attempting the update
    const stmt = db.prepare(
        'UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?'
    );
    try {
        const info = stmt.run(amount, user_id, amount); // Pass amount twice: once for SET, once for WHERE
        if (process.env.NODE_ENV === 'development' && info.changes > 0) {
            console.log(
                `Decremented coins by ${amount} for user ID ${user_id}.`
            );
        } else if (
            process.env.NODE_ENV === 'development' &&
            info.changes === 0
        ) {
            console.log(
                `Attempted to decrement coins for user ID ${user_id}, but coins were already 0 or user not found.`
            );
        }
        return info.changes > 0;
    } catch (err) {
        console.error(`Error decrementing coins for user ID ${user_id}:`, err);
        return false;
    }
}

// Removed duplicate function definition

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
            t.category_id, -- Added category_id
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
    const orderStmt = db.prepare(
        'SELECT MAX(order_index) as max_index FROM texts WHERE user_id = ? AND category_id IS ?'
    ); // Use IS for NULL comparison
    const result = orderStmt.get(user_id, category_id);
    const next_index =
        result && result.max_index !== null ? result.max_index + 1 : 0;

    // Prepare statement to insert a new text record including the order_index and category_id
    const insertStmt = db.prepare(
        'INSERT INTO texts (user_id, title, content, category_id, order_index) VALUES (?, ?, ?, ?, ?)'
    );
    try {
        // Execute the insert statement
        const info = insertStmt.run(
            user_id,
            title,
            content,
            category_id,
            next_index
        );
        // Return the ID of the newly inserted row
        if (process.env.NODE_ENV === 'development')
            console.log(
                `Text added to DB: ID ${info.lastInsertRowid}, User ${user_id}, Category ${category_id}, OrderIndex ${next_index}`
            );
        return info.lastInsertRowid;
    } catch (err) {
        // Log errors during insertion
        console.error('Error adding text to DB:', err);
        return -1; // Indicate error
    }
}

/**
 * Updates the title, content, and category of an existing text in the 'texts' table.
 * @param {number} text_id - The ID of the text to update.
 * @param {string} title - The new title.
 * @param {string} content - The new content.
 * @param {number|null} category_id - The new category ID (or null for root).
 * @returns {boolean} - True if the update was successful (at least one row changed), false otherwise.
 */
function update_text(text_id, title, content, category_id = null) {
    // Prepare statement to update title, content, and category_id for a specific text ID
    // Use `category_id = ?` which handles NULL correctly if category_id is null
    const stmt = db.prepare(
        'UPDATE texts SET title = ?, content = ?, category_id = ? WHERE id = ?'
    );
    try {
        // Execute the update statement with the new category_id
        const info = stmt.run(title, content, category_id, text_id);
        // Return true if any rows were changed, false otherwise
        if (process.env.NODE_ENV === 'development')
            console.log(
                `Text updated in DB: ID ${text_id}, Category ${category_id}, Changes: ${info.changes}`
            );
        return info.changes > 0;
    } catch (err) {
        // Log errors during update
        console.error('Error updating text in DB:', err);
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
        if (process.env.NODE_ENV === 'development')
            console.log(
                `Text deleted from DB: ID ${text_id}, Changes: ${info.changes}`
            );
        return info.changes > 0;
    } catch (err) {
        // Log errors during deletion
        console.error('Error deleting text from DB:', err);
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
        stmt.run(user_id, text_id, progress_index); // Execute the UPSERT statement
        return true;
    } catch (err) {
        // Log errors during save/update
        console.error('Error saving progress:', err);
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
    const stmt = db.prepare(
        'UPDATE texts SET order_index = ? WHERE id = ? AND user_id = ?'
    );
    let changes = 0;
    // Loop through the provided order array
    for (let i = 0; i < order.length; i++) {
        const text_id = order[i];
        // Execute the update for each text ID with its new index (i)
        // Ensure text_id is treated as a number
        // Execute the update for each text ID with its new index (i)
        // Ensure text_id is treated as a number
        const runInfo = stmt.run(i, Number(text_id), user_id);
        changes += runInfo.changes; // Correctly use runInfo.changes
    }
    // Optional: Check if the number of changes matches the order length for verification
    if (changes !== order.length) {
        console.warn(
            `Update text order warning: Expected ${order.length} changes, but got ${changes} for user ${user_id}. Some text IDs might not belong to the user or might not exist.`
        );
        // Decide if this should be an error or just a warning. For robustness, let's allow partial updates.
    }
    // The transaction automatically commits if no exceptions are thrown.
    // If an exception occurs, the transaction automatically rolls back.
    // We need to explicitly return true on success from the transaction function for the controller.
    return true; // Indicate success
});

/**
 * Checks if a user already owns a specific item.
 * @param {number} user_id - The user's ID.
 * @param {string} item_id - The ID of the item to check.
 * @returns {boolean} - True if the user owns the item, false otherwise.
 */
function check_item_ownership(user_id, item_id) {
    const stmt = db.prepare(
        'SELECT 1 FROM user_owned_items WHERE user_id = ? AND item_id = ?'
    );
    const result = stmt.get(user_id, item_id);
    return !!result; // Returns true if a row is found, false otherwise
}

/**
 * Adds an item to a user's owned items list.
 * Uses INSERT OR IGNORE to prevent errors if the user already owns the item.
 * Assumes quantity is always 1 for new acquisitions.
 * @param {number} user_id - The user's ID.
 * @param {string} item_id - The ID of the item being added.
 * @returns {boolean} - True if the insert was potentially successful (or ignored), false on error.
 */
function add_owned_item(user_id, item_id) {
    try {
        // 1. Check if the user already owns the item
        const alreadyOwns = check_item_ownership(user_id, item_id);

        if (alreadyOwns) {
            if (process.env.NODE_ENV === 'development') {
                console.log(
                    `User ID ${user_id} already owns item '${item_id}'. No insert needed.`
                );
            }
            return true; // Indicate success (state is correct: user owns item)
        }

        // 2. If not owned, insert the item
        const insertStmt = db.prepare(`
            INSERT INTO user_owned_items (user_id, item_id, quantity)
            VALUES (?, ?, ?)
        `);
        const info = insertStmt.run(user_id, item_id, 1); // Provide all three values

        if (process.env.NODE_ENV === 'development') {
            console.log(
                `Item '${item_id}' inserted for user ID ${user_id}. Changes: ${info.changes}`
            );
        }

        return info.changes > 0; // Return true if insert succeeded
    } catch (err) {
        console.error(
            `Error in add_owned_item for user ID ${user_id}, item '${item_id}':`,
            err
        );
        return false; // Indicate failure
    }
}

/**
 * Retrieves a list of item IDs owned by a specific user.
 * @param {number} user_id - The user's ID.
 * @returns {Set<string>} - A Set containing the item_id strings owned by the user.
 */
function get_owned_item_ids(user_id) {
    const stmt = db.prepare(
        'SELECT item_id FROM user_owned_items WHERE user_id = ?'
    );
    try {
        const rows = stmt.all(user_id);
        // Return a Set for efficient lookups (e.g., ownedItems.has('car'))
        return new Set(rows.map((row) => row.item_id));
    } catch (err) {
        console.error(
            `Error fetching owned items for user ID ${user_id}:`,
            err
        );
        return new Set(); // Return empty set on error
    }
}

/**
 * Retrieves statistics for a specific user.
 * @param {number} user_id - The user's ID.
 * @returns {object} - An object containing user stats { texts_practiced, total_practice_time_seconds, average_accuracy } or default values if no stats exist.
 */
function get_user_stats(user_id) {
    const stmt = db.prepare('SELECT * FROM user_stats WHERE user_id = ?');
    const stats = stmt.get(user_id);

    if (stats) {
        // Calculate average accuracy, handle division by zero
        const average_accuracy =
            stats.accuracy_entries_count > 0
                ? stats.total_accuracy_points / stats.accuracy_entries_count
                : 0;
        return {
            texts_practiced: stats.texts_practiced,
            total_practice_time_seconds: stats.total_practice_time_seconds,
            average_accuracy,
        };
    }
    // Return default stats if no record found
    return {
        texts_practiced: 0,
        total_practice_time_seconds: 0,
        average_accuracy: 0,
    };
}

/**
 * Updates user time and accuracy statistics incrementally after completing a line/block.
 * Uses UPSERT to create a stats row if one doesn't exist for the user.
 * Does NOT increment texts_practiced.
 * @param {number} user_id - The user's ID.
 * @param {number} time_increment_seconds - The time spent on the completed line/block (in seconds).
 * @param {number} line_accuracy - The accuracy achieved for the completed line/block (e.g., 95.5).
 * @returns {boolean} - True if the update/insert was successful, false otherwise.
 */
function update_user_stats(user_id, time_increment_seconds, line_accuracy) {
    // Ensure accuracy is a number and within valid range
    const numericAccuracy = Number(line_accuracy);
    if (
        Number.isNaN(numericAccuracy) ||
        numericAccuracy < 0 ||
        numericAccuracy > 100
    ) {
        console.error(
            `Invalid line_accuracy value provided for user ${user_id}: ${line_accuracy}`
        );
        return false;
    }
    // Ensure time is a non-negative number
    const numericTime = Number(time_increment_seconds);
    if (Number.isNaN(numericTime) || numericTime < 0) {
        console.error(
            `Invalid time_increment_seconds value provided for user ${user_id}: ${time_increment_seconds}`
        );
        return false;
    }

    const stmt = db.prepare(`
        INSERT INTO user_stats (user_id, texts_practiced, total_practice_time_seconds, total_accuracy_points, accuracy_entries_count)
        VALUES (?, 0, ?, ?, 1) -- Initial values: 0 texts practiced, add first time/accuracy entry
        ON CONFLICT(user_id) DO UPDATE SET
            total_practice_time_seconds = total_practice_time_seconds + excluded.total_practice_time_seconds,
            total_accuracy_points = total_accuracy_points + excluded.total_accuracy_points,
            accuracy_entries_count = accuracy_entries_count + 1
            -- Note: texts_practiced is NOT updated here
    `);
    try {
        // Round the time increment to the nearest second before saving
        const roundedTimeIncrement = Math.round(numericTime);
        // Pass user_id, roundedTimeIncrement, and numericAccuracy for both INSERT and potential UPDATE parts
        stmt.run(user_id, roundedTimeIncrement, numericAccuracy);
        if (process.env.NODE_ENV === 'development') {
            console.log(
                `Incrementally updated stats for user ID ${user_id}: time +${roundedTimeIncrement}s (rounded from ${numericTime.toFixed(2)}s), accuracy ${numericAccuracy}%`
            );
        }
        return true;
    } catch (err) {
        console.error(
            `Error incrementally updating stats for user ID ${user_id}:`,
            err
        );
        return false;
    }
}

/**
 * Increments the texts_practiced count for a user.
 * Uses UPSERT to handle cases where the user might not have stats yet.
 * @param {number} user_id - The user's ID.
 * @returns {boolean} - True if successful, false otherwise.
 */
function increment_texts_practiced(user_id) {
    const stmt = db.prepare(`
        INSERT INTO user_stats (user_id, texts_practiced, total_practice_time_seconds, total_accuracy_points, accuracy_entries_count)
        VALUES (?, 1, 0, 0, 0) -- Initial values if no record exists
        ON CONFLICT(user_id) DO UPDATE SET
            texts_practiced = texts_practiced + 1
    `);
    try {
        stmt.run(user_id);
        if (process.env.NODE_ENV === 'development') {
            console.log(`Incremented texts_practiced for user ID ${user_id}`);
        }
        return true;
    } catch (err) {
        console.error(
            `Error incrementing texts_practiced for user ID ${user_id}:`,
            err
        );
        return false;
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
    update_text_order,
    get_user_details,
    increment_user_coins,
    decrement_user_coins,
    check_item_ownership,
    add_owned_item,
    get_owned_item_ids, // Export the new function
    get_user_stats, // Export the stats getter
    update_user_stats, // Export the incremental stats updater
    increment_texts_practiced, // Export the text count incrementer
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
            if (process.env.NODE_ENV === 'development')
                console.log(
                    `Category created: ID ${info.lastInsertRowid}, Name "${name}", User ${user_id}, Parent ${parent_category_id}`
                );
            return info.lastInsertRowid;
        } catch (err) {
            console.error(
                `Error creating category "${name}" for user ${user_id}:`,
                err
            );
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
        let sql =
            'SELECT id, name, parent_category_id, created_at FROM categories WHERE user_id = ?';
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
     * Retrieves details for a single category.
     * @param {number} category_id - The ID of the category.
     * @param {number} user_id - The ID of the user (for authorization).
     * @returns {object|null} - The category object or null if not found/owned.
     */
    get_category: (category_id, user_id) => {
        const stmt = db.prepare(
            'SELECT id, name, parent_category_id, created_at FROM categories WHERE id = ? AND user_id = ?'
        );
        return stmt.get(category_id, user_id) || null;
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
        const stmt = db.prepare(
            'DELETE FROM categories WHERE id = ? AND user_id = ?'
        );
        try {
            const info = stmt.run(category_id, user_id);
            if (process.env.NODE_ENV === 'development')
                console.log(
                    `Category delete attempt: ID ${category_id}, User ${user_id}, Changes: ${info.changes}`
                );
            return info.changes > 0;
        } catch (err) {
            console.error(
                `Error deleting category ID ${category_id} (User ${user_id}):`,
                err
            );
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
        // 1. Get the parent ID of the category being renamed
        const getParentStmt = db.prepare(
            'SELECT parent_category_id FROM categories WHERE id = ? AND user_id = ?'
        );
        const categoryInfo = getParentStmt.get(category_id, user_id);

        if (!categoryInfo) {
            console.warn(
                `Rename category failed: Category ID ${category_id} not found or not owned by User ID ${user_id}`
            );
            return false; // Category not found or not owned
        }
        const parentId = categoryInfo.parent_category_id; // This can be null

        // 2. Check for name conflicts within the same parent category (case-sensitive)
        let checkConflictSql = `
        SELECT id FROM categories
        WHERE user_id = ?
          AND name = ? COLLATE BINARY
          AND id != ?
    `;
        const params = [user_id, new_name, category_id];

        if (parentId === null) {
            checkConflictSql += ' AND parent_category_id IS NULL';
        } else {
            checkConflictSql += ' AND parent_category_id = ?';
            params.push(parentId);
        }
        const checkConflictStmt = db.prepare(checkConflictSql);
        const conflict = checkConflictStmt.get(...params);

        if (conflict) {
            console.warn(
                `Rename category failed: Name conflict for "${new_name}" within parent ${parentId} (Category ID: ${category_id}, User ID: ${user_id})`
            );
            return false; // Name conflict exists at the same level
        }

        // Proceed with rename if no conflict
        const stmt = db.prepare(
            'UPDATE categories SET name = ? WHERE id = ? AND user_id = ?'
        );
        try {
            const info = stmt.run(new_name, category_id, user_id);
            if (process.env.NODE_ENV === 'development')
                console.log(
                    `Category rename attempt: ID ${category_id}, New Name "${new_name}", User ${user_id}, Changes: ${info.changes}`
                );
            // Return true if rows were changed OR if the only error was a UNIQUE constraint violation
            // (because our pre-check should have already validated the case-sensitive uniqueness)
            return info.changes > 0;
        } catch (err) {
            if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                // Pre-check passed, but constraint failed (likely due to case-insensitivity). Treat as success.
                console.warn(
                    `Rename category (ID ${category_id}, User ${user_id}) to "${new_name}" triggered UNIQUE constraint, but pre-check passed. Overriding as success.`
                );
                return true; // Override: Consider it successful as the case-sensitive check passed.
            }
            console.error(
                `Error renaming category ID ${category_id} to "${new_name}" (User ${user_id}):`,
                err
            );

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
        const textStmt = db.prepare(
            'SELECT 1 FROM texts WHERE category_id = ? AND user_id = ? LIMIT 1'
        );
        const hasText = textStmt.get(category_id, user_id);
        if (hasText) {
            return false; // Contains texts
        }

        // Check for subcategories in this category
        const subCatStmt = db.prepare(
            'SELECT 1 FROM categories WHERE parent_category_id = ? AND user_id = ? LIMIT 1'
        );
        const hasSubCategory = subCatStmt.get(category_id, user_id);
        if (hasSubCategory) {
            return false; // Contains subcategories
        }

        // Optional: Verify the category actually exists and belongs to the user before declaring it empty
        const categoryExistsStmt = db.prepare(
            'SELECT 1 FROM categories WHERE id = ? AND user_id = ? LIMIT 1'
        );
        const categoryExists = categoryExistsStmt.get(category_id, user_id);
        if (!categoryExists) {
            console.warn(
                `is_category_empty check failed: Category ID ${category_id} not found or not owned by User ID ${user_id}`
            );
            return false; // Category doesn't exist or isn't owned, so can't be considered "empty" in this context
        }

        return true; // No texts and no subcategories found, and category exists/is owned
    },

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
            console.error(
                `Error fetching all categories flat for user ${user_id}:`,
                err
            );
            return []; // Return empty array on error
        }
    },
};
