const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const PDFDocument = require('pdfkit');
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

// ... [All other API endpoints remain the same as before] ...

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

    // Create PDF with pdfkit
    const doc = new PDFDocument();
    const filename = `invoice-${invoiceId}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    doc.pipe(res);
    
    // Header
    doc.fontSize(20).text('INVOICE', { align: 'center' });
    doc.moveDown();
    
    // Invoice details
    doc.fontSize(12).text(`Invoice #: ${invoiceId}`);
    doc.text(`Date: ${new Date(invoice.date.seconds * 1000).toLocaleDateString()}`);
    doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`);
    doc.text(`Customer: ${customer.name}`);
    doc.moveDown();
    
    // Items table
    const tableTop = doc.y;
    const itemWidth = 400;
    const priceWidth = 100;
    
    // Table header
    doc.font('Helvetica-Bold');
    doc.text('Description', 50, tableTop);
    doc.text('Amount (AED)', 50 + itemWidth, tableTop, { width: priceWidth, align: 'right' });
    doc.moveDown();
    
    // Table rows
    doc.font('Helvetica');
    let y = doc.y;
    invoice.items.forEach(item => {
      doc.text(item.description, 50, y);
      doc.text(item.amount.toFixed(2), 50 + itemWidth, y, { width: priceWidth, align: 'right' });
      y += 20;
      doc.moveTo(50, y).lineTo(50 + itemWidth + priceWidth, y).stroke();
      y += 10;
    });
    
    // Total
    doc.moveDown();
    doc.font('Helvetica-Bold');
    doc.text('Total:', 50 + itemWidth - 50, y);
    doc.text(invoice.totalAmount.toFixed(2), 50 + itemWidth, y, { width: priceWidth, align: 'right' });
    
    // Footer
    doc.moveDown(2);
    doc.font('Helvetica-Oblique').fontSize(10).text('Thank you for your business!', { align: 'center' });
    
    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// ... [Rest of the API endpoints remain the same] ...

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});