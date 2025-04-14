const express = require('express');

const router = express.Router();
const db = require('../models/db');
const { requireLogin } = require('../middleware/authMiddleware');

// Helper function to format seconds into "Xh Ym Zs"
function formatTime(totalSeconds) {
    if (totalSeconds <= 0) return '0h 0m 0s'; // Handle zero or negative case
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60); // Use Math.floor to ensure whole seconds
    return `${hours}h ${minutes}m ${seconds}s`;
}

/**
 * Route: GET /profile
 * Description: Displays the user's profile page with stats
 * Middleware: requireLogin
 */
router.get('/profile', requireLogin, (req, res) => {
        const userId = req.session.user.id;

        // Fetch user statistics from the database
        const rawStats = db.get_user_stats(userId);

        // Format the stats for display
        const stats = {
            textsPracticed: rawStats.texts_practiced,
            totalPracticeTime: formatTime(rawStats.total_practice_time_seconds), // Format the time
            averageAccuracy: rawStats.average_accuracy.toFixed(1), // Format accuracy to one decimal place
        };
        res.render('profile', {
            user: req.session.user,
            stats,
            message: req.query.message || null,
        });
    } 
);

module.exports = router;
