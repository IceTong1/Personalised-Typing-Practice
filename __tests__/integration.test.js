const request = require('supertest');
const app = require('../server'); // Import the configured Express app
const db = require('../models/db'); // Import the db mock

// --- Mock Dependencies ---
// Mock better-sqlite3 BEFORE requiring db or controller (needed for db initialization)
jest.mock('better-sqlite3', () => {
  const mockStatement = { run: jest.fn(), get: jest.fn(), all: jest.fn(), [Symbol.iterator]: jest.fn(function*() {}) };
  const mockDbInstance = {
    prepare: jest.fn(() => mockStatement),
    exec: jest.fn(), close: jest.fn(),
    pragma: jest.fn(() => []), // Prevent initialization errors in db.js
    transaction: jest.fn((fn) => jest.fn((...args) => fn(...args))),
  };
  return jest.fn(() => mockDbInstance);
});

// Mock the db module itself
jest.mock('../models/db', () => ({
    user_exists: jest.fn(),
    new_user: jest.fn(),
    login: jest.fn(),
    get_texts: jest.fn(),
    get_text: jest.fn(),
    add_text: jest.fn(),
    update_text: jest.fn(),
    delete_text: jest.fn(),
    save_progress: jest.fn(),
}));

describe('Integration Tests', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        db.user_exists.mockClear();
        db.login.mockClear();
        db.new_user.mockClear();
        db.get_texts.mockClear();
    });

    // --- Basic Page Loading ---
    describe('GET /', () => {
        it('should load the homepage', async () => {
            const res = await request(app).get('/');
            expect(res.statusCode).toEqual(200);
            // Updated assertion to match actual title
            expect(res.text).toContain('<title>Custom Typing Trainer</title>');
        });
    });

    describe('GET /login', () => {
        it('should load the login page', async () => {
            const res = await request(app).get('/login');
            expect(res.statusCode).toEqual(200);
            // Updated assertion to match actual heading/content
            expect(res.text).toContain('<h2 class="mb-4">Login</h2>');
        });
    });

    describe('GET /register', () => {
        it('should load the registration page', async () => {
            const res = await request(app).get('/register');
            expect(res.statusCode).toEqual(200);
            // Updated assertion to match actual heading/content
            expect(res.text).toContain('<h2 class="mb-4">Register</h2>');
        });
    });

    // --- Authentication Flow ---
    describe('Authentication Flow', () => {
        const agent = request.agent(app); // Use agent to maintain session cookies

        it('should fail registration with existing username', async () => {
            db.user_exists.mockReturnValue(true);
            const res = await agent
                .post('/register')
                .send({ username: 'existingUser', password: 'password', confirmPassword: 'password' });

            expect(res.statusCode).toEqual(200);
            expect(res.text).toContain('Username already taken.');
            expect(db.user_exists).toHaveBeenCalledWith('existingUser');
            expect(db.new_user).not.toHaveBeenCalled();
        });

        it('should fail registration if passwords dont match', async () => {
            const res = await agent
                .post('/register')
                .send({ username: 'testUser', password: 'password1', confirmPassword: 'password2' });

            expect(res.statusCode).toEqual(200);
            expect(res.text).toContain('Passwords do not match.');
            expect(db.user_exists).not.toHaveBeenCalled();
            expect(db.new_user).not.toHaveBeenCalled();
        });

        it('should register a new user successfully and redirect to profile', async () => {
            db.user_exists.mockReturnValue(false);
            db.new_user.mockReturnValue(123);
            db.get_texts.mockReturnValue([]); // Mock texts for profile page load

            const res = await agent
                .post('/register')
                .send({ username: 'newUser', password: 'password', confirmPassword: 'password' });

            expect(res.statusCode).toEqual(302);
            expect(res.headers.location).toEqual('/profile');
            expect(db.user_exists).toHaveBeenCalledWith('newUser');
            expect(db.new_user).toHaveBeenCalledWith('newUser', 'password');

            // Follow the redirect and check the profile page content
            const profileRes = await agent.get('/profile');
            expect(profileRes.statusCode).toEqual(200);
            // Updated assertion to match actual profile content
            expect(profileRes.text).toContain('<h2>Profile</h2>');
            expect(profileRes.text).toContain('<h3 class="card-title">Your Statistics</h3>'); // Updated to match card title class
            expect(db.get_texts).not.toHaveBeenCalled(); // Profile no longer fetches texts
        });

        it('should fail login with incorrect credentials', async () => {
            db.login.mockReturnValue(-1);

            const res = await agent
                .post('/login')
                .send({ username: 'wrongUser', password: 'wrongPassword' });

            expect(res.statusCode).toEqual(200);
            expect(res.text).toContain('Invalid username or password.');
            expect(db.login).toHaveBeenCalledWith('wrongUser', 'wrongPassword');
        });

        it('should login successfully and redirect to profile', async () => {
            db.login.mockReturnValue(456);
            db.get_texts.mockReturnValue([{ id: 1, title: 'Existing Text' }]);

            const res = await agent
                .post('/login')
                .send({ username: 'correctUser', password: 'correctPassword' });

            expect(res.statusCode).toEqual(302);
            expect(res.headers.location).toEqual('/profile');
            expect(db.login).toHaveBeenCalledWith('correctUser', 'correctPassword');

            // Follow redirect
            const profileRes = await agent.get('/profile');
            expect(profileRes.statusCode).toEqual(200);
             // Updated assertion to match actual profile content
            expect(profileRes.text).toContain('<h2>Profile</h2>');
            expect(profileRes.text).toContain('<h3 class="card-title">Your Statistics</h3>'); // Updated to match card title class
            expect(db.get_texts).not.toHaveBeenCalled(); // Profile no longer fetches texts
        });

        it('should logout successfully and redirect to homepage', async () => {
            db.login.mockReturnValue(789);
            await agent.post('/login').send({ username: 'logoutUser', password: 'password' });

            const res = await agent.get('/logout');
            expect(res.statusCode).toEqual(302);
            expect(res.headers.location).toEqual('/');

            // Verify session is cleared by trying to access protected route
            const profileRes = await agent.get('/profile');
            expect(profileRes.statusCode).toEqual(302); // Should redirect to login
            expect(profileRes.headers.location).toEqual('/login');
        });
    });

    // --- Add more integration tests for textController routes later ---

});