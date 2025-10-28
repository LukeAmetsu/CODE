document.addEventListener('DOMContentLoaded', () => {
    console.log("PCALC.js loaded");

    if (typeof initializeSharedUI === 'function') {
        console.log("Initializing shared UI...");
        initializeSharedUI();
    } else {
        console.error("initializeSharedUI function not found. Make sure shared-utils.js is loaded correctly.");
    }

    // Other PCALC specific logic will go here
});