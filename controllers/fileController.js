const path = require('path');
const fs = require('fs'); // File system module
const db = require('../models/db'); // Import database functions
const { v4: uuidv4 } = require('uuid'); // For generating unique filenames

// Define the base directory for uploads (relative to project root)
// Ensure this directory exists or is created on server start
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads'); // Store uploads outside 'controllers'

// Ensure upload directory exists (This check is also done in server.js, but good for robustness)
if (!fs.existsSync(UPLOAD_DIR)) {
    try {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        console.log(`Upload directory created by controller: ${UPLOAD_DIR}`);
    } catch (err) {
        console.error("Error creating upload directory from controller:", err);
        // Depending on the app structure, might want to throw or handle differently
    }
}

// Controller function to display folders and files
exports.getFilesAndFolders = async (req, res) => {
    const userId = req.session.user.id; // Get ID from user object in session
    // Get current folder ID from query params or default to root (null)
    const currentFolderId = req.query.folderId ? parseInt(req.query.folderId) : null;

    try {
        // Fetch subfolders and files for the current user and folder
        const folders = db.get_folders(userId, currentFolderId);
        const files = db.get_files(userId, currentFolderId);

        // TODO: Fetch breadcrumb trail if inside a subfolder

        res.render('files', { // Render the 'files.ejs' view
            title: 'My Files',
            user: req.session.user, // Pass user info if needed
            folders: folders,
            files: files,
            currentFolderId: currentFolderId,
            message: req.query.message || null, // Pass messages
            error: req.query.error || null      // Pass errors
            // breadcrumbs: [] // Add breadcrumbs later
        });
    } catch (error) {
        console.error("Error fetching files and folders:", error);
        res.status(500).send("Error loading your files. Please try again later.");
    }
};

// Controller function to handle file upload
exports.uploadFile = async (req, res) => {
    const userId = req.session.user.id; // Get ID from user object in session
    // Get target folder ID from the form data or default to root (null)
    const targetFolderId = req.body.folderId ? parseInt(req.body.folderId) : null;
    const redirectUrl = '/files' + (targetFolderId ? `?folderId=${targetFolderId}` : '');

    if (!req.file) {
        // This case might be handled by multer error handling in server.js now
        return res.redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'error=No file uploaded.');
    }

    try {
        const originalName = req.file.originalname;
        const storedName = req.file.filename; // Multer provides this via diskStorage
        const filePath = req.file.path; // Multer provides the full path
        const relativePath = path.relative(UPLOAD_DIR, filePath); // Store path relative to UPLOAD_DIR
        const fileSize = req.file.size;
        const mimeType = req.file.mimetype;

        // Add file metadata to the database
        const fileId = db.add_file(userId, targetFolderId, originalName, storedName, relativePath, fileSize, mimeType);

        if (fileId !== -1) {
            // Redirect back to the folder view with success message
            res.redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'message=File uploaded successfully!');
        } else {
            // Clean up uploaded file if DB insert failed
            fs.unlink(filePath, (err) => {
                if (err) console.error("Error deleting orphaned upload:", err);
            });
            res.redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'error=Error saving file information.');
        }
    } catch (error) {
        console.error("Error processing file upload:", error);
        // Clean up potentially uploaded file
        if (req.file && req.file.path) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error("Error deleting upload after error:", err);
            });
        }
        res.redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'error=Server error during upload.');
    }
};

// Controller function to handle folder creation
exports.createFolder = async (req, res) => {
    const userId = req.session.user.id; // Get ID from user object in session
    const { folderName, parentFolderId } = req.body; // Get name and optional parent ID from form
    const parentId = parentFolderId ? parseInt(parentFolderId) : null;
    const redirectUrl = '/files' + (parentId ? `?folderId=${parentId}` : '');

    if (!folderName || folderName.trim() === '') {
        return res.redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'error=Folder name cannot be empty.');
    }

    try {
        const newFolderId = db.create_folder(userId, folderName.trim(), parentId);

        if (newFolderId !== -1) {
            // Redirect back to the parent folder view with success message
             res.redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'message=Folder created successfully!');
        } else {
            // Handle potential errors (like duplicate name)
            res.redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'error=Folder creation failed. Name might exist.');
        }
    } catch (error) {
        console.error("Error creating folder:", error);
        res.redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'error=Server error creating folder.');
    }
};

// Controller function to view/download a file
exports.viewFile = async (req, res) => {
    const userId = req.session.user.id; // Get ID from user object in session
    const fileId = parseInt(req.params.fileId);

    if (isNaN(fileId)) {
        return res.status(400).send("Invalid file ID.");
    }

    try {
        const fileMetadata = db.get_file_metadata(fileId, userId);

        if (!fileMetadata) {
            return res.status(404).send("File not found or you don't have permission to access it.");
        }

        const filePath = path.join(UPLOAD_DIR, fileMetadata.file_path);

        // Check if file exists on disk
        if (!fs.existsSync(filePath)) {
            console.error(`File metadata exists in DB but file not found on disk: ${filePath} (DB ID: ${fileId})`);
            return res.status(404).send("File not found.");
            // Consider adding logic here to clean up the orphaned DB entry
        }

        // For PDFs, set Content-Type and Content-Disposition to inline for viewing in browser
        if (fileMetadata.mime_type === 'application/pdf') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${fileMetadata.original_name}"`); // Use original name
            fs.createReadStream(filePath).pipe(res);
        } else {
            // For other file types, trigger download
            res.download(filePath, fileMetadata.original_name, (err) => {
                if (err) {
                    console.error("Error sending file for download:", err);
                    // Avoid sending another response if headers already sent
                    if (!res.headersSent) {
                        res.status(500).send("Error downloading file.");
                    }
                }
            });
        }

    } catch (error) {
        console.error("Error viewing/downloading file:", error);
        res.status(500).send("Server error accessing file.");
    }
};

// Controller function to handle file deletion
exports.deleteFile = async (req, res) => {
    const userId = req.session.user.id;
    const fileId = parseInt(req.params.fileId);
    // Get the current folder ID to redirect back correctly
    const currentFolderId = req.body.currentFolderId ? parseInt(req.body.currentFolderId) : null;
    const redirectUrl = '/files' + (currentFolderId ? `?folderId=${currentFolderId}` : '');

    if (isNaN(fileId)) {
        return res.redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'error=Invalid file ID.');
    }

    try {
        // 1. Get file metadata to find the physical file path and verify ownership
        const fileMetadata = db.get_file_metadata(fileId, userId);

        if (!fileMetadata) {
            return res.status(404).redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'error=File not found or permission denied.');
        }

        const filePath = path.join(UPLOAD_DIR, fileMetadata.file_path);

        // 2. Delete the physical file
        fs.unlink(filePath, async (err) => {
            if (err && err.code !== 'ENOENT') { // Ignore error if file already not found
                // Log significant errors but proceed to delete DB record anyway
                console.error(`Error deleting physical file ${filePath} (DB ID: ${fileId}):`, err);
            } else {
                console.log(`Physical file deleted or already gone: ${filePath}`);
            }

            // 3. Delete the database record
            const deleted = db.delete_file(fileId, userId);
            if (!deleted) {
                // This shouldn't happen if get_file_metadata succeeded, but handle defensively
                console.error(`Failed to delete file metadata from DB for ID ${fileId} after physical delete attempt.`);
                 return res.redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'error=Failed to delete file record.');
            }

            res.redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'message=File deleted successfully!');
        });

    } catch (error) {
        console.error(`Server error deleting file ID ${fileId}:`, error);
        res.redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'error=Server error deleting file.');
    }
};

// Controller function to handle folder deletion
exports.deleteFolder = async (req, res) => {
    const userId = req.session.user.id;
    const folderId = parseInt(req.params.folderId);
    // Get the parent folder ID to redirect back correctly
    const parentFolderId = req.body.parentFolderId ? parseInt(req.body.parentFolderId) : null;
    const redirectUrl = '/files' + (parentFolderId ? `?folderId=${parentFolderId}` : '');

    if (isNaN(folderId)) {
        return res.redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'error=Invalid folder ID.');
    }

    try {
        // 1. Check if the folder is empty (contains no files or subfolders)
        const filesInFolder = db.get_files(userId, folderId);
        const subfolders = db.get_folders(userId, folderId);

        if (filesInFolder.length > 0 || subfolders.length > 0) {
            console.log(`Attempt to delete non-empty folder ID ${folderId} by User ${userId}`);
            return res.redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'error=Folder must be empty before deletion.');
        }

        // 2. Delete the folder record from the database
        const deleted = db.delete_folder(folderId, userId);

        if (!deleted) {
            // Folder not found or user doesn't own it
            console.log(`Failed delete attempt or folder not found/owned: Folder ID ${folderId}, User ${userId}`);
            return res.redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'error=Folder not found or permission denied.');
        }

        console.log(`Folder deleted: ID ${folderId}, User ${userId}`);
        res.redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'message=Folder deleted successfully!');

    } catch (error) {
        console.error(`Server error deleting folder ID ${folderId}:`, error);
        res.redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'error=Server error deleting folder.');
    }
};

// TODO: Add functions for moving files/folders
// TODO: Add functions for renaming files/folders