// Mock dependencies BEFORE requiring the controller or db
jest.mock('better-sqlite3', () => {
    const mockStatement = {
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn(),
        [Symbol.iterator]: jest.fn(function* mockIterator() {}), // eslint-disable-line no-empty-function
    };
    const mockDbInstance = {
        prepare: jest.fn(() => mockStatement),
        exec: jest.fn(),
        close: jest.fn(),
        pragma: jest.fn(() => []), // Prevent initialization errors in db.js
        transaction: jest.fn((fn) => jest.fn((...args) => fn(...args))), // Mock transaction
    };
    return jest.fn(() => mockDbInstance);
});

// Mock only the DB functions used by practiceController
jest.mock('../models/db', () => ({
    get_text: jest.fn(),
    save_progress: jest.fn(),
}));

// Mock middleware used by practiceController
jest.mock('../middleware/authMiddleware', () => ({
    requireLogin: jest.fn((req, res, next) => {
        if (!req.session) req.session = {};
        if (!req.session.user)
            req.session.user = { id: 1, username: 'testuser' };
        next();
    }),
    requireOwnership: jest.fn(async (req, res, next) => {
        const textId = parseInt(req.params.text_id, 10);
        const userId = req.session?.user?.id;
        // Simplified mock for practice tests - assumes ownership if user ID is 1 and text ID is 100
        if (userId === 1 && textId === 100) {
            req.text = {
                // Attach a minimal text object needed by the GET route
                id: textId,
                user_id: userId,
                title: `Mock Text ${textId}`,
                content: 'Content',
                progress_index: 0,
            };
            next();
        } else if (
            res &&
            typeof res.status === 'function' &&
            typeof res.send === 'function'
        ) {
            res.status(403).send('Forbidden');
        } else {
            console.error(
                'Mock Middleware Error: Response object not fully functional in requireOwnership.'
            );
            // Simulate error or just don't call next()
        }
    }),
}));

// --- Require Controller AFTER mocks ---
const practiceControllerRouter = require('../controllers/practiceController');
const db = require('../models/db');
const {
    requireLogin, // eslint-disable-line no-unused-vars
    requireOwnership, // eslint-disable-line no-unused-vars
} = require('../middleware/authMiddleware');

// Helper to find route handlers within the practiceControllerRouter
const findHandler = (method, pathPattern) => {
    const layer = practiceControllerRouter.stack.find((l) => {
        if (!l.route) return false;
        const expressPath = l.route.path;
        const methodMatch = l.route.methods[method];
        // Use regex to match express paths like /:param
        const pattern = expressPath.replace(/:[^/]+/g, '([^/]+)');
        const regex = new RegExp(`^${pattern}$`);
        return methodMatch && regex.test(pathPattern.split('?')[0]); // Test against path part only
    });
    if (!layer)
        throw new Error(
            `Handler for ${method.toUpperCase()} ${pathPattern} not found in practiceController`
        );
    // Return the actual handler function (often the last in the stack)
    return layer.route.stack[layer.route.stack.length - 1].handle;
};

// Helper to create mock request/response
const mockRequest = (
    sessionData = {},
    bodyData = {},
    queryData = {},
    paramsData = {}
) => {
    const user = sessionData.user || { id: 1, username: 'testuser' };
    return {
        session: { user, ...sessionData },
        body: bodyData,
        query: queryData,
        params: paramsData,
        text: null, // Reset potentially attached text
    };
};

const mockResponse = () => {
    const res = {};
    res.render = jest.fn().mockReturnValue(res);
    res.redirect = jest.fn().mockReturnValue(res);
    res.status = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.headersSent = false;
    return res;
};

describe('Practice Controller', () => {
    let req;
    let res;

    beforeEach(() => {
        jest.clearAllMocks(); // Clears history, calls, instances, and results
        res = mockResponse();
    });

    // --- GET /:text_id (Practice Page) ---
    describe('GET /:text_id', () => {
        const getPracticeHandler = findHandler('get', '/:text_id');

        test('should render practice view with text data and progress', async () => {
            req = mockRequest({}, {}, {}, { text_id: '100' }); // Owned text ID
            const mockTextData = {
                id: 100,
                title: 'Mock Text 100',
                content: 'Practice content.',
                progress_index: 5,
            };
            db.get_text.mockReturnValue(mockTextData);

            // Simulate requireOwnership attaching the text (already done by mock)
            await requireOwnership(req, res, jest.fn()); // Call middleware to attach req.text if needed by handler logic directly
            await getPracticeHandler(req, res);

            expect(db.get_text).toHaveBeenCalledWith(
                '100',
                req.session.user.id
            );
            expect(res.render).toHaveBeenCalledWith('practice', {
                user: req.session.user,
                text: mockTextData,
            });
            expect(res.redirect).not.toHaveBeenCalled();
        });


        // Note: Ownership failure is handled by the requireOwnership mock redirecting/sending 403,
        // so we don't explicitly test the handler for that case here, assuming middleware works.
    });

    // --- POST /api/progress ---
    describe('POST /api/progress', () => {
        const postProgressHandler = findHandler('post', '/api/progress');

        test('should save progress successfully', async () => {
            req = mockRequest({}, { text_id: '100', progress_index: 50 });
            db.save_progress.mockReturnValue(true); // Simulate successful save

            await postProgressHandler(req, res);

            expect(db.save_progress).toHaveBeenCalledWith(
                req.session.user.id,
                100,
                50
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ success: true });
        });

        test('should return 500 if db.save_progress fails', async () => {
            req = mockRequest({}, { text_id: '100', progress_index: 50 });
            db.save_progress.mockReturnValue(false); // Simulate DB error

            await postProgressHandler(req, res);

            expect(db.save_progress).toHaveBeenCalledWith(
                req.session.user.id,
                100,
                50
            );
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Database error saving progress.',
            });
        });
    }); // Close describe('POST /api/progress', ...)

});
