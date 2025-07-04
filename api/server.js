const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const { PDFDocument } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
require('dotenv').config();

const app = express();

// =================================================================
// --- FIXED FIREBASE INITIALIZATION ---
// =================================================================
let db;
try {
  if (admin.apps.length === 0) {
    // Directly parse the JSON from environment variable
    const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://rentalflow-ai-app.firebaseio.com"
    });
    console.log("✅ Firebase Admin SDK initialized successfully.");
  }
  db = admin.firestore();
} catch (error) {
  console.error("❌ Firebase Admin initialization failed:", error.message);
  console.log("ℹ️ Make sure FIREBASE_CREDENTIALS contains valid service account JSON");
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// =================================================================
// --- INVOICE GENERATOR ---
// =================================================================
async function generateInvoice(invoiceData) {
  // ... (same as before) ...
}

// =================================================================
// --- AI ASSISTANT FUNCTIONALITY ---
// =================================================================
async function getAiReplyForCustomer(userMessage) {
  // ... (same as before) ...
}

// =================================================================
// --- TELEGRAM BOT INTEGRATION ---
// =================================================================
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (TELEGRAM_TOKEN) {
  // ... (same as before) ...
} else {
  console.warn("⚠️ TELEGRAM_BOT_TOKEN not found. Telegram bot will not be started.");
}

// =================================================================
// --- API ENDPOINTS ---
// =================================================================
app.post('/api/create-invoice', async (req, res) => {
  // ... (same as before) ...
});

app.post('/api/ai-chat', async (req, res) => {
  // ... (same as before) ...
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
  console.log("✅ Firebase connected: rentalflow-ai-app");
  if (process.env.TELEGRAM_BOT_TOKEN) console.log("🤖 Telegram bot active");
});