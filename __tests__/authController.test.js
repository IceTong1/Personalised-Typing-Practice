// Import the router we want to test (note: this might require adjustments if not directly testable)
// For unit testing controllers, it's often better to test the handler functions directly.
// However, since the handlers are defined inline, we'll mock req/res and call them.
// A better approach might be to refactor handlers into separate functions.

const authController = require('../controllers/authController'); // Assuming this exports the router
const db = require('../models/db');

// Mock the database module
jest.mock('../models/db');

// Helper function to create mock request and response objects
const mockRequest = (sessionData, bodyData) => {
  const req = {
    session: { ...sessionData, destroy: jest.fn((callback) => callback(null)) }, // Mock destroy with success callback
    body: { ...bodyData },
  };
  return req;
};

const mockResponse = () => {
  const res = {};
  res.render = jest.fn().mockReturnValue(res); // Chainable
  res.redirect = jest.fn().mockReturnValue(res); // Chainable
  res.status = jest.fn().mockReturnValue(res); // Chainable
  res.send = jest.fn().mockReturnValue(res); // Chainable
  return res;
};

// Find the specific route handler function within the router stack
// This is a bit complex and depends on Express internals, might break with updates.
// A refactor to export handlers directly would be more robust.
const findHandler = (method, path) => {
  const layer = authController.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) {
    throw new Error(`Handler for ${method.toUpperCase()} ${path} not found`);
  }
  // Return the actual handler function
  return layer.route.stack[layer.route.stack.length - 1].handle;
};


describe('Auth Controller', () => {

  let req;
  let res;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    res = mockResponse();
  });

  // --- Registration Tests (POST /register) ---
  describe('POST /register', () => {
    const registerHandler = findHandler('post', '/register');

    test('should register a new user successfully and redirect to /profile', () => {
      req = mockRequest({}, { username: 'newUser', password: 'password123', confirmPassword: 'password123' });
      db.user_exists.mockReturnValue(false);
      db.new_user.mockReturnValue(123); // Mock successful user creation

      registerHandler(req, res);

      expect(db.user_exists).toHaveBeenCalledWith('newUser');
      expect(db.new_user).toHaveBeenCalledWith('newUser', 'password123');
      expect(req.session.user).toEqual({ id: 123, username: 'newUser' });
      expect(res.redirect).toHaveBeenCalledWith('/profile');
      expect(res.render).not.toHaveBeenCalled();
    });

    test('should fail registration if passwords do not match', () => {
      req = mockRequest({}, { username: 'testUser', password: 'password123', confirmPassword: 'password456' });

      registerHandler(req, res);

      expect(db.user_exists).not.toHaveBeenCalled();
      expect(db.new_user).not.toHaveBeenCalled();
      expect(res.render).toHaveBeenCalledWith('register', { error: 'Passwords do not match.', user: null });
      expect(res.redirect).not.toHaveBeenCalled();
    });

    test('should fail registration if username already exists', () => {
      req = mockRequest({}, { username: 'existingUser', password: 'password123', confirmPassword: 'password123' });
      db.user_exists.mockReturnValue(true); // Mock username exists

      registerHandler(req, res);

      expect(db.user_exists).toHaveBeenCalledWith('existingUser');
      expect(db.new_user).not.toHaveBeenCalled();
      expect(res.render).toHaveBeenCalledWith('register', { error: 'Username already taken.', user: null });
      expect(res.redirect).not.toHaveBeenCalled();
    });

     test('should fail registration if username is empty', () => {
      req = mockRequest({}, { username: '', password: 'password123', confirmPassword: 'password123' });

      registerHandler(req, res);

      expect(db.user_exists).not.toHaveBeenCalled(); // Should fail before db check
      expect(db.new_user).not.toHaveBeenCalled();
      expect(res.render).toHaveBeenCalledWith('register', { error: 'Username and password are required.', user: null });
      expect(res.redirect).not.toHaveBeenCalled();
    });

     test('should fail registration if password is empty', () => {
      req = mockRequest({}, { username: 'testUser', password: '', confirmPassword: '' });

      registerHandler(req, res);

      expect(db.user_exists).not.toHaveBeenCalled(); // Should fail before db check
      expect(db.new_user).not.toHaveBeenCalled();
      expect(res.render).toHaveBeenCalledWith('register', { error: 'Username and password are required.', user: null });
      expect(res.redirect).not.toHaveBeenCalled();
    });


    test('should fail registration if database insertion fails', () => {
      req = mockRequest({}, { username: 'newUser', password: 'password123', confirmPassword: 'password123' });
      db.user_exists.mockReturnValue(false);
      db.new_user.mockReturnValue(-1); // Mock database failure

      registerHandler(req, res);

      expect(db.user_exists).toHaveBeenCalledWith('newUser');
      expect(db.new_user).toHaveBeenCalledWith('newUser', 'password123');
      expect(res.render).toHaveBeenCalledWith('register', { error: 'Registration failed. Please try again.', user: null });
      expect(res.redirect).not.toHaveBeenCalled();
    });
  });

  // --- Login Tests (POST /login) ---
  describe('POST /login', () => {
     const loginHandler = findHandler('post', '/login');

    test('should log in a user successfully and redirect to /profile', () => {
      req = mockRequest({}, { username: 'testUser', password: 'password123' });
      db.login.mockReturnValue(456); // Mock successful login

      loginHandler(req, res);

      expect(db.login).toHaveBeenCalledWith('testUser', 'password123');
      expect(req.session.user).toEqual({ id: 456, username: 'testUser' });
      expect(res.redirect).toHaveBeenCalledWith('/profile');
      expect(res.render).not.toHaveBeenCalled();
    });

    test('should fail login with invalid credentials', () => {
      req = mockRequest({}, { username: 'wrongUser', password: 'wrongPassword' });
      db.login.mockReturnValue(-1); // Mock failed login

      loginHandler(req, res);

      expect(db.login).toHaveBeenCalledWith('wrongUser', 'wrongPassword');
      expect(res.render).toHaveBeenCalledWith('login', { error: 'Invalid username or password.', user: null });
      expect(res.redirect).not.toHaveBeenCalled();
    });
  });

  // --- Logout Tests (GET /logout) ---
  describe('GET /logout', () => {
    const logoutHandler = findHandler('get', '/logout');

    test('should log out the user and redirect to /', () => {
      req = mockRequest({ user: { id: 1, username: 'testUser' } }); // Mock logged-in user

      logoutHandler(req, res);

      // Check that session.destroy was called
      // Note: We mocked destroy to call the callback immediately with null (no error)
      expect(req.session.destroy).toHaveBeenCalledTimes(1);
      // Ensure the callback logic (redirect) was executed
      expect(res.redirect).toHaveBeenCalledWith('/');
    });

     test('should redirect to / even if session destruction fails', () => {
        req = mockRequest({ user: { id: 1, username: 'testUser' } });
        const destroyError = new Error('Session destroy failed');
        // Override the mock for this specific test
        req.session.destroy = jest.fn((callback) => callback(destroyError));

        logoutHandler(req, res);

        expect(req.session.destroy).toHaveBeenCalledTimes(1);
        // Should still redirect even on error
        expect(res.redirect).toHaveBeenCalledWith('/');
    });
  });

  // --- GET /login Page Tests ---
  describe('GET /login', () => {
    const getLoginHandler = findHandler('get', '/login');

    test('should render login page if user is not logged in', () => {
      req = mockRequest({}); // No user in session

      getLoginHandler(req, res);

      expect(res.render).toHaveBeenCalledWith('login', { error: null, user: null });
      expect(res.redirect).not.toHaveBeenCalled();
    });

    test('should redirect to /profile if user is already logged in', () => {
      req = mockRequest({ user: { id: 1, username: 'testUser' } }); // User in session

      getLoginHandler(req, res);

      expect(res.redirect).toHaveBeenCalledWith('/profile');
      expect(res.render).not.toHaveBeenCalled();
    });
  });

  // --- GET /register Page Tests ---
  describe('GET /register', () => {
     const getRegisterHandler = findHandler('get', '/register');

    test('should render register page if user is not logged in', () => {
      req = mockRequest({}); // No user in session

      getRegisterHandler(req, res);

      expect(res.render).toHaveBeenCalledWith('register', { error: null, user: null });
      expect(res.redirect).not.toHaveBeenCalled();
    });

    test('should redirect to /profile if user is already logged in', () => {
      req = mockRequest({ user: { id: 1, username: 'testUser' } }); // User in session

      getRegisterHandler(req, res);

      expect(res.redirect).toHaveBeenCalledWith('/profile');
      expect(res.render).not.toHaveBeenCalled();
    });
  });
});