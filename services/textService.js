const db = require('../models/db');
const { cleanupText, processPdfUpload } = require('../utils/textProcessing');

/**
 * Service class for handling text-related operations.
 * Interacts with the database and utility functions for text processing.
 */
class TextService {
    /**
     * Adds a new text to the database, processing uploaded files if provided.
     * @param {number} userId - The ID of the user adding the text.
     * @param {string} title - The title of the text.
     * @param {string} [content] - The content of the text (optional if file is provided).
     * @param {number} targetCategoryId - The ID of the category to add the text to.
     * @param {object} [uploadedFile] - The uploaded file object (e.g., from multer).
     * @returns {Promise<{success: boolean, textId: number, content: string}>} - An object indicating success, the new text ID, and the processed content.
     */
    static async addText(
        userId,
        title,
        content,
        targetCategoryId,
        uploadedFile
    ) {
        let textToSave = content;

        // If a file is uploaded, process it to extract text content
        if (uploadedFile) {
            textToSave = await processPdfUpload(uploadedFile);
        }

        // Clean up the text content before saving
        const finalContent = cleanupText(textToSave || '');

        // Add the text to the database
        const newTextId = db.add_text(
            userId,
            title,
            finalContent,
            targetCategoryId
        );

        return {
            success: newTextId !== -1, // Check if the insertion was successful
            textId: newTextId,
            content: finalContent,
        };
    }

    /**
     * Updates an existing text in the database.
     * @param {number} textId - The ID of the text to update.
     * @param {number} userId - The ID of the user updating the text (for authorization, though not used in db function here).
     * @param {string} title - The new title for the text.
     * @param {string} content - The new content for the text.
     * @param {number} targetCategoryId - The new category ID for the text.
     * @returns {Promise<{success: boolean, content: string}>} - An object indicating success and the cleaned content.
     */
    static async updateText(textId, userId, title, content, targetCategoryId) {
        // Clean up the provided content
        const cleanedContent = cleanupText(content);

        // Update the text in the database
        const success = db.update_text(
            textId,
            title,
            cleanedContent,
            targetCategoryId
        );

        return {
            success,
            content: cleanedContent,
        };
    }

    /**
     * Retrieves texts and categories for a specific user and category.
     * @param {number} userId - The ID of the user whose texts are being retrieved.
     * @param {number|null} categoryId - The ID of the category to filter by (null for root).
     * @returns {{texts: Array<object>, categories: Array<object>, allCategories: Array<object>}} - An object containing lists of texts, sub-categories, and all categories for the user.
     */
    static getTexts(userId, categoryId) {
        return {
            texts: db.get_texts(userId, categoryId), // Texts in the specified category
            categories: db.get_categories(userId, categoryId), // Sub-categories of the specified category
            allCategories: db.get_all_categories_flat(userId), // All categories for the user (flat list)
        };
    }
}

module.exports = TextService;
