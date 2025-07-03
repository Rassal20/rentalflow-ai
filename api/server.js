const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const app = express();

// --- INITIALIZE FIREBASE ADMIN ---
let db;
try {
  if (process.env.FIREBASE_CREDENTIALS && !admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    db = admin.firestore();
    console.log("Firebase Admin SDK initialized successfully.");
  } else if (admin.apps.length) {
    db = admin.firestore();
    console.log("Using existing Firebase instance.");
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

// --- DATABASE HELPER ---
const getCollection = async (collectionName) => {
  if (!db) throw new Error("Database not initialized.");
  const snapshot = await db.collection(collectionName).get();
  return snapshot.empty ? [] : snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// --- PAGE SERVING ---
app.get(['/', '/dashboard.html'], (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// --- API ENDPOINTS ---

// COMPANY PROFILE
app.get('/api/company-profile', async (req, res) => {
  try {
    const profile = await getCollection('company_profile');
    res.status(200).json(profile[0] || {});
  } catch (e) {
    res.status(500).json({ message: "Error fetching profile" });
  }
});

app.put('/api/company-profile/:id', async (req, res) => {
  if (!db) return res.status(500).json({ message: "Database not connected." });
  try {
    await db.collection('company_profile').doc(req.params.id).update(req.body);
    console.log(`Company profile ${req.params.id} updated.`);
    res.status(200).json({ message: 'Profile updated!' });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ message: "Update failed", error: error.message });
  }
});

// FLEET MANAGEMENT
app.get('/api/fleet', async (req, res) => {
  try {
    res.status(200).json(await getCollection('fleet'));
  } catch (e) {
    res.status(500).json({ message: "Error fetching fleet" });
  }
});

app.post('/api/fleet', async (req, res) => {
  if (!db) return res.status(500).json({ message: "Database not connected." });
  try {
    const vehicle = req.body;
    const docRef = vehicle.id 
      ? db.collection('fleet').doc(vehicle.id)
      : db.collection('fleet').doc();
    
    vehicle.id = docRef.id;
    await docRef.set(vehicle);
    console.log(`Vehicle ${vehicle.id} added.`);
    res.status(201).json({ message: 'Vehicle added!', vehicle });
  } catch (error) {
    console.error("Error adding vehicle:", error);
    res.status(500).json({ message: "Add failed", error: error.message });
  }
});

app.put('/api/fleet/:id', async (req, res) => {
  if (!db) return res.status(500).json({ message: "Database not connected." });
  try {
    const { id } = req.params;
    const data = req.body;
    
    if (data.currentMileage) {
      data.maintenanceHistory = admin.firestore.FieldValue.arrayUnion({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        mileage: data.currentMileage,
        type: 'mileage_update'
      });
    }
    
    await db.collection('fleet').doc(id).update(data);
    console.log(`Vehicle ${id} updated.`);
    res.status(200).json({ message: 'Vehicle updated!' });
  } catch (error) {
    console.error("Error updating vehicle:", error);
    res.status(500).json({ message: "Update failed", error: error.message });
  }
});

app.delete('/api/fleet/:id', async (req, res) => {
  if (!db) return res.status(500).json({ message: "Database not connected." });
  try {
    await db.collection('fleet').doc(req.params.id).delete();
    console.log(`Vehicle ${req.params.id} deleted.`);
    res.status(200).json({ message: 'Vehicle deleted!' });
  } catch (error) {
    console.error("Error deleting vehicle:", error);
    res.status(500).json({ message: "Delete failed", error: error.message });
  }
});

// BOOKINGS
app.get('/api/bookings', async (req, res) => {
  try {
    res.status(200).json(await getCollection('bookings'));
  } catch (e) {
    res.status(500).json({ message: "Error fetching bookings" });
  }
});

app.post('/api/bookings', async (req, res) => {
  if (!db) return res.status(500).json({ message: "Database not connected." });
  try {
    const docRef = await db.collection('bookings').add(req.body);
    console.log(`Booking ${docRef.id} added.`);
    res.status(201).json({ message: 'Booking added!', bookingId: docRef.id });
  } catch (error) {
    console.error("Error adding booking:", error);
    res.status(500).json({ message: "Add failed", error: error.message });
  }
});

// CUSTOMERS
app.get('/api/customers', async (req, res) => {
  try {
    res.status(200).json(await getCollection('customers'));
  } catch (e) {
    res.status(500).json({ message: "Error fetching customers" });
  }
});

app.post('/api/customers', async (req, res) => {
  if (!db) return res.status(500).json({ message: "Database not connected." });
  try {
    const docRef = await db.collection('customers').add(req.body);
    console.log(`Customer ${docRef.id} added.`);
    res.status(201).json({ message: 'Customer added!', customerId: docRef.id });
  } catch (error) {
    console.error("Error adding customer:", error);
    res.status(500).json({ message: "Add failed", error: error.message });
  }
});

// MAINTENANCE
app.post('/api/maintenance', async (req, res) => {
  if (!db) return res.status(500).json({ message: "Database not connected." });
  try {
    const record = req.body;
    const docRef = await db.collection('maintenance_records').add(record);
    
    await db.collection('fleet').doc(record.vehicleId).update({
      maintenanceHistory: admin.firestore.FieldValue.arrayUnion({
        id: docRef.id,
        date: record.date,
        type: record.type
      }),
      lastMaintained: record.date
    });
    
    console.log(`Maintenance record ${docRef.id} added.`);
    res.status(201).json({ message: 'Maintenance recorded!', recordId: docRef.id });
  } catch (error) {
    console.error("Error adding maintenance:", error);
    res.status(500).json({ message: "Add failed", error: error.message });
  }
});

// ACCOUNTING
app.get('/api/accounting', async (req, res) => {
  try {
    res.status(200).json(await getCollection('accounting_entries'));
  } catch (e) {
    res.status(500).json({ message: "Error fetching accounting" });
  }
});

app.post('/api/accounting', async (req, res) => {
  if (!db) return res.status(500).json({ message: "Database not connected." });
  try {
    const docRef = await db.collection('accounting_entries').add(req.body);
    console.log(`Accounting entry ${docRef.id} added.`);
    res.status(201).json({ message: 'Entry added!', entryId: docRef.id });
  } catch (error) {
    console.error("Error adding accounting:", error);
    res.status(500).json({ message: "Add failed", error: error.message });
  }
});

// INVOICES
app.post('/api/invoices', async (req, res) => {
  if (!db) return res.status(500).json({ message: "Database not connected." });
  try {
    const { customerId, bookingId, items } = req.body;
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    
    const invoice = {
      customerId,
      bookingId,
      date: admin.firestore.FieldValue.serverTimestamp(),
      dueDate: new Date(Date.now() + 604800000), // 7 days
      items,
      totalAmount,
      paid: false
    };
    
    const invoiceRef = await db.collection('invoices').add(invoice);
    
    const batch = db.batch();
    items.forEach(item => {
      const itemRef = db.collection('invoice_items').doc();
      batch.set(itemRef, { ...item, invoiceId: invoiceRef.id });
    });
    await batch.commit();
    
    console.log(`Invoice ${invoiceRef.id} created.`);
    res.status(201).json({ 
      message: 'Invoice created!', 
      invoiceId: invoiceRef.id,
      totalAmount
    });
  } catch (error) {
    console.error("Error creating invoice:", error);
    res.status(500).json({ message: "Creation failed", error: error.message });
  }
});

// SETTINGS
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await getCollection('settings');
    res.status(200).json(settings[0] || {});
  } catch (e) {
    res.status(500).json({ message: "Error fetching settings" });
  }
});

app.put('/api/settings', async (req, res) => {
  if (!db) return res.status(500).json({ message: "Database not connected." });
  try {
    await db.collection('settings').doc('main').set(req.body, { merge: true });
    console.log('Settings updated');
    res.status(200).json({ message: 'Settings updated!' });
  } catch (error) {
    console.error("Error updating settings:", error);
    res.status(500).json({ message: "Update failed", error: error.message });
  }
});

// TELEGRAM WEBHOOK
app.post('/api/webhook/telegram', (req, res) => {
  res.status(200).send("Telegram webhook active");
});

// --- SERVER START ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});