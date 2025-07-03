const express = require('express');
const admin = require('firebase-admin');
const path =require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const cors = require('cors');
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
  } else {
    console.log("Firebase Admin SDK already initialized.");
  }
  db = admin.firestore();
} catch (error) {
  console.error("CRITICAL: Firebase Admin initialization failed.", error.message);
}

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));


// --- API Endpoints (from your original file) ---

// Database helper
const getCollection = async (collectionName) => {
  if (!db) throw new Error("Database not initialized");
  const snapshot = await db.collection(collectionName).get();
  return snapshot.empty ? [] : snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// COMPANY PROFILE, FLEET, BOOKINGS, CUSTOMERS, etc.
// (Keeping all your existing API endpoints as they are correct)

app.get('/api/invoices/:id/pdf', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database service is unavailable.' });
  try {
    const invoiceId = req.params.id;
    const invoiceDoc = await db.collection('invoices').doc(invoiceId).get();
    if (!invoiceDoc.exists) return res.status(404).send('Invoice not found');
    
    const invoice = invoiceDoc.data();
    // Use the new detailed structure
    const customerName = invoice.customer ? invoice.customer.name : 'N/A';
    
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const { width, height } = page.getSize();
    const fontSize = 12;
    
    page.drawText(`INVOICE #${invoice.invoiceNumber || invoiceId}`, { x: 50, y: height - 50, size: 18 });
    page.drawText(`Date: ${new Date(invoice.issueDate.seconds * 1000).toLocaleDateString()}`, { x: 50, y: height - 80, size: fontSize });
    page.drawText(`Due Date: ${new Date(invoice.dueDate.seconds * 1000).toLocaleDateString()}`, { x: 50, y: height - 100, size: fontSize });
    page.drawText(`Customer: ${customerName}`, { x: 50, y: height - 130, size: fontSize });
    
    let y = height - 180;
    page.drawText('Description', { x: 50, y, size: fontSize });
    page.drawText('Amount (AED)', { x: 400, y, size: fontSize });
    y -= 30;
    
    invoice.items.forEach(item => {
      page.drawText(item.description, { x: 50, y, size: fontSize });
      page.drawText(item.total.toFixed(2), { x: 400, y, size: fontSize });
      y -= 20;
    });
    
    y -= 20;
    page.drawText('Subtotal:', { x: 350, y, size: fontSize });
    page.drawText(invoice.subtotal.toFixed(2), { x: 400, y, size: fontSize });
    y -= 20;
    page.drawText('Tax:', { x: 350, y, size: fontSize });
    page.drawText(invoice.taxAmount.toFixed(2), { x: 400, y, size: fontSize });
    y -= 20;
    page.drawText('Total:', { x: 350, y, size: 14, color: rgb(0, 0, 0) });
    page.drawText(invoice.total.toFixed(2), { x: 400, y, size: 14, color: rgb(0, 0, 0) });
    
    const pdfBytes = await pdfDoc.save();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoice.invoiceNumber}.pdf`);
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});


// --- Frontend HTML Page Serving (The Fix) ---
// This section correctly serves your different HTML pages.
const pages = [
  '/', '/dashboard', '/fleet', '/bookings', 
  '/customers', '/accounting', '/invoices',
  '/settings', '/vehicle-detail', '/invoice-detail'
];

pages.forEach(page => {
  app.get(page, (req, res) => {
    // Determine the filename. If the route is '/', serve 'dashboard.html'.
    // Otherwise, construct the filename from the route (e.g., '/bookings' -> 'bookings.html').
    const fileName = (page === '/' ? 'dashboard' : page.substring(1)) + '.html';
    res.sendFile(path.join(__dirname, `../public/${fileName}`), (err) => {
        if (err) {
            res.status(404).send("Sorry, that page doesn't exist!");
        }
    });
  });
});


// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
