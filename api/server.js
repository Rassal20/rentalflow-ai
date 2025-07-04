// api/server.js
const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const { generateInvoice } = require('./invoiceGenerator'); // Fixed filename
require('dotenv').config();

const app = express();

// Firebase Initialization
let db;
try {
  if (admin.apps.length === 0) {
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_CREDENTIALS, 'base64').toString()
    );
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://rentalflow-ai-app.firebaseio.com"
    });
    console.log("✅ Firebase Admin SDK initialized successfully.");
  }
  db = admin.firestore();
} catch (error) {
  console.error("❌ Firebase Admin initialization failed:", error);
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// =================================================================
// --- AI ASSISTANT FUNCTIONALITY ---
// =================================================================
async function getAiReplyForCustomer(userMessage) {
  const GOOGLE_AI_API_KEY = process.env.AI_API_KEY;
  if (!db) throw new Error("Database service is unavailable.");
  if (!GOOGLE_AI_API_KEY) throw new Error("AI API Key is not configured.");

  try {
    // Fetch company profile
    const companyProfile = (await db.collection('company_profile').doc('main').get()).data();
    const companyName = companyProfile?.companyName || "Prestige Rentals";

    // Fetch available vehicles
    const vehiclesSnapshot = await db.collection('fleet')
      .where('status', '==', 'available')
      .get();
    
    const availableVehicles = vehiclesSnapshot.docs.map(doc => {
      const v = doc.data();
      return `${v.year} ${v.brand} ${v.model}`;
    });

    // Construct AI context
    const dataContext = `
      Current Date: ${new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Dubai' })}.
      Company Name: ${companyName}.
      Available Vehicles: ${availableVehicles.join(', ') || 'None currently available'}.
    `;

    const systemPrompt = `You are "Alex", a friendly and professional customer service agent for "${companyName}", a luxury car rental company in Dubai.
        Your goal is to help customers, answer their questions about available cars, and encourage them to book.
        NEVER mention internal data like booking details, customer names, or financials.
        You MUST use the live data provided below to answer questions accurately. Be conversational and helpful.`;

    const fullPrompt = `${systemPrompt}\n\n--- LIVE DATA CONTEXT ---\n${dataContext}\n\n--- CUSTOMER QUESTION ---\n${userMessage}`;

    // Call the Google AI API
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
  } catch (error) {
    console.error("Failed to fetch data for AI:", error);
    return "I'm having trouble accessing our current inventory. Please contact us directly for assistance.";
  }
}

// =================================================================
// --- TELEGRAM BOT INTEGRATION ---
// =================================================================
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (TELEGRAM_TOKEN) {
  const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
  console.log("🤖 Telegram Bot is running and listening for messages...");

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
      bot.sendMessage(chatId, "I'm experiencing technical difficulties. Please try again later.");
    }
  });

  bot.on("polling_error", (error) => {
    console.error("Telegram Polling Error:", error.code, "-", error.message);
  });
} else {
  console.warn("⚠️ TELEGRAM_BOT_TOKEN not found. Telegram bot will not be started.");
}

// =================================================================
// --- API ENDPOINTS ---
// =================================================================
app.post('/api/create-invoice', async (req, res) => {
  try {
    const pdfBytes = await generateInvoice(req.body);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=invoice.pdf');
    res.send(pdfBytes);
  } catch (error) {
    console.error('Invoice generation failed:', error);
    res.status(500).send('Failed to generate invoice');
  }
});

app.post('/api/ai-chat', async (req, res) => {
  try {
    const reply = await getAiReplyForCustomer(req.body.message);
    res.json({ reply });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ error: 'AI service unavailable' });
  }
});

// =================================================================
// --- PAGE ROUTING ---
// =================================================================
const PAGES = [
  '/', '/dashboard', '/fleet', '/bookings', 
  '/customers', '/financials', '/invoices',
  '/settings', '/vehicle-detail', '/invoice-detail',
  '/customer-detail'
];

app.get('*', (req, res) => {
  const basePath = req.path.split('/')[1] || 'dashboard';
  const validPage = PAGES.some(page => req.path === page);
  
  if (validPage) {
    const fileName = basePath === 'dashboard' ? 'dashboard.html' : `${basePath}.html`;
    res.sendFile(path.join(__dirname, `../public/${fileName}`));
  } else {
    res.status(404).sendFile(path.join(__dirname, '../public/404.html'));
  }
});

// =================================================================
// --- SERVER START ---
// =================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Access at: https://rentalflow-ai.onrender.com`);
});