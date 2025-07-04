require('dotenv').config();
const admin = require('firebase-admin');
const firebase = require('firebase/app');
require('firebase/firestore');
require('firebase/auth');

// Initialize Admin SDK with proper private key handling
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL
  }),
  databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
});

// Initialize Client SDK
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: `${process.env.FIREBASE_PROJECT_ID}.appspot.com`,
  messagingSenderId: "880755901556",
  appId: "1:880755901556:web:e86fb90fbdfb889094fd21"
};

firebase.initializeApp(firebaseConfig);

// Export services
module.exports = {
  admin,
  firebase,
  dbAdmin: admin.firestore(),
  dbClient: firebase.firestore(),
  authAdmin: admin.auth(),
  authClient: firebase.auth()
};