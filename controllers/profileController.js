const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { requireLogin } = require('../middleware/authMiddleware');

/**
 * Route: GET /profile
 * Description: Displays the user's profile page with stats
 * Middleware: requireLogin
 */
router.get('/profile', requireLogin, (req, res) => {
    try {
        const userId = req.session.user.id;

        // TODO: Implement db.get_user_stats()
        const stats = {
            textsPracticed: 0,
            totalPracticeTime: '0h 0m', 
            averageAccuracy: 0,
        };

        if (process.env.NODE_ENV === 'development') {
            console.log(`Fetching profile stats for user ID: ${userId}`);
        }

        res.render('profile', {
            user: req.session.user,
            stats,
            message: req.query.message || null,
        });
    } catch (error) {
        console.error('Error fetching profile stats:', error);
        res.status(500).send('Error loading profile.');
    }
});

module.exports = router;