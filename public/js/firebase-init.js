// This file initializes the connection to Firebase for all your frontend pages.

// IMPORTANT: Replace these placeholder values with your ACTUAL Firebase project configuration.
// You can find this in your Firebase project settings under "General" -> "Your apps" -> "SDK setup and configuration".
const firebaseConfig = {
  apiKey: "AIzaSyAZL-KL0vyCw4qixtzJhP7H8PuyytDWQhs", // This is the key you provided
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
try {
  const app = firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  console.log("Firebase client initialized successfully.");
} catch (e) {
  console.error("Error initializing Firebase on client:", e);
}
