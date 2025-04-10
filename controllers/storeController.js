const express = require('express');
const router = express.Router();
const db = require('../models/db'); // Import database functions
const { requireLogin } = require('../middleware/authMiddleware'); // Middleware to ensure user is logged in

// --- Item Definitions (Temporary - Ideally fetch from DB) ---
const storeItems = {
    car: { name: 'Car', price: 100, emoji: '🚗' },
    house: { name: 'House', price: 500, emoji: '🏠' },
    laptop: { name: 'Laptop', price: 50, emoji: '💻' },
    phone: { name: 'Phone', price: 30, emoji: '📱' },
    book: { name: 'Book', price: 10, emoji: '📖' },
    game_controller: { name: 'Game Controller', price: 25, emoji: '🎮' },
    pizza_slice: { name: 'Pizza Slice', price: 5, emoji: '🍕' },
    coffee_cup: { name: 'Coffee Cup', price: 3, emoji: '☕' },
    sword: { name: 'Sword', price: 75, emoji: '⚔️' },
    shield: { name: 'Shield', price: 60, emoji: '🛡️' },
    rubber_chicken: { name: 'Rubber Chicken', price: 1, emoji: '🐔' },
    pet_rock: { name: 'Pet Rock', price: 2, emoji: '🪨' },
    infinite_coffee: { name: 'Infinite Coffee Mug', price: 999, emoji: '♾️☕' }, // Aspirational item!
    invisibility_cloak_rental: { name: 'Invisibility Cloak (1hr Rental)', price: 150, emoji: '👻' },
    portable_black_hole: { name: 'Portable Black Hole (Use with caution!)', price: 10000, emoji: '⚫' },
    unicorn_horn_polish: { name: 'Unicorn Horn Polish', price: 42, emoji: '🦄✨' },
    anti_gravity_boots: { name: 'Anti-Gravity Boots (Low Power)', price: 250, emoji: '🚀👢' },
    brian: { name: 'Brian', price: 1, emoji: '🧍' }, // Just Brian.
};

// --- Route Handlers ---

/**
 * POST /store/buy
 * Handles the request to buy an item.
 */
router.post('/buy', requireLogin, (req, res) => {
    const userId = req.session.user.id; // Get ID from the session user object
    const { itemId } = req.body; // Get item ID from request body

    // 1. Validate Item ID
    if (!itemId || !storeItems[itemId]) {
        return res.status(400).json({ success: false, message: 'Invalid item selected.' });
    }

    const item = storeItems[itemId];
    // Fetch user details to get current coin count
    const currentUserDetails = db.get_user_details(userId);
    if (!currentUserDetails) {
        // Should not happen if user is logged in, but handle defensively
        console.error(`Could not fetch details for logged-in user ID ${userId}`);
        return res.status(500).json({ success: false, message: 'Could not verify user data.' });
    }
    const userCoins = currentUserDetails.coins;

    // 2. Check if user has enough coins (Initial check)
    if (userCoins < item.price) {
        return res.status(400).json({ success: false, message: 'Insufficient balance.' });
    }

    // 3. Perform transaction steps
    try {
        // --- Add logging ---
        console.log(`Attempting purchase: User ID = ${userId}, Item ID = ${itemId}, Price = ${item.price}, User Coins = ${userCoins}`);
        // --- End logging ---

        // 4. Deduct coins first
        const coinsDecremented = db.decrement_user_coins(userId, item.price);
        if (!coinsDecremented) {
            // This likely means coins were insufficient *at the time of the update*
            console.warn(`Failed to decrement coins for user ${userId} buying item ${itemId} (likely insufficient funds or race condition).`);
            // Return 409 Conflict as the state wasn't valid for the operation
            return res.status(409).json({ success: false, message: 'Insufficient balance or error during deduction.' });
        }

        // 5. Add item to owned items
        const itemAdded = db.add_owned_item(userId, itemId);
        if (!itemAdded) {
            // If adding the item fails after coins were deducted, attempt to refund.
            console.error(`Failed to add item ${itemId} for user ${userId} after coin deduction.`);
            console.warn(`Attempting to refund ${item.price} coins to user ${userId}.`);
            db.increment_user_coins(userId, item.price); // Best effort refund
            return res.status(500).json({ success: false, message: 'Failed to add item to inventory after purchase. Coins refunded.' });
        }

        // 6. Success
        const updatedUserDetails = db.get_user_details(userId); // Get updated coin count
        res.json({
            success: true,
            message: `Successfully purchased ${item.name}!`,
            newCoinCount: updatedUserDetails ? updatedUserDetails.coins : userCoins - item.price // Provide updated count
        });

    } catch (error) {
        console.error(`Unexpected error during purchase for user ${userId}, item ${itemId}:`, error);
        // Note: A refund might be needed here too if the error happened after coin deduction but before item add confirmation.
        // However, without a proper transaction manager, it's hard to guarantee. We log the error.
        res.status(500).json({ success: false, message: 'An unexpected error occurred during purchase.' });
    }
});

/**
 * GET /store/shelf
 * Displays the items owned by the logged-in user.
 */
router.get('/shelf', requireLogin, (req, res) => {
    const userId = req.session.user.id;

    try {
        // 1. Fetch owned item IDs from the database
        const ownedItemIds = db.get_owned_item_ids(userId); // Use the existing function from db.js

        // 2. Convert Set to Array and map IDs to item details from storeItems
        const ownedItemsDetails = Array.from(ownedItemIds) // Convert Set to Array
            .map(itemId => storeItems[itemId]) // Get the item object using the ID
            .filter(item => item !== undefined); // Filter out any potential undefined items if an ID is invalid

        // 3. Render the shelf view
        res.render('shelf', {
            title: 'My Shelf',
            user: req.session.user, // Pass user info for the header/nav
            items: ownedItemsDetails // Pass the detailed items to the view
        });

    } catch (error) {
        console.error(`Error fetching or rendering shelf for user ${userId}:`, error);
        // Render an error page or redirect, maybe show a flash message
        // For now, just send a generic error status
        res.status(500).send('Error loading your shelf.');
    }
});

// Export both the router and the items definition
module.exports = { router, storeItems };