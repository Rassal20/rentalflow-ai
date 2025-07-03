const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const cors = require('cors');
require('dotenv').config();

const app = express();

// --- Firebase Admin Initialization ---
let db;
try {
  // Check if the app is already initialized to prevent crashing on hot-reloads
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
  // If Firebase doesn't initialize, the app is useless. We can stop it.
  // Or handle requests gracefully by sending back a server error.
}

// --- Middleware ---
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json());
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '../public')));


// --- API Endpoints ---
// We will put all your API endpoints here.
// For now, a simple health check endpoint:
app.get('/api/health', (req, res) => {
    if (!db) {
        return res.status(500).json({ status: 'error', message: 'Database not connected' });
    }
    res.status(200).json({ status: 'ok', message: 'Server is running and database is connected' });
});

// Your existing /api/invoices/:id/pdf endpoint
app.get('/api/invoices/:id/pdf', async (req, res) => {
  if (!db) {
    return res.status(500).json({ error: 'Database service is unavailable.' });
  }
  try {
    const invoiceId = req.params.id;
    const invoiceDoc = await db.collection('invoices').doc(invoiceId).get();
    if (!invoiceDoc.exists) return res.status(404).send('Invoice not found');
    
    const invoice = invoiceDoc.data();
    const customerDoc = await db.collection('customers').doc(invoice.customerId).get();
    const customer = customerDoc.exists() ? customerDoc.data() : { name: 'N/A' };
    
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const { width, height } = page.getSize();
    const fontSize = 12;
    
    page.drawText(`INVOICE #${invoiceId}`, { x: 50, y: height - 50, size: 18 });
    page.drawText(`Date: ${new Date(invoice.date.seconds * 1000).toLocaleDateString()}`, { x: 50, y: height - 80, size: fontSize });
    page.drawText(`Due Date: ${new Date(invoice.dueDate.seconds * 1000).toLocaleDateString()}`, { x: 50, y: height - 100, size: fontSize });
    page.drawText(`Customer: ${customer.name}`, { x: 50, y: height - 130, size: fontSize });
    
    let y = height - 180;
    page.drawText('Description', { x: 50, y, size: fontSize });
    page.drawText('Amount (AED)', { x: 400, y, size: fontSize });
    y -= 30;
    
    invoice.items.forEach(item => {
      page.drawText(item.description, { x: 50, y, size: fontSize });
      page.drawText(item.amount.toFixed(2), { x: 400, y, size: fontSize });
      y -= 20;
    });
    
    y -= 20;
    page.drawText('Total:', { x: 350, y, size: fontSize, color: rgb(0, 0, 0) });
    page.drawText(invoice.totalAmount.toFixed(2), { x: 400, y, size: fontSize, color: rgb(0, 0, 0) });
    
    const pdfBytes = await pdfDoc.save();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoiceId}.pdf`);
    res.send(Buffer.from(pdfBytes)); // Send as a buffer for better compatibility
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});


// --- Serve Frontend ---
// This catch-all route ensures that navigating directly to any frontend page
// (e.g., /bookings) will serve the main HTML file, and let the frontend routing handle it.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});


// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
