/**
 * Saves the current typing progress to the server.
 * @param {string} textId - The ID of the text being practiced.
 * @param {number} progressIndex - The current overall character index representing progress.
 * @param {HTMLElement} saveButton - The save button element (to disable/enable).
 */
export default async function saveProgressToServer(
    textId,
    progressIndex,
    saveButton
) {
    if (!textId) {
        console.warn('Cannot save progress: Text ID is missing.');
        // Optionally provide user feedback here (e.g., alert)
        return;
    }
    if (progressIndex === undefined || progressIndex < 0) {
        console.warn(
            'Cannot save progress: Invalid progress index.',
            progressIndex
        );
        return;
    }

    console.log(
        `Attempting to save progress: textId=${textId}, progressIndex=${progressIndex}`
    );

    if (saveButton) saveButton.disabled = true; // Disable button during save

    try {
        const response = await fetch('/practice/api/progress', {
            // Corrected path
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Include authentication headers if needed (e.g., JWT token)
                // 'Authorization': `Bearer ${your_token_here}`
            },
            body: JSON.stringify({
                text_id: textId, // Changed key to snake_case
                progress_index: progressIndex, // Changed key to snake_case
            }),
        });

        if (response.ok) {
            const result = await response.json();
            console.log('Progress saved successfully:', result);
            // Optionally provide visual feedback to the user (e.g., temporary message)
            if (saveButton) {
                // Add a temporary success indicator
                const originalText = saveButton.textContent;
                saveButton.textContent = 'Saved!';
                saveButton.classList.add('saved');
                setTimeout(() => {
                    saveButton.textContent = originalText;
                    saveButton.classList.remove('saved');
                    saveButton.disabled = false; // Re-enable after timeout
                }, 1500); // Show 'Saved!' for 1.5 seconds
            }
        } else {
            // Clone the response to allow reading the body multiple times
            const responseClone = response.clone();
            const errorData = await responseClone
                .json()
                .catch(async (parseError) => {
                    // If JSON parsing fails, try to get the raw text response
                    const rawText = await response
                        .text()
                        .catch(() => 'Could not read response text.');
                    console.error(
                        'Failed to parse JSON error response. Status:',
                        response.status,
                        'Raw response:',
                        rawText
                    );
                    // Return the standard fallback message for the alert
                    return { message: 'Failed to parse error response' };
                });
            console.error(
                'Failed to save progress:',
                response.status,
                response.statusText,
                errorData
            );
            // Provide more specific feedback based on errorData if possible
            alert(
                `Error saving progress: ${errorData.message || response.statusText}`
            );
            if (saveButton) saveButton.disabled = false; // Re-enable on failure
        }
    } catch (error) {
        console.error('Network or other error saving progress:', error);
        alert(`Network error saving progress: ${error.message}`);
        if (saveButton) saveButton.disabled = false; // Re-enable on network error
    }
    // Note: Button is re-enabled in success timeout or error handlers
}

/**
 * Sends incremental line statistics (time, accuracy) and increments coins.
 * @param {number} lineTimeSeconds - Time taken for the line in seconds.
 * @param {number} lineAccuracy - Accuracy achieved for the line (0-100).
 * @param {function} updateCoinDisplayCallback - Optional callback to update UI with new coin count.
 */
export async function sendLineCompletionStats(
    lineTimeSeconds,
    lineAccuracy,
    updateCoinDisplayCallback
) {
    if (
        lineTimeSeconds === undefined ||
        lineTimeSeconds < 0 ||
        lineAccuracy === undefined ||
        lineAccuracy < 0 ||
        lineAccuracy > 100
    ) {
        console.warn('Cannot send line stats: Invalid time or accuracy.', {
            lineTimeSeconds,
            lineAccuracy,
        });
        return;
    }

    console.log(
        `Attempting to send line stats: time=${lineTimeSeconds}s, accuracy=${lineAccuracy}%`
    );

    try {
        const response = await fetch('/practice/line-complete', {
            // Updated endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                line_time_seconds: lineTimeSeconds,
                line_accuracy: lineAccuracy,
            }),
        });

        if (response.ok) {
            const result = await response.json();
            console.log(
                'Line stats sent and coin incremented successfully:',
                result
            );
            if (
                result.success &&
                result.newCoinCount !== null &&
                updateCoinDisplayCallback
            ) {
                updateCoinDisplayCallback(result.newCoinCount); // Update UI if callback provided
            }
        } else {
            const errorData = await response
                .json()
                .catch(() => ({ message: 'Failed to parse error response' }));
            console.error(
                'Failed to send line stats/increment coin:',
                response.status,
                response.statusText,
                errorData
            );
            // Handle error appropriately, maybe alert user
        }
    } catch (error) {
        console.error('Network or other error sending line stats:', error);
        // Handle error appropriately
    }
}

/**
 * Sends the final text completion signal to the server (increments texts_practiced).
 * @param {string} textId - The ID of the completed text.
 */
export async function sendTextCompletionSignal(textId) {
    if (!textId) {
        console.warn('Cannot send text completion signal: Text ID is missing.');
        return;
    }

    console.log(`Attempting to send text completion signal: textId=${textId}`);

    try {
        const response = await fetch('/practice/api/complete', {
            // Endpoint for final completion signal
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text_id: textId, // Only send text_id
            }),
        });

        if (response.ok) {
            const result = await response.json();
            console.log('Text completion signal sent successfully:', result);
        } else {
            const errorData = await response
                .json()
                .catch(() => ({ message: 'Failed to parse error response' }));
            console.error(
                'Failed to send text completion signal:',
                response.status,
                response.statusText,
                errorData
            );
        }
    } catch (error) {
        console.error(
            'Network or other error sending text completion signal:',
            error
        );
    }
}
