document.addEventListener('DOMContentLoaded', () => {
    // console.log("textsPage.js script loaded and DOM ready."); // DEBUG: Confirm script execution and DOM ready
    // const textListContainer = document.getElementById('text-list'); // Unused
    const deleteModalElement = document.getElementById(
        'deleteConfirmationModal'
    );
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    // const cancelDeleteBtn = document.getElementById('cancelDeleteBtn'); // Unused (rely on data-bs-dismiss)
    const deleteConfirmationMessage = document.getElementById(
        'deleteConfirmationMessage'
    );
    let deleteModalInstance = null; // To store the Bootstrap modal instance
    let textToDeleteId = null;
    let itemToDeleteElement = null;
    let folderToDeleteId = null;
    // eslint-disable-next-line no-unused-vars
    let folderToDeleteName = null; // Keep variable, disable lint warning
    let folderToDeleteElement = null; // The button's parent list item/div if needed for removal

    const alertPlaceholder = document.getElementById('alert-placeholder'); // Get the placeholder div

    if (deleteModalElement) {
        deleteModalInstance = new bootstrap.Modal(deleteModalElement);
        // console.log("Delete Modal Instance:", deleteModalInstance); // DEBUG: Check instance
    }

    // --- Helper Function for Bootstrap Alerts ---
    function showAlert(message, type = 'info') {
        if (!alertPlaceholder) return; // Do nothing if placeholder doesn't exist

        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        `;

        alertPlaceholder.append(wrapper);

        // Optional: Auto-dismiss after some time
        setTimeout(() => {
             const alertInstance = bootstrap.Alert.getOrCreateInstance(wrapper.firstChild);
             if (alertInstance) {
                 alertInstance.close();
             }
        }, 5000); // Auto-dismiss after 5 seconds
    }

    // Function to show confirmation modal for TEXTS
    function showTextDeleteConfirmation(textId, listItem) {
        textToDeleteId = textId;
        folderToDeleteId = null; // Ensure folder ID is null
        itemToDeleteElement = listItem;
        const textTitle = listItem
            .querySelector('span')
            .textContent.trim()
            .split('\n')[0]; // Try to get title
        deleteConfirmationMessage.textContent = `Are you sure you want to delete the text "${textTitle || 'this text'}"?`;
        if (deleteModalInstance) {
            deleteModalInstance.show();
        } else {
            console.error(
                'Delete confirmation modal instance not found! Cannot show confirmation.'
            );
        }
    }

    // Function to show confirmation modal for FOLDERS
    function showFolderDeleteConfirmation(folderId, folderName, buttonElement) {
        folderToDeleteId = folderId;
        textToDeleteId = null; // Ensure text ID is null
        folderToDeleteName = folderName;
        folderToDeleteElement = buttonElement.closest('.list-group-item'); // Store the list item for potential removal
        // Customize message for folders, including the warning about empty folders
        deleteConfirmationMessage.textContent = `Are you sure you want to delete the folder "${folderName || 'this folder'}"? Only empty folders can be deleted.`;
        if (deleteModalInstance) {
            deleteModalInstance.show();
        } else {
            console.error(
                'Delete confirmation modal instance not found! Cannot show confirmation.'
            );
        }
    }

    // Unified function to handle the actual deletion after confirmation
    async function handleGenericDeleteConfirmation() {
        let url;
        let elementToRemove;
        let successMessage;
        let failureMessageBase;

        if (textToDeleteId && itemToDeleteElement) {
            // Handle Text Deletion
            url = `/delete_text/${textToDeleteId}`;
            elementToRemove = itemToDeleteElement;
            successMessage = 'Text deleted successfully!';
            failureMessageBase = 'Could not delete text.';
        } else if (folderToDeleteId && folderToDeleteElement) {
            // Handle Folder Deletion
            url = `/categories/${folderToDeleteId}/delete`;
            elementToRemove = folderToDeleteElement;
            successMessage = 'Folder deleted successfully! (if empty)';
            // Note: Server-side handles the "not empty" case, client just reports success/failure from server
            failureMessageBase = 'Could not delete folder.';
        } else {
            console.error('Missing ID or element for deletion.');
            alert('Error: Could not identify the item to delete.');
            resetDeleteState(); // Reset state
            return;
        }

        if (deleteModalInstance) {
            deleteModalInstance.hide(); // Hide modal immediately
        }

        let response;
        try {
            // Use POST for deletion as per the form methods
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    // Accept JSON, but server might redirect with HTML on success/failure
                    Accept: 'application/json, text/html',
                },
            });

            // Check for successful status codes (e.g., 200 OK, or 3xx Redirection which implies success on server)
            if (
                response.ok ||
                (response.status >= 300 && response.status < 400)
            ) {
                // Check if the server redirected (common pattern after POST success/failure)
                if (response.redirected) {
                    // If redirected, assume success/failure message is handled by the server via flash messages on the new page
                    console.log(
                        `Deletion request for ${url} resulted in a redirect to ${response.url}. Assuming server handled notification.`
                    );
                    // Force a page reload to see the result and flash message
                    window.location.reload();
                    // Alternatively, could try to parse flash message from redirected page, but reload is simpler
                } else {
                    // If no redirect, try to parse JSON (e.g., for API-style responses)
                    const contentType = response.headers.get('content-type');
                    if (
                        contentType &&
                        contentType.includes('application/json')
                    ) {
                        const result = await response.json();
                        if (result.success) {
                            removeElementVisually(
                                elementToRemove,
                                successMessage
                            );
                        } else {
                            // Server responded OK but with { success: false }
                            console.error(
                                'Server indicated failure:',
                                result.message
                            );
                            alert(
                                `Error: ${result.message || failureMessageBase}`
                            );
                        }
                    } else {
                        // Response was OK but not JSON and not a redirect - might be unexpected HTML
                        console.warn(
                            `Deletion request for ${url} succeeded with status ${response.status} but received unexpected content type: ${contentType}. Assuming success.`
                        );
                        removeElementVisually(elementToRemove, successMessage);
                        // Or force reload if unsure: window.location.reload();
                    }
                }
            } else {
                // Handle 4xx/5xx errors
                let errorMsg = `${failureMessageBase} Server error: ${response.status} ${response.statusText}`;
                try {
                    const errorResult = await response.json(); // Try parsing error JSON
                    errorMsg = errorResult.message || errorMsg;
                } catch (e) {
                    /* Ignore JSON parsing error if status was already bad */
                }
                throw new Error(errorMsg); // Throw to be caught below
            }
        } catch (error) {
            console.error('Caught error object during deletion:', error);
            console.error('Error message:', error.message);
            if (response) {
                console.error(
                    `Response status: ${response.status} ${response.statusText}`
                );
                try {
                    console.error(
                        'Response headers:',
                        JSON.stringify(
                            Object.fromEntries(response.headers.entries())
                        )
                    );
                } catch (headerErr) {
                    /* Ignore */
                }
            }
            alert(
                `An unexpected error occurred. Check browser console for details. Error: ${error.message}`
            );
        } finally {
            resetDeleteState(); // Reset state regardless of outcome
        }
    }

    // Helper to remove element visually
    function removeElementVisually(element, logMessage) {
        if (element) {
            element.style.transition = 'opacity 0.5s ease';
            element.style.opacity = '0';
            setTimeout(() => {
                element.remove();
                console.log(logMessage);
                // TODO: Add a more visible success notification (e.g., toast)
            }, 500);
        }
    }

    // Helper to reset deletion state variables
    function resetDeleteState() {
        textToDeleteId = null;
        itemToDeleteElement = null;
        folderToDeleteId = null;
        folderToDeleteName = null;
        folderToDeleteElement = null;
    }

    // Add listener to the main confirm button in the modal
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener(
            'click',
            handleGenericDeleteConfirmation
        ); // Use the unified handler
    }

    // Optional: Add listener for modal close events (e.g., clicking backdrop, close button, cancel button)
    if (deleteModalElement) {
        deleteModalElement.addEventListener('hidden.bs.modal', () => {
            // Reset state if modal is closed without confirming
            // Reset state if modal is closed without confirming
            console.log('Deletion modal closed.');
            resetDeleteState(); // Reset all delete state vars
        });
    }

    // Event delegation attached to the body for robustness
    document.body.addEventListener('click', (event) => {
        // console.log("Click detected on body. Target:", event.target); // DEBUG: Check listener on body

        const textDeleteButton = event.target.closest('.delete-btn');
        const folderDeleteButton = event.target.closest('.delete-folder-btn');
        const summarizeButton = event.target.closest('.summarize-btn'); // Added check for summarize button

        if (textDeleteButton) {
            event.preventDefault(); // Stop default action (important if it's inside a link/form)
            event.stopPropagation(); // Stop event from bubbling further up
            // console.log("Text delete button clicked."); // DEBUG: Check button detection

            const listItem = textDeleteButton.closest('.list-group-item');
            const textId = listItem?.dataset.id;

            if (textId && listItem) {
                showTextDeleteConfirmation(textId, listItem);
            } else {
                // console.error("Text ID or listItem missing:", textId, listItem); // DEBUG: Check data retrieval
                console.error(
                    'Could not find text ID or list item for text deletion.'
                );
                alert('Error: Could not identify the text to delete.');
            }
        } else if (folderDeleteButton) {
            event.preventDefault(); // Stop default action
            event.stopPropagation(); // Stop event from bubbling
            // console.log("Folder delete button clicked."); // DEBUG: Check button detection

            const folderId = folderDeleteButton.dataset.categoryId;
            const folderName = folderDeleteButton.dataset.categoryName;

            if (folderId && folderName) {
                showFolderDeleteConfirmation(
                    folderId,
                    folderName,
                    folderDeleteButton
                );
            } else {
                // console.error("Folder ID or Name missing:", folderId, folderName); // DEBUG: Check data retrieval
                console.error(
                    'Could not find folder ID or name for folder deletion.'
                );
                alert('Error: Could not identify the folder to delete.');
            }
        } else if (summarizeButton) {
            event.preventDefault();
            event.stopPropagation();
            console.log('Summarize button clicked.'); // DEBUG

            const textId = summarizeButton.dataset.textId;
            if (!textId) {
                console.error('Text ID missing from summarize button.');
                alert('Error: Could not identify the text to summarize.');
                return;
            }

            summarizeButton.disabled = true;
            summarizeButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Summarizing...'; // Show loading state

            fetch(`/texts/summarize/${textId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json', // Expect JSON response
                    // Add authentication headers if needed (e.g., JWT token)
                    // 'Authorization': `Bearer ${your_token_here}`
                },
            })
                .then(async (response) => {
                    if (!response.ok) {
                        // Try to parse error message from JSON body
                        let errorData = { message: `HTTP error! status: ${response.status}` };
                        try {
                            errorData = await response.json();
                        } catch (e) { /* Ignore parsing error if body isn't JSON */ }
                        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                })
                .then((result) => {
                    console.log('Summarization successful:', result);
                    showAlert(`Summary created successfully! New text title: "${result.newTextTitle}". The page will reload shortly.`, 'success');
                    // Restore button state immediately after success message shown
                    summarizeButton.disabled = false;
                    summarizeButton.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i>'; // Restore original icon
                    summarizeButton.title = 'Summarize with AI'; // Restore title

                    // Refresh the page after a short delay to allow user to see the message
                    setTimeout(() => {
                         window.location.reload();
                    }, 3000); // Reload after 3 seconds
                })
                .catch((error) => {
                    console.error('Error summarizing text:', error);
                    showAlert(`Failed to summarize text: ${error.message}`, 'danger'); // Use Bootstrap alert for errors
                    // Restore button state on error
                    summarizeButton.disabled = false;
                    summarizeButton.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i>'; // Restore original icon
                    summarizeButton.title = 'Summarize with AI'; // Restore title
                });
                // No finally block needed here as success/catch handle button state and reload
        }
    });
});
