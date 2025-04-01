// Mock better-sqlite3 BEFORE requiring db or controller
jest.mock('better-sqlite3', () => {
  const mockStatement = {
    run: jest.fn(),
    get: jest.fn(),
    all: jest.fn(),
    [Symbol.iterator]: jest.fn(function*() {}),
  };
  const mockDbInstance = {
    prepare: jest.fn(() => mockStatement),
    exec: jest.fn(),
    close: jest.fn(),
    pragma: jest.fn((pragmaString) => {
        if (pragmaString.startsWith('table_info')) {
            return []; // Return empty array for .some() check
        }
        return undefined;
    }),
    transaction: jest.fn((fn) => {
        const mockTransactionFn = jest.fn((...args) => {});
        return mockTransactionFn;
    }),
  };
  return jest.fn(() => mockDbInstance);
});

// --- Explicit Manual Mock for models/db ---
jest.mock('../models/db', () => ({
    db: {},
    user_exists: jest.fn(),
    new_user: jest.fn(),
    login: jest.fn(),
    get_texts: jest.fn(),
    get_text: jest.fn(),
    add_text: jest.fn(),
    update_text: jest.fn(),
    delete_text: jest.fn(),
    save_progress: jest.fn(),
    update_text_order: jest.fn(),
    create_category: jest.fn(),
    get_categories: jest.fn(),
    delete_category: jest.fn(),
    move_text_to_category: jest.fn(),
    get_folders: jest.fn(),
    get_files: jest.fn(),
    add_file: jest.fn(),
    create_folder: jest.fn(),
    get_file_metadata: jest.fn(),
    delete_file: jest.fn(),
    delete_folder: jest.fn(),
}));

// Now require the controller and other dependencies
const fileController = require('../controllers/fileController');
const db = require('../models/db');
const fs = require('fs');
const path = require('path');

// Mock fs separately
jest.mock('fs');


// Helper to create mock request/response
const mockRequest = (sessionData, bodyData = {}, queryData = {}, paramsData = {}, fileData = null) => {
  return {
    session: { user: { id: 1, ...sessionData } },
    body: bodyData,
    query: queryData,
    params: paramsData,
    file: fileData,
  };
};

const mockResponse = () => {
  const res = {};
  res.render = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.download = jest.fn((path, filename, callback) => {
      if (callback) callback(null);
      return res;
  });
  res.pipe = jest.fn();
  res.headersSent = false;
  return res;
};

// Mock fs.createReadStream to return a mock stream object
const mockReadStream = {
  pipe: jest.fn(),
  on: jest.fn(),
};
// Ensure fs functions used by the controller are mocked
fs.existsSync.mockReturnValue(true);
fs.unlink.mockImplementation((path, callback) => callback(null));
fs.createReadStream.mockReturnValue(mockReadStream);
fs.mkdirSync.mockReturnValue(undefined);


describe('File Controller', () => {
  let req;
  let res;

  // Define the correct upload directory path relative to the project root
  // This should match the path used by the controller
  const PROJECT_ROOT = path.join(__dirname, '..'); // Assuming __tests__ is at the root
  const UPLOAD_DIR_EXPECTED = path.join(PROJECT_ROOT, 'uploads');


  beforeEach(() => {
    jest.clearAllMocks();
    res = mockResponse();
    res.headersSent = false;
    fs.existsSync.mockReturnValue(true);
    fs.unlink.mockImplementation((path, callback) => callback(null));
    fs.createReadStream.mockReturnValue(mockReadStream);
    fs.mkdirSync.mockReturnValue(undefined);
  });

  // --- Get Files and Folders Tests ---
  describe('getFilesAndFolders', () => {
    test('should render files view with folders and files for root', async () => {
      req = mockRequest({}, {}, { folderId: null });
      const mockFolders = [{ id: 10, name: 'Folder A' }];
      const mockFiles = [{ id: 100, original_name: 'File A.txt' }];
      db.get_folders.mockReturnValue(mockFolders);
      db.get_files.mockReturnValue(mockFiles);

      await fileController.getFilesAndFolders(req, res);

      expect(db.get_folders).toHaveBeenCalledWith(1, null);
      expect(db.get_files).toHaveBeenCalledWith(1, null);
      expect(res.render).toHaveBeenCalledWith('files', {
        title: 'My Files',
        user: req.session.user,
        folders: mockFolders,
        files: mockFiles,
        currentFolderId: null,
        message: null,
        error: null
      });
    });

    test('should render files view for a specific folder', async () => {
      req = mockRequest({}, {}, { folderId: '10' });
      const mockFolders = [];
      const mockFiles = [{ id: 101, original_name: 'File B.pdf' }];
      db.get_folders.mockReturnValue(mockFolders);
      db.get_files.mockReturnValue(mockFiles);

      await fileController.getFilesAndFolders(req, res);

      expect(db.get_folders).toHaveBeenCalledWith(1, 10);
      expect(db.get_files).toHaveBeenCalledWith(1, 10);
      expect(res.render).toHaveBeenCalledWith('files', expect.objectContaining({
        currentFolderId: 10,
        folders: mockFolders,
        files: mockFiles,
      }));
    });

    test('should handle errors during fetching files/folders', async () => {
      req = mockRequest({}, {}, { folderId: null });
      const error = new Error('DB Error');
      db.get_folders.mockImplementation(() => { throw error; });

      await fileController.getFilesAndFolders(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith("Error loading your files. Please try again later.");
      expect(res.render).not.toHaveBeenCalled();
    });
  });

  // --- Upload File Tests ---
  describe('uploadFile', () => {
    // Use the correctly defined UPLOAD_DIR_EXPECTED for mock file path
    const mockFileData = {
      originalname: 'test.txt',
      filename: 'unique-test.txt',
      path: path.join(UPLOAD_DIR_EXPECTED, 'unique-test.txt'), // Use correct base path
      size: 1234,
      mimetype: 'text/plain',
    };

    test('should upload file successfully to root', async () => {
      req = mockRequest({}, { folderId: null }, {}, {}, mockFileData);
      db.add_file.mockReturnValue(200);

      await fileController.uploadFile(req, res);

      // The controller calculates relativePath based on its UPLOAD_DIR.
      // The stored path should be relative to that UPLOAD_DIR.
      const expectedRelativePath = 'unique-test.txt';
      expect(db.add_file).toHaveBeenCalledWith(1, null, 'test.txt', 'unique-test.txt', expectedRelativePath, 1234, 'text/plain');
      expect(res.redirect).toHaveBeenCalledWith('/files?message=File uploaded successfully!');
      expect(fs.unlink).not.toHaveBeenCalled();
    });

     test('should upload file successfully to a specific folder', async () => {
      req = mockRequest({}, { folderId: '15' }, {}, {}, mockFileData);
      db.add_file.mockReturnValue(201);

      await fileController.uploadFile(req, res);

      const expectedRelativePath = 'unique-test.txt';
      expect(db.add_file).toHaveBeenCalledWith(1, 15, 'test.txt', 'unique-test.txt', expectedRelativePath, 1234, 'text/plain');
      expect(res.redirect).toHaveBeenCalledWith('/files?folderId=15&message=File uploaded successfully!');
      expect(fs.unlink).not.toHaveBeenCalled();
    });


    test('should redirect with error if no file is provided', async () => {
      req = mockRequest({}, { folderId: null }, {}, {}, null);

      await fileController.uploadFile(req, res);

      expect(db.add_file).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/files?error=No file uploaded.');
    });

    test('should redirect with error and delete file if DB insert fails', async () => {
      req = mockRequest({}, { folderId: '10' }, {}, {}, mockFileData);
      db.add_file.mockReturnValue(-1);

      await fileController.uploadFile(req, res);

      expect(db.add_file).toHaveBeenCalled();
      // Check fs.unlink uses the correct full path provided in req.file
      expect(fs.unlink).toHaveBeenCalledWith(mockFileData.path, expect.any(Function));
      expect(res.redirect).toHaveBeenCalledWith('/files?folderId=10&error=Error saving file information.');
    });

    test('should handle general errors during upload and attempt cleanup', async () => {
        req = mockRequest({}, { folderId: null }, {}, {}, mockFileData);
        const error = new Error('Processing Error');
        db.add_file.mockImplementation(() => { throw error; });

        await fileController.uploadFile(req, res);

        expect(db.add_file).toHaveBeenCalled();
        expect(fs.unlink).toHaveBeenCalledWith(mockFileData.path, expect.any(Function));
        expect(res.redirect).toHaveBeenCalledWith('/files?error=Server error during upload.');
    });
  });

  // --- Create Folder Tests ---
  describe('createFolder', () => {
    test('should create folder successfully in root', async () => {
      req = mockRequest({}, { folderName: 'New Folder', parentFolderId: null });
      db.create_folder.mockReturnValue(30);

      await fileController.createFolder(req, res);

      expect(db.create_folder).toHaveBeenCalledWith(1, 'New Folder', null);
      expect(res.redirect).toHaveBeenCalledWith('/files?message=Folder created successfully!');
    });

     test('should create folder successfully in a parent folder', async () => {
      req = mockRequest({}, { folderName: 'Sub Folder', parentFolderId: '25' });
      db.create_folder.mockReturnValue(31);

      await fileController.createFolder(req, res);

      expect(db.create_folder).toHaveBeenCalledWith(1, 'Sub Folder', 25);
      expect(res.redirect).toHaveBeenCalledWith('/files?folderId=25&message=Folder created successfully!');
    });

    test('should redirect with error if folder name is empty', async () => {
      req = mockRequest({}, { folderName: ' ', parentFolderId: null });

      await fileController.createFolder(req, res);

      expect(db.create_folder).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/files?error=Folder name cannot be empty.');
    });

    test('should redirect with error if folder creation fails (e.g., duplicate)', async () => {
      req = mockRequest({}, { folderName: 'Existing Folder', parentFolderId: null });
      db.create_folder.mockReturnValue(-1);

      await fileController.createFolder(req, res);

      expect(db.create_folder).toHaveBeenCalledWith(1, 'Existing Folder', null);
      expect(res.redirect).toHaveBeenCalledWith('/files?error=Folder creation failed. Name might exist.');
    });

     test('should handle server errors during folder creation', async () => {
        req = mockRequest({}, { folderName: 'Error Folder', parentFolderId: null });
        const error = new Error('DB Error');
        db.create_folder.mockImplementation(() => { throw error; });

        await fileController.createFolder(req, res);

        expect(db.create_folder).toHaveBeenCalled();
        expect(res.redirect).toHaveBeenCalledWith('/files?error=Server error creating folder.');
    });
  });

  // --- View File Tests ---
  describe('viewFile', () => {
    // Use the correctly defined UPLOAD_DIR_EXPECTED
    const mockFileMetadata = {
        id: 50, user_id: 1, folder_id: null, original_name: 'document.pdf',
        stored_name: 'unique-doc.pdf', file_path: 'unique-doc.pdf', // Relative path stored
        file_size: 50000, mime_type: 'application/pdf', uploaded_at: 'sometime'
    };
    // Calculate the expected full path based on the correct UPLOAD_DIR
    const expectedFilePath = path.join(UPLOAD_DIR_EXPECTED, mockFileMetadata.file_path);

    test('should stream PDF file inline', async () => {
      req = mockRequest({}, {}, {}, { fileId: '50' });
      db.get_file_metadata.mockReturnValue(mockFileMetadata);
      fs.existsSync.mockReturnValue(true);

      await fileController.viewFile(req, res);

      expect(db.get_file_metadata).toHaveBeenCalledWith(50, 1);
      expect(fs.existsSync).toHaveBeenCalledWith(expectedFilePath); // Check against correct path
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'inline; filename="document.pdf"');
      expect(fs.createReadStream).toHaveBeenCalledWith(expectedFilePath); // Check against correct path
      expect(mockReadStream.pipe).toHaveBeenCalledWith(res);
      expect(res.download).not.toHaveBeenCalled();
    });

    test('should trigger download for non-PDF files', async () => {
        const mockTxtMetadata = { ...mockFileMetadata, id: 51, original_name: 'notes.txt', stored_name: 'unique-notes.txt', file_path: 'unique-notes.txt', mime_type: 'text/plain' };
        const expectedTxtPath = path.join(UPLOAD_DIR_EXPECTED, mockTxtMetadata.file_path); // Use correct base path
        req = mockRequest({}, {}, {}, { fileId: '51' });
        db.get_file_metadata.mockReturnValue(mockTxtMetadata);
        fs.existsSync.mockReturnValue(true);

        await fileController.viewFile(req, res);

        expect(db.get_file_metadata).toHaveBeenCalledWith(51, 1);
        expect(fs.existsSync).toHaveBeenCalledWith(expectedTxtPath); // Check against correct path
        expect(res.setHeader).not.toHaveBeenCalledWith('Content-Type', 'application/pdf');
        expect(fs.createReadStream).not.toHaveBeenCalled();
        expect(res.download).toHaveBeenCalledWith(expectedTxtPath, 'notes.txt', expect.any(Function)); // Check against correct path
    });


    test('should return 400 for invalid file ID', async () => {
      req = mockRequest({}, {}, {}, { fileId: 'invalid' });

      await fileController.viewFile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith("Invalid file ID.");
      expect(db.get_file_metadata).not.toHaveBeenCalled();
    });

    test('should return 404 if file metadata not found', async () => {
      req = mockRequest({}, {}, {}, { fileId: '999' });
      db.get_file_metadata.mockReturnValue(null);

      await fileController.viewFile(req, res);

      expect(db.get_file_metadata).toHaveBeenCalledWith(999, 1);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith("File not found or you don't have permission to access it.");
    });

    test('should return 404 if file not found on disk', async () => {
      req = mockRequest({}, {}, {}, { fileId: '50' });
      db.get_file_metadata.mockReturnValue(mockFileMetadata);
      fs.existsSync.mockReturnValue(false);

      await fileController.viewFile(req, res);

      expect(db.get_file_metadata).toHaveBeenCalledWith(50, 1);
      expect(fs.existsSync).toHaveBeenCalledWith(expectedFilePath); // Check against correct path
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith("File not found.");
      expect(res.download).not.toHaveBeenCalled();
      expect(fs.createReadStream).not.toHaveBeenCalled();
    });

     test('should handle server errors during file view', async () => {
        req = mockRequest({}, {}, {}, { fileId: '50' });
        const error = new Error('DB Error');
        db.get_file_metadata.mockImplementation(() => { throw error; });

        await fileController.viewFile(req, res);

        expect(db.get_file_metadata).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.send).toHaveBeenCalledWith("Server error accessing file.");
    });
  });

  // --- Delete File Tests ---
  describe('deleteFile', () => {
     // Use the correctly defined UPLOAD_DIR_EXPECTED
     const mockFileMetadata = {
        id: 60, user_id: 1, file_path: 'to-delete.txt' // Relative path stored
     };
     // Calculate the expected full path based on the correct UPLOAD_DIR
     const expectedFilePath = path.join(UPLOAD_DIR_EXPECTED, mockFileMetadata.file_path);

    test('should delete file and metadata successfully', async () => {
      req = mockRequest({}, { currentFolderId: null }, {}, { fileId: '60' });
      db.get_file_metadata.mockReturnValue(mockFileMetadata);
      db.delete_file.mockReturnValue(true);

      let unlinkCallback;
      fs.unlink.mockImplementation((path, callback) => {
          unlinkCallback = callback;
          unlinkCallback(null); // Simulate success
      });

      await fileController.deleteFile(req, res);

      expect(db.get_file_metadata).toHaveBeenCalledWith(60, 1);
      expect(fs.unlink).toHaveBeenCalledWith(expectedFilePath, expect.any(Function)); // Check against correct path
      expect(db.delete_file).toHaveBeenCalledWith(60, 1);
      expect(res.redirect).toHaveBeenCalledWith('/files?message=File deleted successfully!');
    });

    test('should delete DB record even if physical file deletion fails (but not ENOENT)', async () => {
        req = mockRequest({}, { currentFolderId: '10' }, {}, { fileId: '60' });
        db.get_file_metadata.mockReturnValue(mockFileMetadata);
        const deleteError = new Error('Disk Error');
        deleteError.code = 'EPERM';
        db.delete_file.mockReturnValue(true);

        let unlinkCallback;
        fs.unlink.mockImplementation((path, callback) => {
            unlinkCallback = callback;
            unlinkCallback(deleteError); // Simulate error
        });

        await fileController.deleteFile(req, res);

        expect(db.get_file_metadata).toHaveBeenCalledWith(60, 1);
        expect(fs.unlink).toHaveBeenCalledWith(expectedFilePath, expect.any(Function)); // Check against correct path
        expect(db.delete_file).toHaveBeenCalledWith(60, 1);
        expect(res.redirect).toHaveBeenCalledWith('/files?folderId=10&message=File deleted successfully!');
    });

     test('should delete DB record if physical file is already gone (ENOENT)', async () => {
        req = mockRequest({}, {}, {}, { fileId: '60' });
        db.get_file_metadata.mockReturnValue(mockFileMetadata);
        const deleteError = new Error('File not found');
        deleteError.code = 'ENOENT';
        db.delete_file.mockReturnValue(true);

        let unlinkCallback;
        fs.unlink.mockImplementation((path, callback) => {
            unlinkCallback = callback;
            unlinkCallback(deleteError); // Simulate ENOENT
        });

        await fileController.deleteFile(req, res);

        expect(fs.unlink).toHaveBeenCalledWith(expectedFilePath, expect.any(Function)); // Check against correct path
        expect(db.delete_file).toHaveBeenCalledWith(60, 1);
        expect(res.redirect).toHaveBeenCalledWith('/files?message=File deleted successfully!');
    });


    test('should redirect with error if file metadata not found', async () => {
      req = mockRequest({}, { currentFolderId: null }, {}, { fileId: '999' });
      db.get_file_metadata.mockReturnValue(null);

      await fileController.deleteFile(req, res);

      expect(db.get_file_metadata).toHaveBeenCalledWith(999, 1);
      expect(fs.unlink).not.toHaveBeenCalled();
      expect(db.delete_file).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.redirect).toHaveBeenCalledWith('/files?error=File not found or permission denied.');
    });

    test('should redirect with error if DB deletion fails', async () => {
        req = mockRequest({}, { currentFolderId: null }, {}, { fileId: '60' });
        db.get_file_metadata.mockReturnValue(mockFileMetadata);
        db.delete_file.mockReturnValue(false);

        let unlinkCallback;
        fs.unlink.mockImplementation((path, callback) => {
            unlinkCallback = callback;
            unlinkCallback(null); // Simulate physical delete ok
        });

        await fileController.deleteFile(req, res);

        expect(fs.unlink).toHaveBeenCalledWith(expectedFilePath, expect.any(Function)); // Check against correct path
        expect(db.delete_file).toHaveBeenCalledWith(60, 1);
        expect(res.redirect).toHaveBeenCalledWith('/files?error=Failed to delete file record.');
    });

     test('should handle server errors during file deletion', async () => {
        req = mockRequest({}, {}, {}, { fileId: '60' });
        const error = new Error('DB Error');
        db.get_file_metadata.mockImplementation(() => { throw error; });

        await fileController.deleteFile(req, res);

        expect(db.get_file_metadata).toHaveBeenCalled();
        expect(fs.unlink).not.toHaveBeenCalled();
        expect(db.delete_file).not.toHaveBeenCalled();
        expect(res.redirect).toHaveBeenCalledWith('/files?error=Server error deleting file.');
    });
  });

  // --- Delete Folder Tests ---
  describe('deleteFolder', () => {
    test('should delete empty folder successfully', async () => {
      req = mockRequest({}, { parentFolderId: null }, {}, { folderId: '70' });
      db.get_files.mockReturnValue([]);
      db.get_folders.mockReturnValue([]);
      db.delete_folder.mockReturnValue(true);

      await fileController.deleteFolder(req, res);

      expect(db.get_files).toHaveBeenCalledWith(1, 70);
      expect(db.get_folders).toHaveBeenCalledWith(1, 70);
      expect(db.delete_folder).toHaveBeenCalledWith(70, 1);
      expect(res.redirect).toHaveBeenCalledWith('/files?message=Folder deleted successfully!');
    });

    test('should redirect with error if folder is not empty (contains files)', async () => {
      req = mockRequest({}, { parentFolderId: '10' }, {}, { folderId: '71' });
      db.get_files.mockReturnValue([{ id: 100 }]);
      db.get_folders.mockReturnValue([]);

      await fileController.deleteFolder(req, res);

      expect(db.get_files).toHaveBeenCalledWith(1, 71);
      expect(db.get_folders).toHaveBeenCalledWith(1, 71);
      expect(db.delete_folder).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/files?folderId=10&error=Folder must be empty before deletion.');
    });

     test('should redirect with error if folder is not empty (contains subfolders)', async () => {
      req = mockRequest({}, { parentFolderId: null }, {}, { folderId: '72' });
      db.get_files.mockReturnValue([]);
      db.get_folders.mockReturnValue([{ id: 80 }]);

      await fileController.deleteFolder(req, res);

      expect(db.get_files).toHaveBeenCalledWith(1, 72);
      expect(db.get_folders).toHaveBeenCalledWith(1, 72);
      expect(db.delete_folder).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/files?error=Folder must be empty before deletion.');
    });

    test('should redirect with error if folder not found or permission denied', async () => {
      req = mockRequest({}, { parentFolderId: null }, {}, { folderId: '999' });
      db.get_files.mockReturnValue([]);
      db.get_folders.mockReturnValue([]);
      db.delete_folder.mockReturnValue(false);

      await fileController.deleteFolder(req, res);

      expect(db.get_files).toHaveBeenCalledWith(1, 999);
      expect(db.get_folders).toHaveBeenCalledWith(1, 999);
      expect(db.delete_folder).toHaveBeenCalledWith(999, 1);
      expect(res.redirect).toHaveBeenCalledWith('/files?error=Folder not found or permission denied.');
    });

     test('should handle server errors during folder deletion', async () => {
        req = mockRequest({}, {}, {}, { folderId: '70' });
        const error = new Error('DB Error');
        db.get_files.mockImplementation(() => { throw error; });

        await fileController.deleteFolder(req, res);

        expect(db.get_files).toHaveBeenCalled();
        expect(db.delete_folder).not.toHaveBeenCalled();
        expect(res.redirect).toHaveBeenCalledWith('/files?error=Server error deleting folder.');
    });
  });
});