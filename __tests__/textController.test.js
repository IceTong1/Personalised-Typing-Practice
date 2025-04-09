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

jest.mock('../models/db', () => ({
    get_texts: jest.fn(),
    add_text: jest.fn(),
    get_text: jest.fn(),
    update_text: jest.fn(),
    delete_text: jest.fn(),
    save_progress: jest.fn(),
    update_text_order: jest.fn(),
    create_category: jest.fn(),
    get_categories: jest.fn(),
    delete_category: jest.fn(),
    get_folders: jest.fn(),
    get_all_categories_flat: jest.fn(), // Added mock function
    get_files: jest.fn(),
    create_folder: jest.fn(),
    get_file_metadata: jest.fn(),
    delete_file: jest.fn(),
    delete_folder: jest.fn(),
}));

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
        if (userId === 1 && (textId === 100 || textId === 101)) {
            req.text = {
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
        }
    }),
}));

// Mock the entire text processing utility module
jest.mock('../utils/textProcessing', () => ({
    cleanupText: jest.fn((text) => text || ''), // Simple pass-through mock for cleanup
    processPdfUpload: jest.fn(), // Mock the PDF processing function
}));

// Import fs and path for the real PDF test
const fs = require('fs');
const path = require('path');

// No longer need to mock fs, tmp, child_process directly as they are used within the mocked processPdfUpload
// jest.mock('fs'); // Keep fs mocked generally, but requireActual in specific test
// jest.mock('tmp');
// jest.mock('child_process');

// No longer need to mock multer as it's used inline in the controller route
// --- Require Controller AFTER mocks ---
// No longer need to require fs, tmp, child_process here
// Require the controller AFTER mocks are set up
const textControllerRouter = require('../controllers/textController');
// Import the mocked functions to access their mock properties (e.g., mockResolvedValue)
const { cleanupText, processPdfUpload } = require('../utils/textProcessing');
const db = require('../models/db');
const {
    requireLogin, // eslint-disable-line no-unused-vars
    requireOwnership, // eslint-disable-line no-unused-vars
} = require('../middleware/authMiddleware');

// Helper to find route handlers
const findHandler = (method, pathPattern) => {
    const layer = textControllerRouter.stack.find((l) => {
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
            `Handler for ${method.toUpperCase()} ${pathPattern} not found`
        );
    // Return the actual handler function (often the last in the stack)
    return layer.route.stack[layer.route.stack.length - 1].handle;
};

// Helper to create mock request/response
const mockRequest = (
    sessionData = {},
    bodyData = {},
    queryData = {},
    paramsData = {},
    fileData = null
) => {
    const user = sessionData.user || { id: 1, username: 'testuser' };
    return {
        session: { user, ...sessionData },
        body: bodyData,
        query: queryData,
        params: paramsData,
        file: fileData,
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
    res.setHeader = jest.fn().mockReturnValue(res);
    res.download = jest.fn((path, filename, callback) => {
        if (callback) callback(null);
        return res;
    });
    res.pipe = jest.fn();
    res.headersSent = false;
    return res;
};

// Mock fs.createReadStream return value at module scope
const mockReadStream = { pipe: jest.fn(), on: jest.fn() };
// fs.createReadStream is already mocked by jest.mock('fs')
// We need to set its return value in beforeEach AFTER clearAllMocks

describe('Text Controller', () => {
    // Controller is now required at the top level again
    const textControllerRouter = require('../controllers/textController');
    let req;
    let res;

    beforeEach(() => {
        jest.clearAllMocks(); // Clears history, calls, instances, and results
        res = mockResponse();

        // Reset mocks for the utility functions
        cleanupText.mockClear().mockImplementation((text) => text || ''); // Reset cleanup mock
        processPdfUpload.mockClear(); // Reset PDF processing mock

        // No longer need to reset fs, tmp, execFileSync mocks here

        // Re-mock middleware implementations if needed (though usually not necessary if stateless)
        // requireLogin.mockImplementation(...)
        // requireOwnership.mockImplementation(...)
    });

    // Profile routes moved to profileController.js

    // --- GET /add_text ---
    describe('GET /add_text', () => {
        const getAddTextHandler = findHandler('get', '/add_text');

        test('should render add_text view', async () => {
            req = mockRequest();
            db.get_all_categories_flat.mockReturnValue([]); // Mock successful category fetch
            await getAddTextHandler(req, res);

            // expect(requireLogin).toHaveBeenCalledTimes(1); // Removed check
            expect(res.render).toHaveBeenCalledWith('add_text', {
                user: req.session.user,
                error: null,
                title: '',
                content: '',
                categories: [], // Expect categories array now
                selectedFolderId: null, // Expect selectedFolderId to be passed (as null here)
            });
        });
    });

    // --- POST /add_text ---
    describe('POST /add_text', () => {
        const postAddTextHandler = findHandler('post', '/add_text');

        // Textarea Input
        test('should add text from textarea successfully', async () => {
            req = mockRequest(
                {},
                { title: 'New Text', content: 'Some content.' }
            );
            db.add_text.mockReturnValue(123);

            await postAddTextHandler(req, res);

            // expect(requireLogin).toHaveBeenCalledTimes(1); // Removed check
            expect(db.add_text).toHaveBeenCalledWith(
                req.session.user.id,
                'New Text',
                'Some content.',
                null
            ); // Added null for category_id
            expect(res.redirect).toHaveBeenCalledWith(
                '/texts?message=Text added successfully!'
            );
            expect(res.render).not.toHaveBeenCalled();
        });

        test('should fail if title is empty (textarea)', async () => {
            req = mockRequest({}, { title: '', content: 'Some content.' });
            await postAddTextHandler(req, res);

            expect(db.add_text).not.toHaveBeenCalled();
            expect(res.render).toHaveBeenCalledWith(
                'add_text',
                expect.objectContaining({ error: 'Title cannot be empty.' })
            );
            expect(res.redirect).not.toHaveBeenCalled();
        });

        test('should fail if content is empty (textarea)', async () => {
            req = mockRequest({}, { title: 'A Title', content: '' }); // No file either
            await postAddTextHandler(req, res);

            expect(db.add_text).not.toHaveBeenCalled();
            expect(res.render).toHaveBeenCalledWith(
                'add_text',
                expect.objectContaining({
                    error: 'Please provide text content or upload a PDF file.',
                })
            );
            expect(res.redirect).not.toHaveBeenCalled();
        });

        test('should fail if db.add_text fails (textarea)', async () => {
            req = mockRequest(
                {},
                { title: 'DB Fail Text', content: 'Content' }
            );
            db.add_text.mockReturnValue(-1); // Simulate DB error
            db.get_all_categories_flat.mockReturnValue([]); // Mock category fetch for error render

            await postAddTextHandler(req, res);

            expect(db.add_text).toHaveBeenCalledWith(
                req.session.user.id,
                'DB Fail Text',
                'Content',
                null
            ); // Added null for category_id
            expect(res.render).toHaveBeenCalledWith(
                'add_text',
                expect.objectContaining({
                    error: 'Failed to save text to the database. Please try again.',
                })
            );
            expect(res.redirect).not.toHaveBeenCalled();
        });

        // PDF Input
        const mockPdfFile = {
            fieldname: 'pdfFile',
            originalname: 'test.pdf',
            mimetype: 'application/pdf',
            buffer: Buffer.from('mock pdf content'), // Simulate file buffer from memoryStorage
            size: 12345,
        };

        test('should add text from PDF successfully', async () => {
            req = mockRequest({}, { title: 'PDF Text' }, {}, {}, mockPdfFile); // No content in body
            const resolvedCleanedText = 'Extracted PDF text.'; // Simulate cleanup result

            // Mock processPdfUpload BEFORE calling the handler
            processPdfUpload.mockResolvedValue(resolvedCleanedText);
            db.add_text.mockReturnValue(124); // Mock successful insert

            await postAddTextHandler(req, res);

            // Expect the mocked PDF processing function to be called
            expect(processPdfUpload).toHaveBeenCalledWith(mockPdfFile);

            // Check that db.add_text was called with the cleaned text from the mock
            expect(db.add_text).toHaveBeenCalledWith(
                req.session.user.id,
                'PDF Text',
                resolvedCleanedText, // Expect the result from the mocked processPdfUpload
                null // category_id
            );
            // No longer check fs, tmp, execFileSync

            expect(res.redirect).toHaveBeenCalledWith(
                '/texts?message=Text added successfully!'
            );
            expect(res.render).not.toHaveBeenCalled();
        });

        test('should fail if title is empty (PDF)', async () => {
            req = mockRequest({}, { title: '' }, {}, {}, mockPdfFile);
            await postAddTextHandler(req, res);

            // processPdfUpload should not be called if title is empty
            expect(processPdfUpload).not.toHaveBeenCalled();
            expect(db.add_text).not.toHaveBeenCalled();
            expect(res.render).toHaveBeenCalledWith(
                'add_text',
                expect.objectContaining({ error: 'Title cannot be empty.' })
            );
            expect(res.redirect).not.toHaveBeenCalled();
        });

        test('should fail if both PDF and content provided', async () => {
            req = mockRequest(
                {},
                { title: 'Both Inputs', content: 'Textarea content' },
                {},
                {},
                mockPdfFile
            );
            await postAddTextHandler(req, res);

            // processPdfUpload should not be called if both inputs provided
            expect(processPdfUpload).not.toHaveBeenCalled();
            expect(db.add_text).not.toHaveBeenCalled();
            expect(res.render).toHaveBeenCalledWith(
                'add_text',
                expect.objectContaining({
                    error: 'Please provide text content OR upload a PDF, not both.',
                })
            );
            expect(res.redirect).not.toHaveBeenCalled();
        });

        test('should fail if pdftotext command not found (ENOENT)', async () => {
            req = mockRequest({}, { title: 'PDF Error' }, {}, {}, mockPdfFile);
            const pdfError = new Error('pdftotext command not found');
            // Mock processPdfUpload to throw the specific error BEFORE calling handler
            processPdfUpload.mockRejectedValue(pdfError);
            db.get_all_categories_flat.mockReturnValue([]); // Mock category fetch for error render

            await postAddTextHandler(req, res);

            expect(processPdfUpload).toHaveBeenCalledWith(mockPdfFile);
            expect(db.add_text).not.toHaveBeenCalled();
            // No longer check fs, tmp, execFileSync
            expect(res.render).toHaveBeenCalledWith(
                'add_text',
                expect.objectContaining({
                    error: pdfError.message, // Expect the error message from the mocked rejection
                    categories: [], // Expect categories to be re-fetched
                })
            );
            expect(res.redirect).not.toHaveBeenCalled();
        });

        test('should fail if pdftotext extraction fails (other error)', async () => {
            req = mockRequest({}, { title: 'PDF Error' }, {}, {}, mockPdfFile);
            const pdfError = new Error('PDF processing failed');
            // Mock processPdfUpload to throw a generic error BEFORE calling handler
            processPdfUpload.mockRejectedValue(pdfError);
            db.get_all_categories_flat.mockReturnValue([]); // Mock category fetch for error render

            await postAddTextHandler(req, res);

            expect(processPdfUpload).toHaveBeenCalledWith(mockPdfFile);
            expect(db.add_text).not.toHaveBeenCalled();
            // No longer check fs, tmp, execFileSync
            expect(res.render).toHaveBeenCalledWith(
                'add_text',
                expect.objectContaining({
                    error: pdfError.message, // Expect the error message from the mocked rejection
                    categories: [],
                })
            );
            expect(res.redirect).not.toHaveBeenCalled();
        });

        test('should fail if extracted PDF text is empty', async () => {
            req = mockRequest({}, { title: 'Empty PDF' }, {}, {}, mockPdfFile);
            // Mock processPdfUpload to throw the specific "Could not extract" error
            const pdfError = new Error('Could not extract text using pdftotext. PDF might be empty or image-based.');
            processPdfUpload.mockRejectedValue(pdfError);
            db.get_all_categories_flat.mockReturnValue([]); // Mock category fetch for error render

            await postAddTextHandler(req, res);

            expect(processPdfUpload).toHaveBeenCalledWith(mockPdfFile);
            expect(db.add_text).not.toHaveBeenCalled();
            // No longer check fs, tmp, execFileSync
            expect(res.render).toHaveBeenCalledWith(
                'add_text',
                expect.objectContaining({
                    error: pdfError.message, // Expect the specific error message
                    categories: [],
                })
            );
            expect(res.redirect).not.toHaveBeenCalled();
        });

        test('should fail if db.add_text fails (PDF)', async () => {
            req = mockRequest(
                {},
                { title: 'PDF DB Fail' },
                {},
                {},
                mockPdfFile
            );
            // Mock processPdfUpload to resolve successfully
            processPdfUpload.mockResolvedValue('Some extracted text.');
            db.add_text.mockReturnValue(-1); // Simulate DB failure
            db.get_all_categories_flat.mockReturnValue([]); // Mock category fetch for error render

            await postAddTextHandler(req, res);

            expect(processPdfUpload).toHaveBeenCalledWith(mockPdfFile);
            // Check db.add_text was called correctly before failing
            expect(db.add_text).toHaveBeenCalledWith(
                req.session.user.id,
                'PDF DB Fail',
                'Some extracted text.', // Result from mocked processPdfUpload
                null // category_id
            );
            // No longer check fs, tmp, execFileSync

            // Mock processPdfUpload to resolve successfully
            processPdfUpload.mockResolvedValue('Some extracted text');

            // Re-run handler
            await postAddTextHandler(req, res);

            expect(processPdfUpload).toHaveBeenCalledWith(mockPdfFile);
            expect(db.add_text).toHaveBeenCalledWith(
                req.session.user.id,
                'PDF DB Fail',
                'Some extracted text.',
                null
            ); // Added null for category_id
            // No longer check fs.unlinkSync as it's internal to the mocked processPdfUpload function
            expect(res.render).toHaveBeenCalledWith(
                'add_text',
                expect.objectContaining({
                    error: 'Failed to save text to the database. Please try again.',
                })
            );
            expect(res.redirect).not.toHaveBeenCalled();
        });

        // --- Test with Real PDF and Real Processing ---
        test('should correctly process PDF with accents using real implementation', async () => {
            // --- Arrange ---
            // 1. Get real implementations (temporarily un-mock)
            const {
                processPdfUpload: realProcessPdfUpload,
                cleanupText: realCleanupText,
            } = jest.requireActual('../utils/textProcessing');

            // 2. Read the real PDF file content
            const pdfPath = path.join(__dirname, 'test_accent_issue.pdf');
            let pdfBuffer;
            try {
                pdfBuffer = fs.readFileSync(pdfPath);
            } catch (err) {
                throw new Error(`Failed to read test PDF at ${pdfPath}: ${err.message}`);
            }

            // 3. Create mock file object with real buffer
            const realPdfFile = {
                fieldname: 'pdfFile',
                originalname: 'test_accent_issue.pdf',
                mimetype: 'application/pdf',
                buffer: pdfBuffer,
                size: pdfBuffer.length,
            };

            // 4. Prepare mock request
            req = mockRequest({}, { title: 'Real Accent PDF' }, {}, {}, realPdfFile);

            // 5. Mock DB add function
            db.add_text.mockReturnValue(125); // Simulate successful DB insert

            // 6. Define expected cleaned text snippet (based on manual analysis)
            const expectedTextSnippet = "généré le 19 mars 2024";
            const expectedTextSnippet2 = "complèter un site web"; // Use grave accent as per source PDF typo
            const expectedTextSnippet3 = "données qu'à des utilisateurs authentifiés"; // Expect standard apostrophe and grave accent 'à'
            const expectedTextSnippet4 = "visuelle du site à l'aide"; // Use standard apostrophe
            const expectedTextSnippet5 = "largeur de l'écran"; // Use standard apostrophe


            // --- Act ---
            // Temporarily replace mocks with real functions for this test only
            const originalProcessPdf = processPdfUpload;
            const originalCleanup = cleanupText;
            processPdfUpload.mockImplementation(realProcessPdfUpload);
            cleanupText.mockImplementation(realCleanupText);

            await postAddTextHandler(req, res);

            // Restore mocks immediately after the call
            processPdfUpload.mockImplementation(originalProcessPdf);
            cleanupText.mockImplementation(originalCleanup);


            // --- Assert ---
            // Check if db.add_text was called
            expect(db.add_text).toHaveBeenCalledTimes(1);

            // Get the actual text passed to db.add_text
            const actualSavedText = db.add_text.mock.calls[0][2]; // Arg index 2 is the content

            // Check if the expected snippets are present in the cleaned text
            expect(actualSavedText).toContain(expectedTextSnippet);
            expect(actualSavedText).toContain(expectedTextSnippet2);
            expect(actualSavedText).toContain(expectedTextSnippet3);
            expect(actualSavedText).toContain(expectedTextSnippet4);
            expect(actualSavedText).toContain(expectedTextSnippet5);


            // Check redirection
            expect(res.redirect).toHaveBeenCalledWith('/texts?message=Text added successfully!');
            expect(res.render).not.toHaveBeenCalled();
        });
    });

    // --- GET /edit_text/:text_id ---
    describe('GET /edit_text/:text_id', () => {
        const getEditTextHandler = findHandler('get', '/edit_text/:text_id');

        test('should render edit_text view with text data', async () => {
            const textId = 100;
            req = mockRequest({}, {}, {}, { text_id: textId.toString() });
            // Simulate middleware attaching text
            req.text = {
                id: textId,
                user_id: 1,
                title: `Mock Text ${textId}`,
                content: 'Content',
                progress_index: 0,
            };
            db.get_all_categories_flat.mockReturnValue([]); // Mock category fetch for GET
            await getEditTextHandler(req, res);

            // expect(requireLogin).toHaveBeenCalledTimes(1); // Removed
            // expect(requireOwnership).toHaveBeenCalledTimes(1); // Removed
            expect(db.get_all_categories_flat).toHaveBeenCalledWith(
                req.session.user.id
            ); // Check category fetch
            expect(res.render).toHaveBeenCalledWith('edit_text', {
                user: req.session.user,
                text: req.text, // Check the text attached by middleware mock
                categories: [], // Expect categories array
                error: null,
            });
        });

        // Test for middleware failure is implicitly covered by testing middleware directly if needed,
        // or by checking the response when calling the route via a supertest setup (more complex).
        // For unit testing the handler, we assume middleware passed if handler is reached.
    });

    // --- POST /edit_text/:text_id ---
    describe('POST /edit_text/:text_id', () => {
        const postEditTextHandler = findHandler('post', '/edit_text/:text_id');

        test('should update text successfully', async () => {
            const textId = 100;
            req = mockRequest(
                {},
                { title: 'Updated Title', content: 'Updated Content' },
                {},
                { text_id: textId.toString() }
            );
            db.update_text.mockReturnValue(true);
            // Simulate middleware attaching text
            req.text = {
                id: textId,
                user_id: 1,
                title: 'Old Title',
                content: 'Old Content',
            };

            await postEditTextHandler(req, res);

            // expect(requireOwnership).toHaveBeenCalledTimes(1); // Removed
            expect(db.update_text).toHaveBeenCalledWith(
                textId.toString(),
                'Updated Title',
                'Updated Content',
                null
            ); // Added null for category_id
            expect(res.redirect).toHaveBeenCalledWith(
                '/texts?message=Text updated successfully!'
            );
            expect(res.render).not.toHaveBeenCalled();
        });

        test('should fail if title is empty', async () => {
            const textId = 100;
            req = mockRequest(
                {},
                { title: '', content: 'Content' },
                {},
                { text_id: textId.toString() }
            );
            // Simulate middleware attaching text for re-render
            req.text = { id: textId, title: '', content: 'Content' };

            await postEditTextHandler(req, res);

            expect(db.update_text).not.toHaveBeenCalled();
            expect(res.render).toHaveBeenCalledWith(
                'edit_text',
                expect.objectContaining({
                    error: 'Title and content cannot be empty.',
                    text: expect.objectContaining({
                        id: textId.toString(),
                        title: '',
                        content: 'Content',
                    }),
                })
            );
            expect(res.redirect).not.toHaveBeenCalled();
        });

        test('should fail if content is empty', async () => {
            const textId = 100;
            req = mockRequest(
                {},
                { title: 'Title', content: '' },
                {},
                { text_id: textId.toString() }
            );
            req.text = { id: textId, title: 'Title', content: '' };

            await postEditTextHandler(req, res);

            expect(db.update_text).not.toHaveBeenCalled();
            expect(res.render).toHaveBeenCalledWith(
                'edit_text',
                expect.objectContaining({
                    error: 'Title and content cannot be empty.',
                    text: expect.objectContaining({
                        id: textId.toString(),
                        title: 'Title',
                        content: '',
                    }),
                })
            );
            expect(res.redirect).not.toHaveBeenCalled();
        });

        test('should fail if db.update_text returns false', async () => {
            const textId = 100;
            req = mockRequest(
                {},
                { title: 'Updated Title', content: 'Updated Content' },
                {},
                { text_id: textId.toString() }
            );
            db.update_text.mockReturnValue(false);
            req.text = {
                id: textId,
                title: 'Updated Title',
                content: 'Updated Content',
            };

            await postEditTextHandler(req, res);

            expect(db.update_text).toHaveBeenCalled();
            expect(res.render).toHaveBeenCalledWith(
                'edit_text',
                expect.objectContaining({
                    error: 'Failed to update text. Please try again.',
                    text: expect.objectContaining({
                        id: textId.toString(),
                        title: 'Updated Title',
                        content: 'Updated Content',
                    }),
                })
            );
            expect(res.redirect).not.toHaveBeenCalled();
        });
    });

    // --- POST /delete_text/:text_id ---
    describe('POST /delete_text/:text_id', () => {
        const postDeleteTextHandler = findHandler(
            'post',
            '/delete_text/:text_id'
        );

        test('should delete text successfully', async () => {
            const textId = 100;
            req = mockRequest({}, {}, {}, { text_id: textId.toString() });
            db.delete_text.mockReturnValue(true);
            req.text = { id: textId, user_id: 1, category_id: null }; // Simulate middleware

            await postDeleteTextHandler(req, res);

            // expect(requireOwnership).toHaveBeenCalledTimes(1); // Removed
            expect(db.delete_text).toHaveBeenCalledWith(textId.toString());
            // Expect URL encoded by buildRedirectUrl (spaces as +, ! as %21)
            expect(res.redirect).toHaveBeenCalledWith(
                '/texts?message=Text+deleted+successfully%21'
            );
        });

        test('should redirect with message if db.delete_text returns false', async () => {
            const textId = 100;
            req = mockRequest({}, {}, {}, { text_id: textId.toString() });
            db.delete_text.mockReturnValue(false);
            req.text = { id: textId, user_id: 1, category_id: 5 }; // Simulate middleware

            await postDeleteTextHandler(req, res);

            expect(db.delete_text).toHaveBeenCalledWith(textId.toString());
            // Expect URL encoded by buildRedirectUrl (spaces as +, . as is)
            expect(res.redirect).toHaveBeenCalledWith(
                '/texts?message=Could+not+delete+text.+It+might+have+already+been+removed.&category_id=5'
            );
        });

        test('should handle unexpected errors during deletion', async () => {
            const textId = 100;
            req = mockRequest({}, {}, {}, { text_id: textId.toString() });
            const error = new Error('DB Error');
            db.delete_text.mockImplementation(() => {
                throw error;
            });
            req.text = { id: textId, user_id: 1 }; // Simulate middleware

            await postDeleteTextHandler(req, res);

            expect(db.delete_text).toHaveBeenCalledWith(textId.toString());
            // Expect URL encoded by buildRedirectUrl (spaces as +, . as is)
            expect(res.redirect).toHaveBeenCalledWith(
                '/texts?message=An+error+occurred+while+deleting+the+text.'
            );
        });
    });

    // --- Practice routes tests moved to __tests__/practiceController.test.js ---
});
