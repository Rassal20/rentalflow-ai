const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const app = express();

// Initialize Firebase Admin
let db;
try {
  if (process.env.FIREBASE_CREDENTIALS && !admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    db = admin.firestore();
    console.log("Firebase initialized");
  } else if (admin.apps.length) {
    db = admin.firestore();
    console.log("Using existing Firebase instance");
  }
} catch (error) {
  console.error("Firebase init error:", error.message);
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Database helper
const getCollection = async (collectionName) => {
  if (!db) throw new Error("Database not initialized");
  const snapshot = await db.collection(collectionName).get();
  return snapshot.empty ? [] : snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// Serve dashboard
app.get(['/', '/dashboard.html'], (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// API endpoints
const createCRUDHandlers = (collectionName, idField = 'id') => ({
  getAll: async (req, res) => {
    try {
      res.json(await getCollection(collectionName));
    } catch (e) {
      res.status(500).json({ error: `Error fetching ${collectionName}` });
    }
  },
  
  create: async (req, res) => {
    if (!db) return res.status(500).json({ error: "Database not connected" });
    try {
      const docRef = await db.collection(collectionName).add(req.body);
      console.log(`${collectionName} created: ${docRef.id}`);
      res.status(201).json({ id: docRef.id });
    } catch (error) {
      res.status(500).json({ error: `Create failed: ${error.message}` });
    }
  },
  
  update: async (req, res) => {
    if (!db) return res.status(500).json({ error: "Database not connected" });
    try {
      await db.collection(collectionName).doc(req.params.id).update(req.body);
      console.log(`${collectionName} updated: ${req.params.id}`);
      res.json({ message: 'Update successful' });
    } catch (error) {
      res.status(500).json({ error: `Update failed: ${error.message}` });
    }
  },
  
  delete: async (req, res) => {
    if (!db) return res.status(500).json({ error: "Database not connected" });
    try {
      await db.collection(collectionName).doc(req.params.id).delete();
      console.log(`${collectionName} deleted: ${req.params.id}`);
      res.json({ message: 'Delete successful' });
    } catch (error) {
      res.status(500).json({ error: `Delete failed: ${error.message}` });
    }
  }
});

// Company Profile
const profileHandler = createCRUDHandlers('company_profile');
app.get('/api/company-profile', async (req, res) => {
  try {
    const profile = await getCollection('company_profile');
    res.json(profile[0] || {});
  } catch (e) {
    res.status(500).json({ error: "Error fetching profile" });
  }
});
app.put('/api/company-profile/:id', profileHandler.update);

// Fleet Management
const fleetHandler = createCRUDHandlers('fleet');
app.get('/api/fleet', fleetHandler.getAll);
app.post('/api/fleet', fleetHandler.create);
app.put('/api/fleet/:id', fleetHandler.update);
app.delete('/api/fleet/:id', fleetHandler.delete);

// Bookings
const bookingsHandler = createCRUDHandlers('bookings');
app.get('/api/bookings', bookingsHandler.getAll);
app.post('/api/bookings', bookingsHandler.create);

// Customers
const customersHandler = createCRUDHandlers('customers');
app.get('/api/customers', customersHandler.getAll);
app.post('/api/customers', customersHandler.create);

// Accounting
const accountingHandler = createCRUDHandlers('accounting_entries');
app.get('/api/accounting', accountingHandler.getAll);
app.post('/api/accounting', accountingHandler.create);

// Maintenance
app.post('/api/maintenance', async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const { vehicleId, ...record } = req.body;
    const docRef = await db.collection('maintenance_records').add(record);
    
    await db.collection('fleet').doc(vehicleId).update({
      maintenanceHistory: admin.firestore.FieldValue.arrayUnion({
        id: docRef.id,
        date: record.date,
        type: record.type
      }),
      lastMaintained: record.date
    });
    
    res.status(201).json({ id: docRef.id });
  } catch (error) {
    res.status(500).json({ error: `Maintenance failed: ${error.message}` });
  }
});

// Invoices
app.post('/api/invoices', async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
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
    res.status(201).json({ id: invoiceRef.id, totalAmount });
  } catch (error) {
    res.status(500).json({ error: `Invoice failed: ${error.message}` });
  }
});

// Settings
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await getCollection('settings');
    res.json(settings[0] || {});
  } catch (e) {
    res.status(500).json({ error: "Error fetching settings" });
  }
});

app.put('/api/settings', async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    await db.collection('settings').doc('main').set(req.body, { merge: true });
    res.json({ message: 'Settings updated' });
  } catch (error) {
    res.status(500).json({ error: `Settings failed: ${error.message}` });
  }
});

// Telegram webhook
app.post('/api/webhook/telegram', (req, res) => {
  res.sendStatus(200);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});