const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const app = express();

// --- Firebase Admin Initialization ---
let db;
try {
    if (admin.apps.length === 0) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("Firebase Admin SDK initialized successfully.");
    }
    db = admin.firestore();
} catch (error) {
    console.error("CRITICAL: Firebase Admin initialization failed.", error.message);
}

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));


// =================================================================
// --- REUSABLE AI & DATA LOGIC ---
// =================================================================

/**
 * Fetches live data from Firestore and gets an intelligent response from the AI.
 * @param {string} userMessage - The message from the user.
 * @returns {Promise<string>} The AI-generated reply.
 */
async function getAiReplyForCustomer(userMessage) {
    const GOOGLE_AI_API_KEY = process.env.AI_API_KEY;
    if (!db) throw new Error("Database service is unavailable.");
    if (!GOOGLE_AI_API_KEY) throw new Error("AI API Key is not configured.");

    // 1. Fetch live data from Firestore
    const vehiclesSnapshot = await db.collection('vehicles').get();
    const allVehicles = vehiclesSnapshot.docs.map(doc => doc.data());
    const availableVehicles = allVehicles
        .filter(v => v.status === 'available')
        .map(v => `${v.year} ${v.brand} ${v.model}`);

    const companyProfile = (await db.collection('company_profile').doc('main').get()).data();
    const companyName = companyProfile.companyName || "Prestige Rentals";

    // 2. Construct a detailed, data-rich prompt for the AI
    const dataContext = `
        Current Date: ${new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Dubai' })}.
        Company Name: ${companyName}.
        Number of cars in fleet: ${allVehicles.length}.
        List of currently available cars for rent: ${JSON.stringify(availableVehicles)}.
    `;

    const systemPrompt = `You are "Alex", a friendly and professional customer service agent for "${companyName}", a luxury car rental company in Dubai.
        Your goal is to help customers, answer their questions about available cars, and encourage them to book.
        NEVER mention internal data like booking details, customer names, or financials.
        You MUST use the live data provided below to answer questions accurately. Be conversational and helpful.`;

    const fullPrompt = `${systemPrompt}\n\n--- LIVE DATA CONTEXT ---\n${dataContext}\n\n--- CUSTOMER QUESTION ---\n${userMessage}`;

    // 3. Call the Google AI API
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GOOGLE_AI_API_KEY}`;
    const requestBody = {
        contents: [{
            parts: [{ text: fullPrompt }]
        }]
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Google AI API error: ${response.statusText} - ${errorBody}`);
    }

    const responseData = await response.json();
    if (!responseData.candidates || responseData.candidates.length === 0) {
        return "I'm sorry, I couldn't come up with a response. Could you try rephrasing your question?";
    }
    return responseData.candidates[0].content.parts[0].text;
}


// =================================================================
// --- TELEGRAM BOT LOGIC ---
// =================================================================

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (TELEGRAM_TOKEN) {
    const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
    console.log("Telegram Bot is running and listening for messages...");

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const userMessage = msg.text;

        if (!userMessage) return;

        try {
            await bot.sendChatAction(chatId, 'typing');
            const aiReply = await getAiReplyForCustomer(userMessage);
            bot.sendMessage(chatId, aiReply);
        } catch (error) {
            console.error('Telegram Bot Error:', error);
            bot.sendMessage(chatId, "I'm sorry, I'm having trouble connecting to my brain right now. Please try again in a moment.");
        }
    });

    bot.on("polling_error", (error) => {
        console.error("Telegram Polling Error:", error.code, "-", error.message);
    });

} else {
    console.warn("TELEGRAM_BOT_TOKEN not found. Telegram bot will not be started.");
}


// =================================================================
// --- HTML PAGE SERVING & SERVER START ---
// =================================================================

const pages = [
  '/', '/dashboard', '/fleet', '/bookings', 
  '/customers', '/accounting', '/invoices',
  '/settings', '/vehicle-detail', '/invoice-detail'
];

pages.forEach(page => {
  app.get(page, (req, res) => {
    const fileName = (page === '/' || page === '/index') ? 'dashboard.html' : page.substring(1) + '.html';
    res.sendFile(path.join(__dirname, `../public/${fileName}`), (err) => {
        if (err) {
            res.status(404).sendFile(path.join(__dirname, '../public/dashboard.html'));
        }
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
