// --- Dependencies ---
const { URLSearchParams } = require('url'); // Import URLSearchParams

/**
 * Builds a redirect URL with query parameters, handling '?' vs '&amp;' correctly.
 * @param {string} basePath The base path (e.g., '/texts')
 * @param {object} params An object containing query parameters (key-value pairs).
 * @returns {string} The full redirect URL.
 */
function buildRedirectUrl(basePath, params) {
    const searchParams = new URLSearchParams();
    Object.keys(params).forEach((key) => {
        if (params[key] !== null && params[key] !== undefined) {
            searchParams.append(key, params[key]);
        }
    });
    const queryString = searchParams.toString();
    return queryString ? `${basePath}?${queryString}` : basePath;
}

module.exports = {
    buildRedirectUrl,
};
