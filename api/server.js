/* 
 * RentalFlow AI Server - FINAL WITH GEMINI AI & FIREBASE INTEGRATION
 * ---------------------------------------------------------
 * Full integration with Firebase Firestore and Gemini AI
 */

const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const fetch = require('node-fetch');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();

// --- INITIALIZE FIREBASE ADMIN ---
let db;
try {
  if (process.env.FIREBASE_CREDENTIALS && !admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    admin.initializeApp({ 
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://rentalflow-ai-app.firebaseio.com"
    });
    db = admin.firestore();
    console.log("✅ Firebase Admin SDK initialized successfully");
  } else if (admin.apps.length) {
    db = admin.firestore();
    console.log("ℹ️ Firebase Admin SDK already initialized");
  }
} catch (error) {
  console.error("❌ Firebase initialization failed:", error.message);
}

// --- INITIALIZE GEMINI AI ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("⚠️ GEMINI_API_KEY environment variable missing! AI features disabled");
}
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// --- MIDDLEWARE ---
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// --- CONFIGURATION ---
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8098722195:AAHYS_feh9J7iN2EkpjLla4ULfocdYEXctg';

// --- FIREBASE HELPER FUNCTIONS ---
const getCollection = async (collectionName) => {
    if (!db) throw new Error("Database not initialized");
    const snapshot = await db.collection(collectionName).get();
    return snapshot.empty ? [] : snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

const getDocument = async (collectionName, docId) => {
    if (!db) throw new Error("Database not initialized");
    const doc = await db.collection(collectionName).doc(docId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
};

// --- AI RESPONSE GENERATOR ---
async function generateAIResponse(userMessage, companyProfile, fleetData, marketFleet) {
  if (!genAI) {
    console.log("Skipping AI response - Gemini not initialized");
    return null;
  }
  
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    // Prepare fleet information
    const fleetInfo = [...fleetData, ...marketFleet].map(v => 
      `${v.model} (${v.category}) - ${v.pricing?.daily ? `AED ${v.pricing.daily.min_rate}-${v.pricing.daily.max_rate}/day` : 'Price on request'}`
    );
    
    // Remove duplicates
    const uniqueFleet = [...new Set(fleetInfo)].slice(0, 10);

    // Custom prompt for rental business
    const prompt = `
      Role: You are ${companyProfile.ai_agent_name || 'Alex'}, the AI agent for ${companyProfile.company_name || 'Prestige Rentals Dubai'}
      Context: Responding to customer inquiry about luxury car rentals in Dubai
      Current Date: ${new Date().toISOString().split('T')[0]}
      
      **FLEET INFORMATION:**
      ${uniqueFleet.join('\n')}
      
      **SERVICES:**
      - Free delivery anywhere in Dubai
      - 24/7 customer support
      - Comprehensive insurance included
      - Flexible rental periods (hourly, daily, weekly, monthly)
      
      **CUSTOMER MESSAGE:**
      "${userMessage}"
      
      **RESPONSE GUIDELINES:**
      1. Be friendly and professional (use customer's name if available)
      2. Highlight 1-2 relevant vehicles from our fleet
      3. Mention key benefits where appropriate
      4. Explain pricing clearly (show sample rates if possible)
      5. For availability, ask for specific dates
      6. Keep response under 400 characters
      7. Always end with a question to continue conversation
      8. Use 1-2 relevant emojis
      9. NEVER mention you're an AI bot
      10. Include special offers if available
      
      **SIGNATURE:**
      - Always include name and company at the end
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response.text();
    console.log("🤖 Generated AI Response:", response);
    return response;
  } catch (error) {
    console.error("❌ Gemini Error:", error);
    return null;
  }
}

// --- PAGE SERVING ROUTE ---
app.get(['/', '/dashboard.html'], (req, res) => {
    res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// --- API ENDPOINTS ---

// COMPANY PROFILE
app.get('/api/company-profile', async (req, res) => {
    try {
        const profile = await getCollection('company_profile');
        res.status(200).json(profile[0] || {});
    } catch(e) { 
        res.status(500).json({ message: "Error fetching profile" }); 
    }
});

app.put('/api/company-profile/:id', async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database not connected" });
    try {
        const profileId = req.params.id;
        const updatedData = req.body;
        await db.collection('company_profile').doc(profileId).update(updatedData);
        res.status(200).json({ message: 'Profile updated!', data: updatedData });
    } catch (error) {
        res.status(500).json({ message: "Failed to update profile", error: error.message });
    }
});

// FLEET MANAGEMENT
app.get('/api/fleet', async (req, res) => {
    try {
        const fleet = await getCollection('fleet');
        res.status(200).json(fleet);
    } catch (e) { 
        res.status(500).json({ message: "Error fetching fleet" }); 
    }
});

app.post('/api/fleet', async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database not connected" });
    try {
        const newVehicle = req.body;
        const docRef = newVehicle.id 
            ? db.collection('fleet').doc(newVehicle.id)
            : db.collection('fleet').doc();
            
        if (!newVehicle.id) newVehicle.id = docRef.id;
        await docRef.set(newVehicle);
        res.status(201).json({ message: 'Vehicle added!', vehicle: newVehicle });
    } catch (error) {
        res.status(500).json({ message: "Failed to add vehicle", error: error.message });
    }
});

app.put('/api/fleet/:id', async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database not connected" });
    try {
        const vehicleId = req.params.id;
        const updatedData = req.body;
        await db.collection('fleet').doc(vehicleId).update(updatedData);
        res.status(200).json({ message: 'Vehicle updated!', data: updatedData });
    } catch (error) {
        res.status(500).json({ message: "Failed to update vehicle", error: error.message });
    }
});

app.delete('/api/fleet/:id', async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database not connected" });
    try {
        const vehicleId = req.params.id;
        await db.collection('fleet').doc(vehicleId).delete();
        res.status(200).json({ message: 'Vehicle deleted!' });
    } catch (error) {
        res.status(500).json({ message: "Failed to delete vehicle", error: error.message });
    }
});

// MARKET FLEET
app.get('/api/market-fleet', async (req, res) => {
    try {
        const fleet = await getCollection('market_fleet');
        res.status(200).json(fleet);
    } catch (e) { 
        res.status(500).json({ message: "Error fetching market fleet" }); 
    }
});

// BOOKINGS
app.get('/api/bookings', async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database not connected" });
    try {
        const bookings = await getCollection('bookings');
        res.status(200).json(bookings);
    } catch (e) {
        res.status(500).json({ message: "Error fetching bookings" });
    }
});

app.post('/api/bookings', async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database not connected" });
    try {
        const newBooking = req.body;
        const docRef = await db.collection('bookings').add({
            ...newBooking,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        res.status(201).json({ message: 'Booking added!', bookingId: docRef.id });
    } catch (error) {
        res.status(500).json({ message: "Failed to add booking", error: error.message });
    }
});

// LEADS
app.get('/api/leads', async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database not connected" });
    try {
        const leads = await getCollection('leads');
        res.status(200).json(leads);
    } catch (e) {
        res.status(500).json({ message: "Error fetching leads" });
    }
});

app.post('/api/leads', async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database not connected" });
    try {
        const newLead = {
            ...req.body,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'new'
        };
        const docRef = await db.collection('leads').add(newLead);
        res.status(201).json({ message: 'Lead added!', leadId: docRef.id });
    } catch (error) {
        res.status(500).json({ message: "Failed to add lead", error: error.message });
    }
});

// CLIENT DOCUMENTS
app.post('/api/documents', async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database not connected" });
    try {
        const newDoc = {
            ...req.body,
            uploadedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        const docRef = await db.collection('documents').add(newDoc);
        res.status(201).json({ message: 'Document uploaded!', docId: docRef.id });
    } catch (error) {
        res.status(500).json({ message: "Failed to upload document", error: error.message });
    }
});

// --- TELEGRAM BOT WITH AI INTEGRATION ---
app.post('/api/webhook/telegram', express.json(), async (req, res) => {
    try {
        console.log("📩 Received Telegram update");
        const { message } = req.body;
        
        // Validate message
        if (!message || !message.text || !message.from) {
            return res.status(200).send("Invalid message format");
        }

        const user = message.from;
        const chatId = message.chat.id;
        const text = message.text;
        const firstName = user.first_name || '';

        // Load business data
        let companyProfile = {};
        let fleetData = [];
        let marketFleet = [];
        
        try {
            // Get company profile
            const profile = await getCollection('company_profile');
            companyProfile = profile[0] || {};
            
            // Get fleet data
            fleetData = await getCollection('fleet');
            marketFleet = await getCollection('market_fleet');
        } catch (error) {
            console.error("Error loading business data:", error);
        }

        // Save lead to Firestore
        const leadData = {
            name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
            username: user.username ? `@${user.username}` : '',
            contact: `tg:${user.id}`,
            message: text,
            source: 'Telegram',
            status: 'new',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        try {
            await db.collection('leads').add(leadData);
            console.log(`✅ New lead created: ${leadData.name}`);
        } catch (error) {
            console.error("Error saving lead:", error);
        }

        // Generate AI response
        let aiResponse = await generateAIResponse(text, companyProfile, fleetData, marketFleet);
        
        // Fallback if AI fails
        if (!aiResponse) {
            aiResponse = `🚗 Thanks for your message, ${firstName || 'there'}! \n\n` +
                        `We've received your inquiry and will contact you shortly.\n\n` +
                        `Your inquiry: "${text}"`;
        }

        // Add signature
        aiResponse += `\n\n— ${companyProfile.ai_agent_name || 'Alex'} at ${companyProfile.company_name || 'Prestige Rentals Dubai'}`;

        // Send response to user
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: aiResponse,
                parse_mode: 'HTML'
            })
        });

        res.status(200).send("Telegram message processed");
    } catch (error) {
        console.error("❌ Telegram webhook error:", error);
        res.status(500).send("Error processing Telegram message");
    }
});

// --- SET WEBHOOK ON STARTUP ---
const setWebhook = async () => {
    try {
        const webhookUrl = `https://rentalflow-ai.onrender.com/api/webhook/telegram`;
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${webhookUrl}`
        );
        
        const result = await response.json();
        if (result.ok) {
            console.log(`✅ Webhook set successfully to: ${webhookUrl}`);
        } else {
            console.error('❌ Failed to set webhook:', result.description);
        }
    } catch (error) {
        console.error('Error setting webhook:', error);
    }
};

// --- SERVER STARTUP ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Server listening on port ${PORT}`);
  
  // Set webhook on startup
  await setWebhook();
});