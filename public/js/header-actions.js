/**
 * @file header-actions.js
 * @description This script handles the functionality for the fixed "Add" buttons in the page header.
 * It intelligently navigates to the correct page if the user is not already there,
 * and then triggers the corresponding modal to open upon page load.
 */

document.addEventListener('DOMContentLoaded', () => {
    // This function is called after the main document is loaded.
    // We find all buttons in the header with a 'data-action' attribute and attach listeners.
    const actionButtons = document.querySelectorAll('#header-actions button[data-action]');
    
    actionButtons.forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.action;
            const targetPage = button.dataset.targetPage;
            const buttonId = button.dataset.buttonId;

            if (action && targetPage && buttonId) {
                handleHeaderAction(targetPage, action, buttonId);
            }
        });
    });
});

/**
 * Handles a click on a header action button.
 * @param {string} targetPage - The URL of the page where the action exists (e.g., '/customers.html').
 * @param {string} modalAction - A unique key to store in sessionStorage (e.g., 'customer').
 * @param {string} buttonId - The ID of the button on the target page that opens the modal.
 */
function handleHeaderAction(targetPage, modalAction, buttonId) {
    // Check if the current page's path ends with the target page URL.
    if (window.location.pathname.endsWith(targetPage)) {
        // If we are on the correct page, just find the button and click it.
        const targetButton = document.getElementById(buttonId);
        if (targetButton) {
            targetButton.click();
        } else {
            console.error(`Header action failed: Button with ID "${buttonId}" not found on ${targetPage}.`);
        }
    } else {
        // If we are on a different page, store the intended action and navigate.
        sessionStorage.setItem('openModal', modalAction);
        window.location.href = targetPage;
    }
}
