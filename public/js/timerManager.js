// public/js/timerManager.js
import { calculateWPM } from './statsUtils.js';

/**
 * Creates a timer manager object.
 * @param {object} state - The practice state object containing timer-related properties.
 * @param {HTMLElement} timerElement - The DOM element to display the timer.
 * @param {HTMLElement} wpmElement - The DOM element to display WPM.
 * @returns {object} - The timer manager instance.
 */
function createTimerManager(state, timerElement, wpmElement) {
    const manager = {
        state, // Reference to the shared state object
        timerElement,
        wpmElement,

        start() {
            if (
                !manager.state.timerRunning &&
                manager.state.currentDisplayLineIndex <
                    manager.state.lines.length
            ) {
                manager.state.startTime = manager.state.startTime || new Date();
                manager.state.timerRunning = true;
                // Clear any existing interval before starting a new one
                if (manager.state.timer) clearInterval(manager.state.timer);
                manager.state.timer = setInterval(manager.updateDisplay, 500);
                console.log('Timer started/resumed');
            }
        },

        stop() {
            if (manager.state.timer) {
                clearInterval(manager.state.timer);
                manager.state.timer = null; // Clear the timer ID
            }
            manager.state.timerRunning = false;
            console.log('Timer stopped');
        },

        updateDisplay() {
            if (!manager.state.startTime) return;
            const currentTime = new Date();
            manager.state.timeElapsed = Math.floor(
                (currentTime - manager.state.startTime) / 1000
            );
            if (manager.timerElement) {
                manager.timerElement.textContent = manager.state.timeElapsed;
            }
            // Update WPM display periodically
            if (manager.wpmElement) {
                manager.wpmElement.textContent = calculateWPM(
                    manager.state.totalTypedChars,
                    manager.state.timeElapsed
                );
            }
        },

        reset() {
            manager.stop();
            manager.state.startTime = null;
            manager.state.timeElapsed = 0;
            if (manager.timerElement) {
                manager.timerElement.textContent = '0'; // Reset display too
            }
        },
    };

    // Ensure updateDisplay has the correct 'this' context if needed,
    // but here it directly accesses manager properties via closure.
    // Binding might be necessary if passing updateDisplay as a callback directly elsewhere.
    // manager.updateDisplay = manager.updateDisplay.bind(manager);

    return manager;
}

export default createTimerManager;
