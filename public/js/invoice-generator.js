// api/invoiceGenerator.js
const { PDFDocument } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fetch = require('node-fetch');

module.exports = {
  generateInvoice: async (invoiceData) => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    
    const page = pdfDoc.addPage([600, 800]);
    const { width, height } = page.getSize();
    
    // Add company info
    page.drawText(invoiceData.companyName, { 
      x: 50, 
      y: height - 50, 
      size: 20 
    });
    
    page.drawText(`Invoice #${invoiceData.id}`, { 
      x: width - 150, 
      y: height - 50, 
      size: 16 
    });
    
    // Add dates
    page.drawText(`Date: ${new Date().toLocaleDateString()}`, { 
      x: 50, 
      y: height - 80 
    });
    
    // Add customer info
    page.drawText(`Bill To: ${invoiceData.customerName}`, { 
      x: 50, 
      y: height - 120 
    });
    
    page.drawText(invoiceData.customerEmail, { 
      x: 50, 
      y: height - 140 
    });
    
    // Add items table
    let y = height - 200;
    page.drawText('Description', { x: 50, y });
    page.drawText('Amount', { x: width - 100, y });
    
    page.drawLine({
      start: { x: 50, y: y - 5 },
      end: { x: width - 50, y: y - 5 },
      thickness: 1,
    });
    
    y -= 30;
    invoiceData.items.forEach(item => {
      page.drawText(item.description, { x: 50, y });
      page.drawText(`${item.amount} ${invoiceData.currency}`, { x: width - 100, y });
      y -= 20;
    });
    
    // Add total
    page.drawLine({
      start: { x: 50, y: y - 5 },
      end: { x: width - 50, y: y - 5 },
      thickness: 1,
    });
    
    y -= 20;
    page.drawText('Total:', { 
      x: 50, 
      y,
      size: 14 
    });
    
    page.drawText(`${invoiceData.total} ${invoiceData.currency}`, { 
      x: width - 100, 
      y,
      size: 14,
    });
    
    // Add company logo if available
    if (invoiceData.logoUrl) {
      try {
        const logoResponse = await fetch(invoiceData.logoUrl);
        const logoBuffer = await logoResponse.arrayBuffer();
        const image = await pdfDoc.embedPng(logoBuffer);
        page.drawImage(image, {
          x: width - 150,
          y: height - 100,
          width: 80,
          height: 40,
        });
      } catch (error) {
        console.error('Failed to embed logo:', error);
      }
    }
    
    return await pdfDoc.save();
  }
};