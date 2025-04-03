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
    get_categories: jest.fn(), // Added for /texts
    get_all_categories_flat: jest.fn(), // Added for /texts and forms - Should return {id, path_name, level}
    create_category: jest.fn(), // Added for category routes
    delete_category: jest.fn(), // Added for category routes - Should return boolean
    is_category_empty: jest.fn(), // Added for category delete check
    rename_category: jest.fn(), // Added for category rename
    update_text_order: jest.fn(), // Added for potential future tests
}));

describe('Integration Tests', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        db.user_exists.mockClear();
        db.login.mockClear();
        db.new_user.mockClear();
        db.get_texts.mockClear();
        db.get_categories.mockClear();
        db.get_all_categories_flat.mockClear();
        db.add_text.mockClear();
        db.get_text.mockClear();
        db.update_text.mockClear();
        db.delete_text.mockClear();
        db.save_progress.mockClear();
        db.create_category.mockClear();
        db.delete_category.mockClear();
        db.is_category_empty.mockClear();
        db.rename_category.mockClear();
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
            expect(res.text).toContain('<h2 class="card-title text-center mb-4">Login</h2>');
        });
    });

    describe('GET /register', () => {
        it('should load the registration page', async () => {
            const res = await request(app).get('/register');
            expect(res.statusCode).toEqual(200);
            // Updated assertion to match actual heading/content
            expect(res.text).toContain('<h2 class="card-title text-center mb-4">Register</h2>');
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

    // --- Text Management Flow ---
    describe('Text Management Flow (Requires Login)', () => {
        let agent; // Use a separate agent for this block to ensure login state

        beforeAll(async () => {
            // Log in once before all tests in this block
            agent = request.agent(app);
            db.login.mockReturnValue(999); // Mock successful login for user 999
            await agent
                .post('/login')
                .send({ username: 'textUser', password: 'password' });
            db.login.mockClear(); // Clear login mock after use
        });

        afterAll(() => {
            // Optional: Clean up agent if needed, though usually not necessary
        });

        describe('GET /texts', () => {
            it('should load the texts page with texts and categories for the root directory', async () => {
                const mockTexts = [{ id: 1, title: 'Text 1', content: 'Content 1', category_id: null, progress_index: 0 }];
                const mockCategories = [{ id: 10, name: 'Folder 1', parent_id: null }];
                const mockAllCategoriesFlat = [{ id: 10, path_name: 'Folder 1', level: 0 }]; // Use path_name

                db.get_texts.mockReturnValue(mockTexts);
                db.get_categories.mockReturnValue(mockCategories);
                db.get_all_categories_flat.mockReturnValue(mockAllCategoriesFlat);

                const res = await agent.get('/texts'); // Use logged-in agent

                expect(res.statusCode).toEqual(200);
                // Check for a key structural element instead of a specific heading
                expect(res.text).toContain('<div id="text-list" class="list-group list-group-flush">');
                expect(res.text).toContain('Text 1'); // Check if text title is present
                expect(res.text).toContain('Folder 1'); // Check if category name is present
                expect(db.get_texts).toHaveBeenCalledWith(999, null); // User ID 999, root category (null)
                expect(db.get_categories).toHaveBeenCalledWith(999, null); // User ID 999, root category (null)
                expect(db.get_all_categories_flat).toHaveBeenCalledWith(999);
            });

             it('should load the texts page for a specific category', async () => {
                const mockTexts = [{ id: 2, title: 'Text 2', content: 'Content 2', category_id: 10, progress_index: 0 }];
                const mockCategories = []; // No sub-categories in this folder
                const mockAllCategoriesFlat = [{ id: 10, path_name: 'Folder 1', level: 0 }]; // Use path_name

                db.get_texts.mockReturnValue(mockTexts);
                db.get_categories.mockReturnValue(mockCategories);
                db.get_all_categories_flat.mockReturnValue(mockAllCategoriesFlat);

                const res = await agent.get('/texts?category_id=10'); // Request category 10

                expect(res.statusCode).toEqual(200);
                expect(res.text).toContain('Text 2');
                expect(db.get_texts).toHaveBeenCalledWith(999, 10); // User ID 999, category 10
                expect(db.get_categories).toHaveBeenCalledWith(999, 10); // User ID 999, category 10
                expect(db.get_all_categories_flat).toHaveBeenCalledWith(999);
            });

             it('should handle errors when fetching texts', async () => {
                db.get_texts.mockImplementation(() => { throw new Error('DB Error'); });
                db.get_categories.mockReturnValue([]); // Mock other calls to prevent cascading errors
                db.get_all_categories_flat.mockReturnValue([]);

                const res = await agent.get('/texts');

                expect(res.statusCode).toEqual(500);
                expect(res.text).toContain('Error loading texts.');
            });
        });

        describe('GET /add_text', () => {
             it('should load the add text page with categories', async () => {
                const mockAllCategoriesFlat = [{ id: 10, path_name: 'Folder 1', level: 0 }]; // Use path_name
                db.get_all_categories_flat.mockReturnValue(mockAllCategoriesFlat);

                const res = await agent.get('/add_text');

                expect(res.statusCode).toEqual(200);
                expect(res.text).toContain('<h2 class="card-title text-center mb-4">Add New Text</h2>');
                // Check with expected whitespace from rendering
                expect(res.text).toMatch(/<option value="10">[\s\n]*Folder 1[\s\n]*<\/option>/); // Match whitespace/newlines
                expect(db.get_all_categories_flat).toHaveBeenCalledWith(999);
            });
        });

        describe('POST /add_text', () => {
            it('should add a new text via textarea to the root folder and redirect', async () => {
                db.add_text.mockReturnValue(555); // Mock successful insert, return new ID

                const res = await agent
                    .post('/add_text')
                    .send({ title: 'New Text Area Text', content: 'Some content here', category_id: 'root' });

                expect(res.statusCode).toEqual(302);
                expect(res.headers.location).toEqual('/texts?message=Text%20added%20successfully!');
                expect(db.add_text).toHaveBeenCalledWith(999, 'New Text Area Text', 'Some content here', null); // User 999, null for root category
            });

            it('should add a new text via textarea to a specific folder and redirect', async () => {
                db.add_text.mockReturnValue(556); // Mock successful insert

                const res = await agent
                    .post('/add_text')
                    .send({ title: 'New Text In Folder', content: 'More content', category_id: '10' });

                expect(res.statusCode).toEqual(302);
                expect(res.headers.location).toEqual('/texts?message=Text%20added%20successfully!&category_id=10'); // Redirect includes category
                expect(db.add_text).toHaveBeenCalledWith(999, 'New Text In Folder', 'More content', 10); // User 999, category 10
            });

            it('should fail if title is missing', async () => {
                 db.get_all_categories_flat.mockReturnValue([]); // Mock for error render

                 const res = await agent
                    .post('/add_text')
                    .send({ title: '', content: 'Some content here', category_id: 'root' });

                expect(res.statusCode).toEqual(200); // Renders the form again
                expect(res.text).toContain('Title cannot be empty.');
                expect(db.add_text).not.toHaveBeenCalled();
                // expect(db.get_all_categories_flat).toHaveBeenCalledWith(999); // Not called, validation fails first
            });

             it('should fail if content and file are missing', async () => {
                 db.get_all_categories_flat.mockReturnValue([]); // Mock for error render

                 const res = await agent
                    .post('/add_text')
                    .send({ title: 'No Content Text', content: '', category_id: 'root' }); // No file attached

                expect(res.statusCode).toEqual(200);
                expect(res.text).toContain('Please provide text content or upload a PDF file.');
                expect(db.add_text).not.toHaveBeenCalled();
                // expect(db.get_all_categories_flat).toHaveBeenCalledWith(999); // Not called, validation fails first
            });

            // PDF upload tests are harder with supertest without mocking fs/child_process globally
            // or setting up more complex multipart form data requests.
            // We rely on the unit tests for PDF processing logic coverage for now.

             it('should handle database error on add', async () => {
                db.add_text.mockReturnValue(-1); // Simulate DB error
                db.get_all_categories_flat.mockReturnValue([]); // Mock for error render

                const res = await agent
                    .post('/add_text')
                    .send({ title: 'DB Error Text', content: 'Content', category_id: 'root' });

                expect(res.statusCode).toEqual(200);
                expect(res.text).toContain('Failed to save text to the database.');
                expect(db.add_text).toHaveBeenCalledWith(999, 'DB Error Text', 'Content', null);
                expect(db.get_all_categories_flat).toHaveBeenCalledWith(999);
            });
        });

        describe('GET /edit_text/:text_id', () => {
            it('should load the edit page for an owned text', async () => {
                const mockText = { id: 1, user_id: 999, title: 'Text to Edit', content: 'Original Content', category_id: null };
                const mockAllCategoriesFlat = [{ id: 10, path_name: 'Folder 1', level: 0 }]; // Use path_name
                db.get_text.mockReturnValue(mockText); // Mock for requireOwnership middleware
                db.get_all_categories_flat.mockReturnValue(mockAllCategoriesFlat);

                const res = await agent.get('/edit_text/1');

                expect(res.statusCode).toEqual(200);
                expect(res.text).toContain('<h2 class="card-title text-center mb-4">Edit Text</h2>');
                expect(res.text).toContain('value="Text to Edit"'); // Check title pre-fill
                expect(res.text).toContain('Original Content'); // Check content pre-fill
                // Check with expected whitespace from rendering
                expect(res.text).toMatch(/<option value="10"\s*>[\s\n]*Folder 1[\s\n]*<\/option>/); // Allow space before >
                expect(db.get_text).toHaveBeenCalledWith("1"); // Middleware calls get_text with string ID only
                expect(db.get_all_categories_flat).toHaveBeenCalledWith(999);
            });

            it('should return 403 if text is not owned', async () => {
                db.get_text.mockReturnValue(null); // Simulate text not found or not owned

                const res = await agent.get('/edit_text/2'); // Try to edit text ID 2

                expect(res.statusCode).toEqual(302); // requireOwnership redirects on not found
                expect(db.get_text).toHaveBeenCalledWith("2"); // Middleware calls get_text without userId
                expect(res.headers.location).toEqual('/profile?message=Text%20not%20found');
                expect(db.get_all_categories_flat).not.toHaveBeenCalled(); // Shouldn't be called if middleware fails
            });
        });

        describe('POST /edit_text/:text_id', () => {
            it('should update an owned text and redirect', async () => {
                const mockText = { id: 1, user_id: 999, title: 'Old Title', content: 'Old Content', category_id: null };
                db.get_text.mockReturnValue(mockText); // Mock for requireOwnership
                db.update_text.mockReturnValue(true); // Mock successful update

                const res = await agent
                    .post('/edit_text/1')
                    .send({ title: 'Updated Title', content: 'Updated Content', category_id: '10' });

                expect(res.statusCode).toEqual(302);
                expect(res.headers.location).toEqual('/texts?message=Text%20updated%20successfully!&category_id=10');
                expect(db.get_text).toHaveBeenCalledWith("1"); // Middleware calls get_text with string ID only
                expect(db.update_text).toHaveBeenCalledWith('1', 'Updated Title', 'Updated Content', 10); // Check update call
            });

            it('should fail update if title is empty', async () => {
                const mockText = { id: 1, user_id: 999, title: 'Old Title', content: 'Old Content', category_id: null };
                db.get_text.mockReturnValue(mockText); // Mock for requireOwnership
                db.get_all_categories_flat.mockReturnValue([]); // Mock for error render

                const res = await agent
                    .post('/edit_text/1')
                    .send({ title: '', content: 'Updated Content', category_id: 'root' });

                expect(res.statusCode).toEqual(200); // Renders form again
                expect(res.text).toContain('Title and content cannot be empty.');
                expect(db.update_text).not.toHaveBeenCalled();
                expect(db.get_all_categories_flat).toHaveBeenCalledWith(999); // Called for error render
            });

             it('should fail update if text is not owned', async () => {
                db.get_text.mockReturnValue(null); // Simulate text not found or not owned for requireOwnership

                const res = await agent
                    .post('/edit_text/2') // Try to update text ID 2
                    .send({ title: 'Updated Title', content: 'Updated Content', category_id: 'root' });

                expect(res.statusCode).toEqual(302); // requireOwnership redirects on not found
                expect(res.headers.location).toEqual('/profile?message=Text%20not%20found');
                expect(db.update_text).not.toHaveBeenCalled();
            });

             it('should handle database error on update', async () => {
                const mockText = { id: 1, user_id: 999, title: 'Old Title', content: 'Old Content', category_id: null };
                db.get_text.mockReturnValue(mockText); // Mock for requireOwnership
                db.update_text.mockReturnValue(false); // Simulate DB update failure
                db.get_all_categories_flat.mockReturnValue([]); // Mock for error render

                const res = await agent
                    .post('/edit_text/1')
                    .send({ title: 'Updated Title', content: 'Updated Content', category_id: 'root' });

                expect(res.statusCode).toEqual(200); // Renders form again
                expect(res.text).toContain('Failed to update text. Please try again.');
                expect(db.update_text).toHaveBeenCalledWith('1', 'Updated Title', 'Updated Content', null);
                expect(db.get_all_categories_flat).toHaveBeenCalledWith(999);
            });
        });

        describe('POST /delete_text/:text_id', () => {
             it('should delete an owned text and redirect', async () => {
                const mockText = { id: 1, user_id: 999, title: 'To Delete', content: 'Content', category_id: null };
                db.get_text.mockReturnValue(mockText); // Mock for requireOwnership
                db.delete_text.mockReturnValue(true); // Mock successful delete

                const res = await agent.post('/delete_text/1');

                expect(res.statusCode).toEqual(302);
                expect(res.headers.location).toEqual('/texts?message=Text%20deleted%20successfully!');
                expect(db.get_text).toHaveBeenCalledWith("1"); // Middleware calls get_text with string ID only
                expect(db.delete_text).toHaveBeenCalledWith('1');
            });

             it('should fail delete if text is not owned', async () => {
                db.get_text.mockReturnValue(null); // Simulate text not found or not owned for requireOwnership

                const res = await agent.post('/delete_text/2'); // Try to delete text ID 2

                expect(res.statusCode).toEqual(302); // requireOwnership redirects on not found
                expect(res.headers.location).toEqual('/profile?message=Text%20not%20found');
                expect(db.delete_text).not.toHaveBeenCalled();
            });

             it('should redirect with message if database delete fails', async () => {
                const mockText = { id: 1, user_id: 999, title: 'To Delete', content: 'Content', category_id: null };
                db.get_text.mockReturnValue(mockText); // Mock for requireOwnership
                db.delete_text.mockReturnValue(false); // Simulate DB delete failure

                const res = await agent.post('/delete_text/1');

                expect(res.statusCode).toEqual(302);
                expect(res.headers.location).toEqual('/texts?message=Could%20not%20delete%20text.%20It%20might%20have%20already%20been%20removed.');
                expect(db.delete_text).toHaveBeenCalledWith('1');
            });
        });

        describe('GET /practice/:text_id', () => {
            it('should load the practice page for an owned text', async () => {
                const mockText = { id: 1, user_id: 999, title: 'Practice Text', content: 'Practice content.', progress_index: 10 };
                db.get_text.mockReturnValue(mockText); // Mock for requireOwnership and handler

                const res = await agent.get('/practice/1');

                expect(res.statusCode).toEqual(200);
                expect(res.text).toContain('<h2>Practice: Practice Text</h2>');
                expect(res.text).toContain('Practice content.'); // Check if content is present
                expect(res.text).toContain('data-progress-index="10"'); // Check progress index attribute
                expect(db.get_text).toHaveBeenCalledWith("1", 999); // requireOwnership check (ID is string)
                expect(db.get_text).toHaveBeenCalledTimes(2); // Called by middleware and handler
            });

             it('should redirect if text is not found/owned', async () => {
                db.get_text.mockReturnValue(null); // Simulate text not found/owned

                const res = await agent.get('/practice/2');

                expect(res.statusCode).toEqual(302); // Middleware redirects on failure (default status 302)
                // Check the redirect location set by the middleware's "not found" path
                expect(res.headers.location).toEqual('/profile?message=Text%20not%20found');
                expect(db.get_text).toHaveBeenCalledWith("2"); // Middleware calls get_text without userId
            });
        });

        describe('POST /save_progress', () => {
            it('should save progress and return success', async () => {
                db.save_progress.mockReturnValue(true); // Mock successful save

                const res = await agent
                    .post('/save_progress')
                    .send({ text_id: '1', progress_index: '50' });

                expect(res.statusCode).toEqual(200);
                expect(res.body).toEqual({ success: true });
                expect(db.save_progress).toHaveBeenCalledWith(999, 1, 50); // User 999, text 1, progress 50
            });

            it('should return 400 if text_id is missing', async () => {
                const res = await agent
                    .post('/save_progress')
                    .send({ progress_index: '50' });

                expect(res.statusCode).toEqual(400);
                expect(res.body).toEqual({ success: false, message: 'Missing required data.' });
                expect(db.save_progress).not.toHaveBeenCalled();
            });

             it('should return 400 if progress_index is invalid', async () => {
                const res = await agent
                    .post('/save_progress')
                    .send({ text_id: '1', progress_index: 'abc' });

                expect(res.statusCode).toEqual(400);
                expect(res.body).toEqual({ success: false, message: 'Invalid data.' });
                expect(db.save_progress).not.toHaveBeenCalled();
            });

             it('should return 500 if database save fails', async () => {
                db.save_progress.mockReturnValue(false); // Simulate DB error

                const res = await agent
                    .post('/save_progress')
                    .send({ text_id: '1', progress_index: '50' });

                expect(res.statusCode).toEqual(500);
                expect(res.body).toEqual({ success: false, message: 'Database error saving progress.' });
                expect(db.save_progress).toHaveBeenCalledWith(999, 1, 50);
            });
        });

        describe('POST /categories', () => {
            it('should create a new category and redirect', async () => {
                db.create_category.mockReturnValue(11); // Mock successful creation, return new ID

                const res = await agent
                    .post('/categories')
                    .send({ name: 'New Folder', parent_category_id: '' }); // Use 'name' and 'parent_category_id'

                expect(res.statusCode).toEqual(302);
                expect(res.headers.location).toEqual('/texts?message=Folder+created+successfully%21');
                expect(db.create_category).toHaveBeenCalledWith(999, 'New Folder', null); // User 999, null for root parent
            });

            it('should create a new sub-category and redirect', async () => {
                db.create_category.mockReturnValue(12);

                const res = await agent
                    .post('/categories')
                    .send({ name: 'Sub Folder', parent_category_id: '10' }); // Use 'name' and 'parent_category_id'

                expect(res.statusCode).toEqual(302);
                expect(res.headers.location).toEqual('/texts?message=Folder+created+successfully%21&category_id=10'); // Redirect includes parent category
                expect(db.create_category).toHaveBeenCalledWith(999, 'Sub Folder', 10); // User 999, parent 10
            });

            it('should fail if category name is empty', async () => {
                const res = await agent
                    .post('/categories')
                    .send({ name: '', parent_category_id: '' }); // Use 'name'

                expect(res.statusCode).toEqual(302); // Redirects back with error message
                expect(res.headers.location).toEqual('/texts?message=Folder+name+cannot+be+empty.');
                expect(db.create_category).not.toHaveBeenCalled();
            });

            it('should handle database error on category creation', async () => {
                db.create_category.mockReturnValue(-1); // Simulate DB error

                const res = await agent
                    .post('/categories')
                    .send({ name: 'DB Error Folder', parent_category_id: '' }); // Use 'name'

                expect(res.statusCode).toEqual(302);
                expect(res.headers.location).toEqual('/texts?message=Failed+to+create+folder.+Name+might+already+exist.'); // More specific controller message
                expect(db.create_category).toHaveBeenCalledWith(999, 'DB Error Folder', null);
            });
        });

        describe('POST /categories/:id/delete', () => {
            it('should delete an empty category and redirect', async () => {
                // Ensure the mock returns the correct structure
                db.is_category_empty.mockReturnValue(true); // Mock check for emptiness
                db.delete_category.mockReturnValue(true); // Mock successful delete (returns boolean)

                const res = await agent.post('/categories/10/delete');

                expect(res.statusCode).toEqual(302);
                expect(res.headers.location).toEqual('/texts?message=Folder+deleted+successfully%21');
                expect(db.is_category_empty).toHaveBeenCalledWith(10, 999);
                expect(db.delete_category).toHaveBeenCalledWith(10, 999); // Correct order: categoryId, userId
            });

            it('should fail to delete a non-empty category and redirect', async () => {
                // Ensure the mock returns the correct structure
                db.is_category_empty.mockReturnValue(false); // Mock check for non-emptiness

                const res = await agent.post('/categories/11/delete');

                expect(res.statusCode).toEqual(302);
                expect(res.headers.location).toEqual('/texts?message=Cannot+delete+folder.+It+is+not+empty.');
                expect(db.is_category_empty).toHaveBeenCalledWith(11, 999);
                expect(db.delete_category).not.toHaveBeenCalled(); // Should not be called if not empty
                expect(db.delete_category).not.toHaveBeenCalled(); // Ensure it's NOT called
            });

             it('should handle database error on category deletion', async () => {
                // Ensure the mock returns the correct structure
                db.is_category_empty.mockReturnValue(true); // Assume empty for this test
                db.delete_category.mockReturnValue(false); // Mock DB delete failure (returns boolean)

                const res = await agent.post('/categories/12/delete');

                expect(res.statusCode).toEqual(302);
                expect(res.headers.location).toEqual('/texts?message=Failed+to+delete+folder.+Folder+not+found.'); // Controller message for false return
                expect(db.is_category_empty).toHaveBeenCalledWith(12, 999);
                expect(db.delete_category).toHaveBeenCalledWith(12, 999); // Correct order: categoryId, userId
            });
        });

        // Removed describe block for POST /texts/:id/move as the route no longer exists

    }); // End Text Management Flow describe

});