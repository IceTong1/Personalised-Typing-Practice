const db = require('../models/db');
const { cleanupText, processPdfUpload } = require('../utils/textProcessing');

class TextService {
    static async addText(
        userId,
        title,
        content,
        targetCategoryId,
        uploadedFile
    ) {
        let textToSave = content;

        if (uploadedFile) {
            textToSave = await processPdfUpload(uploadedFile);
        }

        const finalContent = cleanupText(textToSave || '');
        const newTextId = db.add_text(
            userId,
            title,
            finalContent,
            targetCategoryId
        );

        return {
            success: newTextId !== -1,
            textId: newTextId,
            content: finalContent,
        };
    }

    static async updateText(textId, userId, title, content, targetCategoryId) {
        const cleanedContent = cleanupText(content);
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

    static getTexts(userId, categoryId) {
        return {
            texts: db.get_texts(userId, categoryId),
            categories: db.get_categories(userId, categoryId),
            allCategories: db.get_all_categories_flat(userId),
        };
    }
}

module.exports = TextService;
