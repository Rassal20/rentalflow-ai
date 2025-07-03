// This file initializes the connection to Firebase for all your frontend pages.

// Your web app's Firebase configuration - Provided by you.
const firebaseConfig = {
  apiKey: "AIzaSyCPAoCQcLsSsQj9nS0UEuwcDrZmdyNq1xk",
  authDomain: "rentalflow-ai-app.firebaseapp.com",
  projectId: "rentalflow-ai-app",
  storageBucket: "rentalflow-ai-app.appspot.com", // This format is standard for Firestore SDKs
  messagingSenderId: "880755901556",
  appId: "1:880755901556:web:e86fb90fbdfb889094fd21"
};

// Initialize Firebase and make 'db' globally available for other scripts
let db; 
try {
  // This check prevents an error if the script is loaded multiple times.
  if (!firebase.apps.length) {
    const app = firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    console.log("Firebase client-side SDK initialized successfully.");
  } else {
    const app = firebase.app(); // if already initialized, use that one
    db = firebase.firestore();
    console.log("Firebase client-side SDK already initialized.");
  }
} catch (e) {
  console.error("CRITICAL: Error initializing Firebase on client-side:", e);
  // This error will now be more visible in the browser's developer console.
}
