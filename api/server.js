/*
 * RentalFlow AI Server - FINAL PLATFORM-AGNOSTIC VERSION
 * ---------------------------------------------------------
 * This version explicitly serves static files and listens on 0.0.0.0
 * to ensure compatibility with cloud hosts like Render.
 */

const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const app = express();

// --- INITIALIZE FIREBASE ADMIN (SECURE RENDER METHOD) ---
let db;
try {
  if (process.env.FIREBASE_CREDENTIALS && !admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin SDK initialized successfully.");
    db = admin.firestore();
  } else if (admin.apps.length) {
    db = admin.firestore();
  }
} catch (error) {
  console.error("Firebase initialization failed:", error.message);
}

// --- MIDDLEWARE ---
app.use(express.json());
// Serve static files (like dashboard.html) from the 'public' directory
app.use(express.static(path.join(__dirname, '../public')));


// --- CONFIGURATION ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_PERSONA_PROMPT = `You are a professional AI sales agent...`; // Abridged

// --- DATABASE HELPER FUNCTIONS ---
async function getFleetData() {
    if (!db) throw new Error("Database not initialized.");
    const snapshot = await db.collection('fleet').get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// --- API ENDPOINTS for the DASHBOARD ---
app.get('/api/fleet', async (req, res) => {
    try {
        const fleet = await getFleetData();
        res.status(200).json(fleet);
    } catch (error) {
        res.status(500).json({ message: "Error fetching fleet data", error: error.message });
    }
});
// Other API endpoints will go here later.

// --- AI & TELEGRAM LOGIC ---
app.post('/api/webhook/telegram', async (req, res) => {
    // Full Telegram webhook logic here...
    res.sendStatus(200);
});

// --- RENDER HEALTH CHECK ---
app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});


// --- SERVER STARTUP (THE FIX IS HERE) ---
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Listen on all available network interfaces

app.listen(PORT, HOST, () => {
  console.log(`Server listening on ${HOST}:${PORT}`);
});
