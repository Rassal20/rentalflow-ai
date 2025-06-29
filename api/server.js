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

// COMPANY PROFILE
app.get('/api/company-profile', async (req, res) => {
    try {
        const profile = await getCollection('company_profile');
        res.status(200).json(profile[0] || {}); // Return first profile found
    } catch(e) { res.status(500).json({ message: "Error fetching profile" }); }
});

app.put('/api/company-profile/:id', async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database not connected." });
    try {
        const profileId = req.params.id;
        const updatedData = req.body;
        await db.collection('company_profile').doc(profileId).update(updatedData);
        console.log(`Company profile ${profileId} updated.`);
        res.status(200).json({ message: 'Profile updated successfully!', data: updatedData });
    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({ message: "Failed to update profile", error: error.message });
    }
});

// FLEET
app.get('/api/fleet', async (req, res) => {
    try {
        const fleet = await getCollection('fleet');
        res.status(200).json(fleet);
    } catch (e) { res.status(500).json({ message: "Error fetching fleet" }); }
});

app.post('/api/fleet', async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database not connected." });
    try {
        const newVehicle = req.body;
        const docRef = newVehicle.id
            ? db.collection('fleet').doc(newVehicle.id)
            : db.collection('fleet').doc();

        if (!newVehicle.id) {
            newVehicle.id = docRef.id;
        }

        await docRef.set(newVehicle, { merge: true });
        console.log(`New vehicle added with ID: ${newVehicle.id}`);
        res.status(201).json({ message: 'Vehicle added successfully!', vehicle: newVehicle });
    } catch (error) {
        console.error("Error adding vehicle:", error);
        res.status(500).json({ message: "Failed to add vehicle", error: error.message });
    }
});

app.put('/api/fleet/:id', async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database not connected." });
    try {
        const vehicleId = req.params.id;
        const updatedData = req.body;
        await db.collection('fleet').doc(vehicleId).update(updatedData);
        console.log(`Vehicle ${vehicleId} updated.`);
        res.status(200).json({ message: 'Vehicle updated successfully!', data: updatedData });
    } catch (error) {
        console.error("Error updating vehicle:", error);
        res.status(500).json({ message: "Failed to update vehicle", error: error.message });
    }
});

app.delete('/api/fleet/:id', async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database not connected." });
    try {
        const vehicleId = req.params.id;
        await db.collection('fleet').doc(vehicleId).delete();
        console.log(`Vehicle ${vehicleId} deleted.`);
        res.status(200).json({ message: 'Vehicle deleted successfully!' });
    } catch (error) {
        console.error("Error deleting vehicle:", error);
        res.status(500).json({ message: "Failed to delete vehicle", error: error.message });
    }
});

// LEADS & BOOKINGS
app.get('/api/bookings', async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database not connected." });
    try {
        const bookings = await getCollection('bookings');
        res.status(200).json(bookings);
    } catch (e) {
        console.error("Error fetching bookings:", e);
        res.status(500).json({ message: "Error fetching bookings" });
    }
});

app.post('/api/bookings', async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database not connected." });
    try {
        const newBooking = req.body;
        const docRef = await db.collection('bookings').add(newBooking);
        console.log(`New booking added with ID: ${docRef.id}`);
        res.status(201).json({ message: 'Booking added successfully!', bookingId: docRef.id });
    } catch (error) {
        console.error("Error adding booking:", error);
        res.status(500).json({ message: "Failed to add booking", error: error.message });
    }
});


// --- ONE-TIME DATABASE SEEDER ---
app.get('/api/seed-database', async (req, res) => {
    // ... Seeder code remains the same ...
});


// --- AI & TELEGRAM LOGIC ---
app.post('/api/webhook/telegram', (req, res) => {
    res.status(200).send("Telegram webhook is connected.");
});


// --- SERVER STARTUP ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});