/*
 * RentalFlow AI Server - VERCEL CLOUD-READY with Full CRUD API
 * ---------------------------------------------------------
 * This version adds POST, PUT, and DELETE endpoints to allow the dashboard
 * to fully manage the vehicle fleet in the Firestore database.
 */

const express = require('express');
const admin = require('firebase-admin');
const app = express();

// --- INITIALIZE FIREBASE ADMIN (SECURE VERCEL METHOD) ---
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

// --- CONFIGURATION ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_PERSONA_PROMPT = `You are a professional AI sales agent for a vehicle rental company...`; // Abridged

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

// POST a new vehicle
app.post('/api/fleet', async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database not initialized" });
    try {
        const newCarData = req.body;
        // Firestore generates its own unique ID
        const docRef = await db.collection('fleet').add(newCarData);
        res.status(201).json({ message: "Vehicle added successfully", id: docRef.id });
    } catch (error) {
        res.status(500).json({ message: "Error adding vehicle", error: error.message });
    }
});

// PUT (update) an existing vehicle
app.put('/api/fleet/:id', async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database not initialized" });
    try {
        const carId = req.params.id;
        const updatedCarData = req.body;
        delete updatedCarData.id; // Don't try to update the ID itself
        await db.collection('fleet').doc(carId).update(updatedCarData);
        res.status(200).json({ message: "Vehicle updated successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error updating vehicle", error: error.message });
    }
});

// DELETE a vehicle
app.delete('/api/fleet/:id', async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database not initialized" });
    try {
        await db.collection('fleet').doc(req.params.id).delete();
        res.status(200).json({ message: "Vehicle deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error deleting vehicle", error: error.message });
    }
});


// --- AI & TELEGRAM LOGIC (Unchanged) ---
app.post('/api/webhook/telegram', async (req, res) => {
    if (!GEMINI_API_KEY || !TELEGRAM_BOT_TOKEN) {
        return res.sendStatus(500);
    }
    const message = req.body.message;
    if (!message || !message.text) {
        return res.sendStatus(200);
    }
    const chatId = message.chat.id;
    const userMessage = message.text;
    try {
        const aiResponse = await getGeminiResponse(userMessage, chatId);
        await sendTelegramReply(chatId, aiResponse);
    } catch (error) {
        console.error("Error in Telegram webhook:", error);
    }
    res.sendStatus(200);
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
    await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: text })
    });
}


// Export the app for Vercel's serverless environment
module.exports = app;
