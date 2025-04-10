// Helper function to display errors in a Bootstrap Modal
function showErrorModal(message) {
    const modalElement = document.getElementById('errorModal');
    const modalBody = document.getElementById('errorModalBody');

    if (!modalElement || !modalBody) {
        console.error('Error modal elements (#errorModal or #errorModalBody) not found.');
        // Fallback to native alert if modal elements are missing
        alert(`Error: ${message}`);
        return;
    }

    modalBody.textContent = message; // Set the error message text

    // Ensure Bootstrap's Modal class is available
    if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        const errorModal = new bootstrap.Modal(modalElement);
        errorModal.show();
    } else {
        console.error('Bootstrap Modal component not found. Falling back to alert.');
        alert(`Error: ${message}`);
    }
}
document.addEventListener('DOMContentLoaded', () => {
    const buyButtons = document.querySelectorAll('.buy-button');
    const coinCountElement = document.getElementById('coin-count'); // Assuming header has this ID
    // Note: No need for alertContainer anymore
    buyButtons.forEach(button => {
        button.addEventListener('click', async (event) => {
            const itemId = event.target.dataset.itemId;
            if (!itemId) {
                console.error('Item ID not found on button.');
                showErrorModal('Error: Could not identify the item.');
                return;
            }

            // Optional: Add visual feedback that request is processing
            button.disabled = true;
            button.textContent = 'Processing...';

            try {
                const response = await fetch('/store/buy', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        // Add CSRF token header if implemented
                    },
                    body: JSON.stringify({ itemId: itemId })
                });

                // Check if the request was successful (status code 2xx)
                if (response.ok) {
                    const result = await response.json(); // Parse JSON only on success
                    if (result.success) {
                        // alert(result.message || 'Purchase successful!'); // Removed success alert
                        // Update coin count in the header if element exists and new count provided
                        if (coinCountElement && result.newCoinCount !== undefined) {
                            coinCountElement.textContent = result.newCoinCount;
                        }
                        // Update button state to "Owned" and disable it
                        button.textContent = 'Owned';
                        button.disabled = true;
                    } else {
                        // Handle cases where the server indicates failure in the JSON (though response.ok was true - less common)
                        showErrorModal(`Purchase failed: ${result.message || 'Unknown server issue'}`);
                        button.disabled = false;
                        button.textContent = 'Buy Now';
                    }
                } else {
                    // Handle non-2xx responses (like 400, 409, 500)
                    let alertMessage = `Purchase failed (Status: ${response.status})`; // Default message
                    try {
                        const errorResult = await response.json();
                        // Use the server's specific message if available
                        if (errorResult.message) {
                            // For known client errors (like insufficient funds), just show the message
                            if (response.status === 400 || response.status === 409) {
                                alertMessage = errorResult.message;
                            } else {
                                // For other errors, prepend "Purchase failed:"
                                alertMessage = `Purchase failed: ${errorResult.message}`;
                            }
                        }
                    } catch (e) {
                        console.warn('Could not parse error response JSON. Displaying status code message.');
                    }
                    showErrorModal(alertMessage); // Show the determined message in the modal
                    button.disabled = false; // Re-enable button on failure
                    button.textContent = 'Buy Now';
                }

            } catch (error) {
                console.error('Error during fetch:', error);
                showErrorModal('An error occurred while trying to purchase the item. Please try again.');
                button.disabled = false; // Re-enable button on error
                button.textContent = 'Buy Now';
            }
        });
    });
});