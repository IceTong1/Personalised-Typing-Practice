# Typing Trainer Web App

A web application for practicing typing using custom texts.

## Setup and Running

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Run the Server:**
    ```bash
    node server.js
    ```
3.  Open your browser and navigate to `http://localhost:3000`.

## Features

*   **User Authentication:** Register new accounts and log in.
*   **Text Management:**
    *   Add new texts by typing directly or uploading PDF files.
    *   Edit existing texts.
    *   Delete texts.
*   **Typing Practice:** Practice typing the added texts with real-time feedback (implementation details not fully shown, assumed).
*   **Progress Tracking:** Saves your progress within each text.
*   **Text Reordering:** On the profile page (`/profile`), you can now click and drag your saved texts to reorder them. The new order is saved automatically.