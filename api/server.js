const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
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

// Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Database helper
const getCollection = async (collectionName) => {
  if (!db) throw new Error("Database not initialized");
  const snapshot = await db.collection(collectionName).get();
  return snapshot.empty ? [] : snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// Serve all HTML pages
const pages = [
  '/', '/dashboard.html', '/fleet.html', '/bookings.html', 
  '/customers.html', '/accounting.html', '/invoices.html',
  '/settings.html', '/vehicle-detail.html'
];

pages.forEach(page => {
  app.get(page, (req, res) => {
    const fileName = page === '/' ? 'dashboard.html' : page;
    res.sendFile(path.join(__dirname, `../public/${fileName}`));
  });
});

// API Endpoints

// COMPANY PROFILE
app.get('/api/company-profile', async (req, res) => {
  try {
    const profile = await getCollection('company_profile');
    res.status(200).json(profile[0] || {});
  } catch (e) {
    res.status(500).json({ error: "Error fetching profile" });
  }
});

app.put('/api/company-profile/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    await db.collection('company_profile').doc(req.params.id).update(req.body);
    res.status(200).json({ message: 'Profile updated!' });
  } catch (error) {
    res.status(500).json({ error: `Update failed: ${error.message}` });
  }
});

// FLEET MANAGEMENT
app.get('/api/fleet', async (req, res) => {
  try {
    res.status(200).json(await getCollection('fleet'));
  } catch (e) {
    res.status(500).json({ error: "Error fetching fleet" });
  }
});

app.get('/api/fleet/:id', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: "Database not connected" });
    const doc = await db.collection('fleet').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Vehicle not found" });
    res.status(200).json({ id: doc.id, ...doc.data() });
  } catch (e) {
    res.status(500).json({ error: "Error fetching vehicle" });
  }
});

app.post('/api/fleet', async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const vehicle = req.body;
    const docRef = db.collection('fleet').doc();
    vehicle.id = docRef.id;
    await docRef.set(vehicle);
    res.status(201).json({ message: 'Vehicle added!', vehicle });
  } catch (error) {
    res.status(500).json({ error: `Add failed: ${error.message}` });
  }
});

app.put('/api/fleet/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
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
    res.status(200).json({ message: 'Vehicle updated!' });
  } catch (error) {
    res.status(500).json({ error: `Update failed: ${error.message}` });
  }
});

app.delete('/api/fleet/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    await db.collection('fleet').doc(req.params.id).delete();
    res.status(200).json({ message: 'Vehicle deleted!' });
  } catch (error) {
    res.status(500).json({ error: `Delete failed: ${error.message}` });
  }
});

// BOOKINGS
app.get('/api/bookings', async (req, res) => {
  try {
    res.status(200).json(await getCollection('bookings'));
  } catch (e) {
    res.status(500).json({ error: "Error fetching bookings" });
  }
});

app.post('/api/bookings', async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const docRef = await db.collection('bookings').add(req.body);
    res.status(201).json({ message: 'Booking added!', bookingId: docRef.id });
  } catch (error) {
    res.status(500).json({ error: `Add failed: ${error.message}` });
  }
});

// CUSTOMERS
app.get('/api/customers', async (req, res) => {
  try {
    res.status(200).json(await getCollection('customers'));
  } catch (e) {
    res.status(500).json({ error: "Error fetching customers" });
  }
});

app.get('/api/customers/:id', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: "Database not connected" });
    const doc = await db.collection('customers').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Customer not found" });
    res.status(200).json({ id: doc.id, ...doc.data() });
  } catch (e) {
    res.status(500).json({ error: "Error fetching customer" });
  }
});

app.post('/api/customers', async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const docRef = await db.collection('customers').add(req.body);
    res.status(201).json({ message: 'Customer added!', customerId: docRef.id });
  } catch (error) {
    res.status(500).json({ error: `Add failed: ${error.message}` });
  }
});

app.put('/api/customers/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    await db.collection('customers').doc(req.params.id).update(req.body);
    res.status(200).json({ message: 'Customer updated!' });
  } catch (error) {
    res.status(500).json({ error: `Update failed: ${error.message}` });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    await db.collection('customers').doc(req.params.id).delete();
    res.status(200).json({ message: 'Customer deleted!' });
  } catch (error) {
    res.status(500).json({ error: `Delete failed: ${error.message}` });
  }
});

// MAINTENANCE
app.get('/api/maintenance', async (req, res) => {
  try {
    const vehicleId = req.query.vehicleId;
    if (!vehicleId) return res.status(400).json({ error: "Vehicle ID required" });
    
    const snapshot = await db.collection('maintenance_records')
      .where('vehicleId', '==', vehicleId)
      .get();
      
    const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(records);
  } catch (e) {
    res.status(500).json({ error: "Error fetching maintenance" });
  }
});

app.post('/api/maintenance', async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const record = req.body;
    const docRef = await db.collection('maintenance_records').add(record);
    
    await db.collection('fleet').doc(record.vehicleId).update({
      maintenanceHistory: admin.firestore.FieldValue.arrayUnion({
        id: docRef.id,
        date: record.date || admin.firestore.FieldValue.serverTimestamp(),
        type: record.type
      }),
      lastMaintained: record.date || admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.status(201).json({ message: 'Maintenance recorded!', recordId: docRef.id });
  } catch (error) {
    res.status(500).json({ error: `Add failed: ${error.message}` });
  }
});

// ACCOUNTING
app.get('/api/accounting', async (req, res) => {
  try {
    res.status(200).json(await getCollection('accounting_entries'));
  } catch (e) {
    res.status(500).json({ error: "Error fetching accounting" });
  }
});

app.post('/api/accounting', async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const docRef = await db.collection('accounting_entries').add(req.body);
    res.status(201).json({ message: 'Entry added!', entryId: docRef.id });
  } catch (error) {
    res.status(500).json({ error: `Add failed: ${error.message}` });
  }
});

app.put('/api/accounting/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    await db.collection('accounting_entries').doc(req.params.id).update(req.body);
    res.status(200).json({ message: 'Entry updated!' });
  } catch (error) {
    res.status(500).json({ error: `Update failed: ${error.message}` });
  }
});

app.delete('/api/accounting/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    await db.collection('accounting_entries').doc(req.params.id).delete();
    res.status(200).json({ message: 'Entry deleted!' });
  } catch (error) {
    res.status(500).json({ error: `Delete failed: ${error.message}` });
  }
});

// INVOICES
app.get('/api/invoices', async (req, res) => {
  try {
    res.status(200).json(await getCollection('invoices'));
  } catch (e) {
    res.status(500).json({ error: "Error fetching invoices" });
  }
});

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
    res.status(201).json({ 
      message: 'Invoice created!', 
      invoiceId: invoiceRef.id,
      totalAmount
    });
  } catch (error) {
    res.status(500).json({ error: `Creation failed: ${error.message}` });
  }
});

app.put('/api/invoices/:id/paid', async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    await db.collection('invoices').doc(req.params.id).update({ paid: true });
    res.status(200).json({ message: 'Invoice marked as paid!' });
  } catch (error) {
    res.status(500).json({ error: `Update failed: ${error.message}` });
  }
});

app.get('/api/invoices/:id/pdf', async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const invoiceDoc = await db.collection('invoices').doc(invoiceId).get();
    if (!invoiceDoc.exists) return res.status(404).send('Invoice not found');
    
    const invoice = invoiceDoc.data();
    const customerDoc = await db.collection('customers').doc(invoice.customerId).get();
    const customer = customerDoc.data();
    
    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const { width, height } = page.getSize();
    const fontSize = 12;
    
    // Add content
    page.drawText(`INVOICE #${invoiceId}`, { x: 50, y: height - 50, size: 18 });
    page.drawText(`Date: ${new Date(invoice.date.seconds * 1000).toLocaleDateString()}`, { x: 50, y: height - 80, size: fontSize });
    page.drawText(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`, { x: 50, y: height - 100, size: fontSize });
    page.drawText(`Customer: ${customer.name}`, { x: 50, y: height - 130, size: fontSize });
    
    // Add items table
    let y = height - 180;
    page.drawText('Description', { x: 50, y, size: fontSize });
    page.drawText('Amount (AED)', { x: 400, y, size: fontSize });
    y -= 30;
    
    invoice.items.forEach(item => {
      page.drawText(item.description, { x: 50, y, size: fontSize });
      page.drawText(item.amount.toFixed(2), { x: 400, y, size: fontSize });
      y -= 20;
    });
    
    // Add total
    y -= 20;
    page.drawText('Total:', { x: 350, y, size: fontSize, color: rgb(0, 0, 0) });
    page.drawText(invoice.totalAmount.toFixed(2), { x: 400, y, size: fontSize, color: rgb(0, 0, 0) });
    
    // Finalize PDF
    const pdfBytes = await pdfDoc.save();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoiceId}.pdf`);
    res.send(pdfBytes);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// SETTINGS
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await getCollection('settings');
    res.status(200).json(settings[0] || {});
  } catch (e) {
    res.status(500).json({ error: "Error fetching settings" });
  }
});

app.put('/api/settings', async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    await db.collection('settings').doc('main').set(req.body, { merge: true });
    res.status(200).json({ message: 'Settings updated!' });
  } catch (error) {
    res.status(500).json({ error: `Update failed: ${error.message}` });
  }
});

// TELEGRAM WEBHOOK
app.post('/api/webhook/telegram', (req, res) => {
  res.sendStatus(200);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});