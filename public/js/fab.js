/**
 * @file fab.js
 * @description This script handles the injection and functionality of the Floating Action Button (FAB).
 * It dynamically loads the FAB's HTML, adds it to the current page, and sets up event listeners
 * to trigger the appropriate "add" modals on different pages.
 */

document.addEventListener('DOMContentLoaded', () => {
    // This ensures the script runs only after the main page content is loaded.
    
    // We fetch the FAB's HTML content from the server.
    fetch('/fab.html')
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.text();
        })
        .then(html => {
            // Once fetched, we inject the HTML at the end of the body.
            document.body.insertAdjacentHTML('beforeend', html);
            // After injection, we initialize the button's functionality.
            initializeFabEventListeners();
        })
        .catch(error => console.error('Error loading FAB component:', error));
});

/**
 * Initializes all the event listeners for the FAB menu items.
 * It links each menu button to the corresponding "add" button on the specific page.
 */
function initializeFabEventListeners() {
    const fabContainer = document.querySelector('.fab-container');
    if (!fabContainer) {
        console.error("FAB container not found after injection.");
        return;
    }

    // A helper function to trigger a click on a target element if it exists.
    const triggerClick = (elementId, pageName) => {
        const targetButton = document.getElementById(elementId);
        if (targetButton) {
            targetButton.click();
        } else {
            // Provide a helpful console message if the action isn't available on the current page.
            alert(`This action is available on the ${pageName} page.`);
        }
    };

    // Add Customer Action
    document.getElementById('fab-add-customer')?.addEventListener('click', () => {
        // The 'add-customer-button' is on the customers.html page.
        triggerClick('add-customer-button', 'Customers');
    });

    // Add Vehicle Action
    document.getElementById('fab-add-vehicle')?.addEventListener('click', () => {
        // The 'add-vehicle-button' is on the fleet.html page.
        triggerClick('add-vehicle-button', 'Vehicle Fleet');
    });

    // Add Booking Action
    document.getElementById('fab-add-booking')?.addEventListener('click', () => {
        // The 'add-booking-button' is on the bookings.html page.
        triggerClick('add-booking-button', 'Bookings');
    });

    // Add Transaction Action
    document.getElementById('fab-add-transaction')?.addEventListener('click', () => {
        // The 'add-transaction-button' is on the accounting.html page.
        triggerClick('add-transaction-button', 'Accounting');
    });
}
