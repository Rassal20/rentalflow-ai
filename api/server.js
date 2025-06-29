/*
 * RentalFlow AI Server - FINAL CLOUD & FIRESTORE VERSION
 * ---------------------------------------------------------
 * This is the definitive server code. It connects to Firestore and serves
 * a full API for fleet management, leads, and company profiles.
 */

const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs').promises; // Only used for the one-time database seeder
const app = express();

// --- INITIALIZE FIREBASE ADMIN (SECURE RENDER/VERCEL METHOD) ---
let db;
try {
  if (process.env.FIREBASE_CREDENTIALS && !admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    db = admin.firestore();
    console.log("Firebase Admin SDK initialized successfully.");
  } else if (admin.apps.length) {
    db = admin.firestore();
    console.log("Firebase Admin SDK already initialized.");
  }
} catch (error) {
  console.error("Firebase initialization failed:", error.message);
}

// --- MIDDLEWARE ---
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));


// --- CONFIGURATION ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;


// --- DATABASE HELPER FUNCTIONS (FIRESTORE) ---
const getCollection = async (collectionName) => {
    if (!db) throw new Error("Database not initialized.");
    const snapshot = await db.collection(collectionName).get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};


// --- PAGE SERVING ROUTE ---
app.get(['/', '/dashboard.html'], (req, res) => {
    res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});


// --- API ENDPOINTS for the DASHBOARD ---
app.get('/api/company-profile', async (req, res) => {
    try {
        const profile = await getCollection('company_profile');
        res.status(200).json(profile[0] || {}); // Return first profile found
    } catch(e) { res.status(500).json({ message: "Error fetching profile" }); }
});

app.get('/api/fleet', async (req, res) => {
    try {
        const fleet = await getCollection('fleet');
        res.status(200).json(fleet);
    } catch (e) { res.status(500).json({ message: "Error fetching fleet" }); }
});

app.get('/api/leads', async (req, res) => {
    try {
        const leads = await getCollection('leads');
        res.status(200).json(leads);
    } catch (e) { res.status(500).json({ message: "Error fetching leads" }); }
});
// ... Other POST, PUT, DELETE endpoints will go here...


// --- ONE-TIME DATABASE SEEDER ---
// This endpoint reads your local JSON files and populates Firestore.
// Run this ONLY ONCE after your first successful deployment.
app.get('/api/seed-database', async (req, res) => {
    if (!db) return res.status(500).send("Database not connected.");
    try {
        console.log("Seeding database...");
        
        // Seed Fleet
        const fleetData = JSON.parse(await fs.readFile(path.join(__dirname, '../public/fleet_db.json'), 'utf8'));
        for (const car of fleetData) {
            await db.collection('fleet').doc(car.id).set(car);
        }
        console.log(`${fleetData.length} vehicles seeded.`);

        // Seed Company Profile
        const profileData = JSON.parse(await fs.readFile(path.join(__dirname, '../public/company_profile.json'), 'utf8'));
        await db.collection('company_profile').doc('main').set(profileData);
        console.log(`Company profile for "${profileData.company_name}" seeded.`);
        
        // Seed Market Fleet
        const marketData = JSON.parse(await fs.readFile(path.join(__dirname, '../public/market_fleet.json'), 'utf8'));
        await db.collection('market_fleet').doc('default').set({ vehicles: marketData });
        console.log(`${marketData.length} market vehicles seeded.`);

        res.status(200).send("Database seeding completed successfully!");
    } catch (error) {
        console.error("Error during database seeding:", error);
        res.status(500).send("Seeding failed: " + error.message);
    }
});


// --- AI & TELEGRAM LOGIC ---
// This will be added back once the base deployment is confirmed working.
app.post('/api/webhook/telegram', (req, res) => {
    res.status(200).send("Telegram webhook is connected.");
});


// --- SERVER STARTUP ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
