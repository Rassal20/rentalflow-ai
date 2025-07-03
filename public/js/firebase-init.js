// This file initializes the connection to Firebase for all your frontend pages.

// Your web app's Firebase configuration - Provided by you.
const firebaseConfig = {
  apiKey: "AIzaSyCPAoCQcLsSsQj9nS0UEuwcDrZmdyNq1xk",
  authDomain: "rentalflow-ai-app.firebaseapp.com",
  projectId: "rentalflow-ai-app",
  storageBucket: "rentalflow-ai-app.firebasestorage.app",
  messagingSenderId: "880755901556",
  appId: "1:880755901556:web:e86fb90fbdfb889094fd21"
};

// Initialize Firebase
let db; // Make db globally accessible within this scope
try {
  if (!firebase.apps.length) {
    const app = firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    console.log("Firebase client-side SDK initialized successfully.");
  } else {
    const app = firebase.app();
    db = firebase.firestore();
    console.log("Firebase client-side SDK already initialized.");
  }
} catch (e) {
  console.error("Error initializing Firebase on client:", e);
}
