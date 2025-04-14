// --- Dependencies ---
const express = require('express');

const router = express.Router(); // Create a new router object
const { requireLogin } = require('../middleware/authMiddleware'); // Import authentication middleware
const db = require('../models/db'); // Import database functions from the model
const { buildRedirectUrl } = require('../utils/urlUtils'); // Import URL utils

// --- Category (Folder) Management Routes ---

/**
 * Route: POST /
 * Description: Creates a new category (folder). Corresponds to POST /categories in original file.
 * Middleware: requireLogin
 * Body: { name: string, parent_category_id: number|null }
 */
router.post('/', requireLogin, (req, res) => {
    const { name, parent_category_id } = req.body;
    const userId = req.session.user.id;
    const parentId = parent_category_id
        ? parseInt(parent_category_id, 10)
        : null;

    if (Number.isNaN(parentId) && parent_category_id != null) {
        // Check if parsing failed but it wasn't explicitly null
        return res.redirect(
            buildRedirectUrl('/texts', {
                message: 'Invalid parent category ID.',
            })
        );
    }
    if (!name || name.trim().length === 0) {
        return res.redirect(
            buildRedirectUrl('/texts', {
                message: 'Folder name cannot be empty.',
                category_id: parentId,
            })
        );
    }

    try {
        // TODO: Add check to ensure parentId (if not null) belongs to the user
        const newCategoryId = db.create_category(userId, name.trim(), parentId);
        if (newCategoryId !== -1) {
            if (process.env.NODE_ENV === 'development')
                console.log(
                    `Category created: ID ${newCategoryId}, Name "${name.trim()}", User ${userId}, Parent ${parentId}`
                );
            // Construct redirect URL carefully
            res.redirect(
                buildRedirectUrl('/texts', {
                    message: 'Folder created successfully!',
                    category_id: parentId,
                })
            );
        } else {
            console.warn(
                `Failed to create category "${name.trim()}" for user ${userId}, Parent ${parentId} (likely name conflict)`
            );
            // Construct redirect URL carefully
            res.redirect(
                buildRedirectUrl('/texts', {
                    message:
                        'Failed to create folder. Name might already exist.',
                    category_id: parentId,
                })
            );
        }
    } catch (error) {
        console.error(
            `Error creating category "${name.trim()}" for user ${userId}:`,
            error
        );
        // Construct redirect URL carefully
        res.redirect(
            buildRedirectUrl('/texts', {
                message: 'Server error creating folder.',
                category_id: parentId,
            })
        );
    }
});

/**
 * Route: POST /:category_id/rename
 * Description: Renames an existing category (folder). Corresponds to POST /categories/:category_id/rename in original file.
 * Middleware: requireLogin
 * Params: category_id
 * Body: { new_name: string }
 */
router.post('/:category_id/rename', requireLogin, (req, res) => {
    // 1. Get category_id from route parameters
    const categoryId = parseInt(req.params.category_id, 10);

    // 2. Get new_name from the request body
    const { new_name } = req.body;
    const trimmed_new_name = new_name.trim(); // Basic trimming

    // 3. Get userId from the session
    const userId = req.session.user.id;

    // 4. Call the database function to rename
    // Assuming db.rename_category handles basic checks or returns success/failure
    const success = db.rename_category(categoryId, trimmed_new_name, userId);

    // 5. Redirect the user (simplified redirect, maybe to the parent or root)
    // For simplicity, redirecting back to the main texts page.
    // A real basic version might not even fetch the parent ID.
    res.redirect('/texts');

    // Log success/failure 
    if (success) {
        console.log(`Category ${categoryId} renamed to "${trimmed_new_name}" by user ${userId}`);
    } else {
        console.log(`Failed attempt to rename category ${categoryId} by user ${userId}`);
    }
});
/**
 * Route: POST /:category_id/delete
 * Description: Deletes an empty category (folder). Corresponds to POST /categories/:category_id/delete in original file.
 * Middleware: requireLogin
 * Params: category_id
 */
router.post('/:category_id/delete', requireLogin, (req, res) => {
    // 1. Get category_id from route parameters
    const categoryId = parseInt(req.params.category_id, 10);

    // 2. Get userId from the session
    const userId = req.session.user.id;

    // 3. Call the database function to delete
    // Assuming db.delete_category handles basic checks (like ownership, emptiness)
    // or simply returns success/failure based on whether the row was deleted.
    const success = db.delete_category(categoryId, userId);

    // 4. Redirect the user (simplified redirect)
    // Redirecting back to the main texts page.
    res.redirect('/texts');
});

// --- Export Router ---
module.exports = router;
