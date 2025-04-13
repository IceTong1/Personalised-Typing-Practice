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
    const categoryId = parseInt(req.params.category_id, 10); // Already has radix 10
    const { new_name } = req.body;
    const userId = req.session.user.id;

    if (Number.isNaN(categoryId)) {
        return res.redirect(
            buildRedirectUrl('/texts', { message: 'Invalid category ID.' })
        );
    }
    const trimmed_new_name = new_name.trim();
    if (!trimmed_new_name || trimmed_new_name.length === 0) {
        // Try to fetch parent ID even for this validation failure for better redirect
        let parentIdForRedirect = null;
        try {
            const categoryInfo = db.get_category(categoryId, userId);
            if (categoryInfo) {
                parentIdForRedirect = categoryInfo.parent_category_id;
            }
        } catch (fetchErr) {
            /* Ignore error, redirect to root */
        }
        return res.redirect(
            buildRedirectUrl('/texts', {
                message: 'New folder name cannot be empty.',
                category_id: parentIdForRedirect,
            })
        );
    }

    let categoryInfo = null; // Declare outside try block
    try {
        // Fetch category details first to get parent ID for redirects and ensure ownership
        categoryInfo = db.get_category(categoryId, userId);
        if (!categoryInfo) {
            console.warn(
                `Attempt to rename non-existent or non-owned category ID ${categoryId} by user ${userId}`
            );
            return res.redirect(
                buildRedirectUrl('/texts', {
                    message: 'Folder not found or access denied.',
                })
            );
        }
        const parentId = categoryInfo.parent_category_id; // Use this for redirects

        const success = db.rename_category(
            categoryId,
            trimmed_new_name,
            userId
        );
        if (success) {
            if (process.env.NODE_ENV === 'development')
                console.log(
                    `Category renamed: ID ${categoryId}, New Name "${trimmed_new_name}", User ${userId}`
                );
            // Use fetched parent ID in redirect
            res.redirect(
                buildRedirectUrl('/texts', {
                    message: 'Folder renamed successfully!',
                    category_id: parentId,
                })
            );
        } else {
            console.warn(
                `Failed to rename category ID ${categoryId} to "${trimmed_new_name}" for user ${userId} (not found, not owned, or name conflict)`
            );
            // Use fetched parent ID in redirect
            res.redirect(
                buildRedirectUrl('/texts', {
                    message:
                        'Failed to rename folder. Name might already exist or folder not found.',
                    category_id: parentId,
                })
            );
        }
    } catch (error) {
        console.error(
            `Error renaming category ID ${categoryId} for user ${userId}:`,
            error
        );
        // Use fetched parent ID if available, otherwise redirect to root
        const parentIdOnError = categoryInfo
            ? categoryInfo.parent_category_id
            : null;
        res.redirect(
            buildRedirectUrl('/texts', {
                message: 'Server error renaming folder.',
                category_id: parentIdOnError,
            })
        );
    }
});

/**
 * Route: POST /:category_id/delete
 * Description: Deletes an empty category (folder). Corresponds to POST /categories/:category_id/delete in original file.
 * Middleware: requireLogin
 * Params: category_id
 */
router.post('/:category_id/delete', requireLogin, (req, res) => {
    const categoryId = parseInt(req.params.category_id, 10); // Already has radix 10
    const userId = req.session.user.id;

    if (Number.isNaN(categoryId)) {
        return res.redirect(
            buildRedirectUrl('/texts', { message: 'Invalid category ID.' })
        ); // Already fixed, ensure it stays
    }

    // --- Refactored Delete Logic ---
    let parentId = null; // Variable to store parent ID for redirection
    try {
        // 1. Fetch category info first to get parent ID and check ownership
        const categoryInfo = db.get_category(categoryId, userId);
        if (!categoryInfo) {
            console.warn(
                `Attempt to delete non-existent or non-owned category ID ${categoryId} by user ${userId}`
            );
            return res.redirect(
                buildRedirectUrl('/texts', {
                    message: 'Folder not found or access denied.',
                })
            );
        }
        parentId = categoryInfo.parent_category_id; // Store for redirection

        // 2. Check if the category is empty
        const isEmpty = db.is_category_empty(categoryId, userId); // Pass userId for ownership check within the function
        if (!isEmpty) {
            console.warn(
                `Attempt to delete non-empty category ID ${categoryId} by user ${userId}`
            );
            return res.redirect(
                buildRedirectUrl('/texts', {
                    message: 'Cannot delete folder. It is not empty.',
                    category_id: parentId, // Redirect to parent
                })
            );
        }

        // 3. Attempt to delete the category
        const success = db.delete_category(categoryId, userId); // Pass userId for ownership check within the function
        if (success) {
            if (process.env.NODE_ENV === 'development')
                console.log(
                    `Category deleted: ID ${categoryId}, User ${userId}`
                );
            res.redirect(
                buildRedirectUrl('/texts', {
                    message: 'Folder deleted successfully!',
                    category_id: parentId, // Redirect to parent
                })
            );
        } else {
            // This case might happen if the category was deleted between the check and the delete attempt,
            // or if there's another DB constraint/issue.
            console.warn(
                `Failed to delete category ID ${categoryId} for user ${userId} (not found, not owned, or DB issue)`
            );
            res.redirect(
                buildRedirectUrl('/texts', {
                    message:
                        'Failed to delete folder. It might have already been removed or an error occurred.',
                    category_id: parentId, // Redirect to parent
                })
            );
        }
    } catch (error) {
        console.error(
            `Error deleting category ID ${categoryId} for user ${userId}:`,
            error
        );
        // Use the fetched parentId if available, otherwise redirect to root
        res.redirect(
            buildRedirectUrl('/texts', {
                message: 'Server error deleting folder.',
                category_id: parentId, // Redirect to parent if known, else root
            })
        );
    }
});

// --- Export Router ---
module.exports = router;
