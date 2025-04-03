/**
 * Applies a short visual effect (like a flash) to a target span.
 * @param {HTMLElement} targetSpan - The span element to apply the effect to.
 * @param {string} effectClass - The CSS class defining the effect (e.g., 'effect-correct').
 */
export function applyEffect(targetSpan, effectClass) {
    if (!targetSpan) return;
    targetSpan.classList.remove('effect-correct', 'effect-incorrect');
    // Force reflow to restart animation if class is re-added quickly
    // eslint-disable-next-line no-unused-vars
    const _ = targetSpan.offsetWidth; // Force reflow
    targetSpan.classList.add(effectClass);
    // Use animationend event for cleanup
    targetSpan.addEventListener(
        'animationend',
        () => {
            targetSpan.classList.remove(effectClass);
        },
        { once: true }
    );
}

/**
 * Renders the text into the custom input container using spans.
 * @param {string} text - The text to render.
 * @param {HTMLElement} typingInputContent - The container element for the input spans.
 */
export function renderCustomInput(text, typingInputContent) {
    if (!typingInputContent) return; // Guard clause
    typingInputContent.innerHTML = ''; // Clear previous content
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const span = document.createElement('span');
        // Use textContent for safety, but innerHTML needed for space representation
        if (char === ' ') {
            // Represent space with a non-breaking space or style differently
            span.innerHTML = '&nbsp;';
            span.style.minWidth = '0.25em'; // Ensure space takes width
        } else {
            span.textContent = char;
        }
        typingInputContent.appendChild(span);
    }
}

/**
 * Updates the position of the blinking cursor based on the content of the custom input.
 * @param {HTMLElement} typingCursor - The cursor element.
 * @param {HTMLElement} typingInputArea - The main container area for the custom input.
 * @param {HTMLElement} typingInputContent - The element containing the character spans.
 * @param {boolean} isCustomInputFocused - Whether the custom input currently has focus.
 */
export function updateCursorPosition(
    typingCursor,
    typingInputArea,
    typingInputContent,
    isCustomInputFocused
) {
    if (!typingCursor || !typingInputArea || !typingInputContent) return; // Guard clauses

    if (!isCustomInputFocused) {
        typingCursor.style.opacity = '0'; // Hide cursor if not focused
        return;
    }
    // Ensure cursor is potentially visible (blink animation handles actual visibility)
    typingCursor.style.opacity = '1';

    const spans = typingInputContent.querySelectorAll('span');
    const lastSpan = spans.length > 0 ? spans[spans.length - 1] : null;
    // Use content div for positioning and padding calculation
    const contentStyle = getComputedStyle(typingInputContent);
    const contentRect = typingInputContent.getBoundingClientRect();
    const containerRect = typingInputArea.getBoundingClientRect(); // Still need container for offset calculation

    // Start cursor based on content div's padding
    let cursorLeft = parseFloat(contentStyle.paddingLeft);
    let cursorTop = parseFloat(contentStyle.paddingTop);

    if (lastSpan) {
        // Position after the last character span
        const lastSpanRect = lastSpan.getBoundingClientRect();
        // Calculate position relative to the *content* div's top-left corner
        cursorLeft = lastSpanRect.right - contentRect.left;
        cursorTop = lastSpanRect.top - contentRect.top;

        // Basic wrap detection: If last span's right edge is close to container's right edge,
        // assume cursor should be on the next line. This is approximate.
        // Use content div's width and padding for threshold calculation
        const rightThreshold =
            contentRect.width - parseFloat(contentStyle.paddingRight) - 10; // 10px buffer
        if (
            lastSpanRect.right - contentRect.left > rightThreshold &&
            spans.length > 0
        ) {
            // Check spans.length > 0
            cursorLeft = parseFloat(contentStyle.paddingLeft); // Move to start of next line (relative to content div)
            cursorTop += lastSpanRect.height; // Move down one line height (approx)
        }
    }
    // else: cursor stays at padding top/left

    // Apply calculated position relative to the *container* div (#typing-input-area)
    // The cursor is a sibling of the content div, so its left/top are relative to the container.
    // We calculated cursorLeft/Top relative to the content div, now adjust for the content div's offset.
    const contentOffsetX = contentRect.left - containerRect.left;
    const contentOffsetY = contentRect.top - containerRect.top;

    const finalCursorLeft = contentOffsetX + cursorLeft;
    const finalCursorTop = contentOffsetY + cursorTop;

    // Bounds check relative to the container
    const containerStyle = getComputedStyle(typingInputArea); // Get container style for bounds check
    const maxLeft =
        containerRect.width -
        parseFloat(containerStyle.paddingRight) -
        typingCursor.offsetWidth; // Adjust for cursor width
    const maxTop =
        containerRect.height -
        parseFloat(containerStyle.paddingBottom) -
        typingCursor.offsetHeight;

    typingCursor.style.left = `${Math.min(finalCursorLeft, maxLeft)}px`;
    typingCursor.style.top = `${Math.min(finalCursorTop, maxTop)}px`;
}
