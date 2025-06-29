/*
 * RentalFlow AI Server - VERCEL CLOUD-READY
 * ---------------------------------------------------------
 * This is the complete and definitive server code for the RentalFlow project.
 * It contains only API logic and is designed to work perfectly on Vercel
 * by reading all secret keys from environment variables.
 */

const express = require('express');
const admin = require('firebase-admin');
const app = express();

// --- INITIALIZE FIREBASE ADMIN (SECURE VERCEL METHOD) ---
let db;
try {
  // Vercel's environment variables are strings. We need to parse the JSON string
  // back into an object for the Firebase Admin SDK to use.
  if (process.env.FIREBASE_CREDENTIALS && !admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin SDK initialized successfully.");
    db = admin.firestore();
  } else if (admin.apps.length) {
    console.log("Firebase Admin SDK already initialized.");
    db = admin.firestore();
  } else {
    console.log("FIREBASE_CREDENTIALS environment variable not set. Skipping DB initialization.");
  }
} catch (error) {
  console.error("Firebase initialization failed:", error.message);
}

// --- MIDDLEWARE ---
app.use(express.json());

// --- CONFIGURATION ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_PERSONA_PROMPT = `You are a professional AI sales agent for a vehicle rental company...`; // Abridged for clarity

// --- DATABASE HELPER FUNCTIONS ---
async function getFleetData() {
    if (!db) throw new Error("Database not initialized.");
    const snapshot = await db.collection('fleet').get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// --- API ENDPOINTS for the DASHBOARD ---

// GET all vehicles
app.get('/api/fleet', async (req, res) => {
    try {
        const fleet = await getFleetData();
        res.status(200).json(fleet);
    } catch (error) {
        res.status(500).json({ message: "Error fetching fleet data", error: error.message });
    }
});

// Other API endpoints (POST, PUT, DELETE for fleet management) will go here later.


// --- AI & TELEGRAM LOGIC ---
app.post('/api/webhook/telegram', async (req, res) => {
    if (!GEMINI_API_KEY || !TELEGRAM_BOT_TOKEN) {
        console.error("Missing API keys for Telegram or Gemini.");
        return res.sendStatus(500);
    }

    const message = req.body.message;
    if (!message || !message.text) {
        return res.sendStatus(200); // Acknowledge non-text messages without processing
    }

    const chatId = message.chat.id;
    const userMessage = message.text;

    try {
        const aiResponse = await getGeminiResponse(userMessage, chatId);
        await sendTelegramReply(chatId, aiResponse);
    } catch (error) {
        console.error("Error in Telegram webhook:", error);
        // Avoid sending an error message back to the user to prevent loops.
    }
    res.sendStatus(200); // Always send a 200 OK to Telegram
});

async function getGeminiResponse(userMessage, userId) {
    const fleetData = await getFleetData();
    const fleetDataString = JSON.stringify(fleetData, null, 2);
    const dynamicPrompt = `${BOT_PERSONA_PROMPT}\n\n--- REAL-TIME FLEET INVENTORY ---\n${fleetDataString}`;

    const requestBody = {
      contents: [{ role: "user", parts: [{ text: dynamicPrompt }, { text: userMessage }] }]
    };

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error! status: ${response.status}, message: ${errorText}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

async function sendTelegramReply(chatId, text) {
    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: text })
    });
     if (!response.ok) {
        const errorText = await response.text();
        console.error(`Telegram API error! status: ${response.status}, message: ${errorText}`);
    }
}

// Export the app for Vercel's serverless environment
module.exports = app;
