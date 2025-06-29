/* 
 * RentalFlow AI Server - Advanced AI Booking Workflow
 * ---------------------------------------------------------
 * Full conversational AI with negotiation, booking confirmation, and document collection
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

// --- CONVERSATION STATE MANAGEMENT ---
const USER_STATES = {
  INITIAL: 'initial',
  NEGOTIATING: 'negotiating',
  BOOKING_CONFIRMATION: 'booking_confirmation',
  DOCUMENT_COLLECTION: 'document_collection',
  COMPLETED: 'completed'
};

const DOCUMENT_TYPES = {
  PASSPORT: 'passport',
  ID: 'id',
  DRIVING_LICENSE: 'driving_license'
};

// --- AI RESPONSE GENERATOR WITH STATE MANAGEMENT ---
async function generateAIResponse(userMessage, userState, conversationHistory, companyProfile, fleetData, marketFleet) {
  if (!genAI) {
    console.log("Skipping AI response - Gemini not initialized");
    return { 
      text: "🚗 Thanks for your message! We'll contact you shortly.",
      state: userState,
      action: null 
    };
  }
  
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    // Prepare conversation context
    const historyText = conversationHistory.map(msg => 
      `${msg.role === 'user' ? 'Customer' : 'Agent'}: ${msg.content}`
    ).join('\n');
    
    // Prepare fleet information
    const fleetInfo = [...fleetData, ...marketFleet].map(v => 
      `${v.model} (${v.category}) - ${v.pricing?.daily ? `AED ${v.pricing.daily.min_rate}-${v.pricing.daily.max_rate}/day` : 'Price on request'}`
    );
    
    // State-specific instructions
    let stateInstructions = '';
    switch(userState) {
      case USER_STATES.INITIAL:
        stateInstructions = `
          - Greet the customer warmly
          - Ask how you can help with their luxury car rental needs
          - Suggest 1-2 popular vehicles
          - Build rapport and start conversation
        `;
        break;
        
      case USER_STATES.NEGOTIATING:
        stateInstructions = `
          - Handle objections professionally
          - Offer alternatives if price is an issue
          - Provide limited-time discounts (max 10%)
          - Highlight premium services and value
          - Overcome objections with empathy
          - Never say "I can't help with that"
        `;
        break;
        
      case USER_STATES.BOOKING_CONFIRMATION:
        stateInstructions = `
          - Confirm booking details (car, dates, price)
          - Ask for explicit confirmation: "Shall I proceed with your booking?"
          - Provide total price breakdown
          - Explain next steps clearly
          - Express excitement about serving them
        `;
        break;
        
      case USER_STATES.DOCUMENT_COLLECTION:
        stateInstructions = `
          - Request required documents one by one
          - Explain why each is needed for compliance
          - Reassure about security and privacy
          - Provide clear submission instructions
          - Thank them for their cooperation
        `;
        break;
        
      case USER_STATES.COMPLETED:
        stateInstructions = `
          - Thank customer for completing booking
          - Provide pickup/delivery details
          - Offer 24/7 support contact
          - Ask if they need anything else
        `;
        break;
    }

    // Custom prompt with state management
    const prompt = `
      Role: You are ${companyProfile.ai_agent_name || 'Alex'}, AI agent for ${companyProfile.company_name || 'Prestige Rentals Dubai'}
      Current Date: ${new Date().toISOString().split('T')[0]}
      Current State: ${userState}
      
      **CONVERSATION HISTORY:**
      ${historyText || 'No history yet'}
      
      **CUSTOMER'S LATEST MESSAGE:**
      "${userMessage}"
      
      **FLEET INFORMATION:**
      ${fleetInfo.slice(0, 5).join('\n')}
      
      **SERVICES:**
      - Free Dubai delivery
      - 24/7 support
      - Comprehensive insurance
      - Flexible rental periods
      
      **STATE-SPECIFIC INSTRUCTIONS:**
      ${stateInstructions}
      
      **RESPONSE RULES:**
      1. Maintain natural, human-like conversation
      2. Negotiate professionally when needed
      3. Handle objections with empathy and solutions
      4. Progress conversation toward booking completion
      5. In booking_confirmation state, ask: "Shall I proceed with your booking?"
      6. Once booking confirmed, transition to document collection
      7. Request documents in this order: passport, ID, driving license
      8. Keep responses under 300 characters
      9. Use 1-2 relevant emojis
      10. Never mention you're an AI
      11. Always sign off with your name and company
      
      **OUTPUT FORMAT:**
      <response>Your conversational response text</response>
      <state>next_state</state>
      <action>optional_action</action>
    `;

    const result = await model.generateContent(prompt);
    const fullResponse = await result.response.text();
    console.log("🤖 Raw AI Response:", fullResponse);

    // Parse structured response
    const responseText = fullResponse.match(/<response>([\s\S]*?)<\/response>/)?.[1]?.trim() || fullResponse;
    const nextState = fullResponse.match(/<state>(\w+)<\/state>/)?.[1]?.trim() || userState;
    const action = fullResponse.match(/<action>(\w+)<\/action>/)?.[1]?.trim();

    return {
      text: responseText,
      state: nextState,
      action
    };
  } catch (error) {
    console.error("❌ Gemini Error:", error);
    return {
      text: "🚗 Thanks for your message! We'll contact you shortly.",
      state: userState,
      action: null
    };
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

// DOCUMENTS
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

// DOCUMENT DOWNLOAD ENDPOINT
app.get('/api/documents/:id/download', async (req, res) => {
  if (!db) return res.status(500).json({ message: "Database not connected" });
  
  try {
    const docId = req.params.id;
    const doc = await db.collection('documents').doc(docId).get();
    
    if (!doc.exists) {
      return res.status(404).send('Document not found');
    }
    
    const docData = doc.data();
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${docData.file_path}`;
    
    // Fetch file from Telegram
    const fileResponse = await fetch(fileUrl);
    
    if (!fileResponse.ok) {
      throw new Error('Failed to fetch document from Telegram');
    }
    
    // Set headers
    res.setHeader('Content-Type', docData.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${docData.file_name}"`);
    
    // Stream file
    const fileBuffer = await fileResponse.buffer();
    res.send(fileBuffer);
    
  } catch (error) {
    console.error("Document download error:", error);
    res.status(500).send("Error downloading document");
  }
});

// --- TELEGRAM BOT WITH ADVANCED WORKFLOW ---
app.post('/api/webhook/telegram', express.json(), async (req, res) => {
    try {
        console.log("📩 Received Telegram update");
        const { message } = req.body;
        
        // Validate message
        if (!message || (!message.text && !message.document && !message.photo)) {
            return res.status(200).send("Invalid message format");
        }

        const user = message.from;
        const chatId = message.chat.id;
        const userId = user.id;
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

        // Find or create lead document
        const leadRef = db.collection('leads').doc(`tg-${userId}`);
        const leadDoc = await leadRef.get();
        let leadData = leadDoc.exists ? leadDoc.data() : {
            name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
            username: user.username ? `@${user.username}` : '',
            contact: `tg:${userId}`,
            source: 'Telegram',
            status: 'new',
            state: USER_STATES.INITIAL,
            conversation: [],
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        // Handle different message types
        let userMessage = '';
        let documentData = null;
        
        if (message.text) {
            userMessage = message.text;
        } 
        else if (message.document) {
            userMessage = "📄 I've uploaded a document";
            documentData = {
                file_id: message.document.file_id,
                file_name: message.document.file_name,
                mime_type: message.document.mime_type,
                type: 'document'
            };
        }
        else if (message.photo && message.photo.length > 0) {
            userMessage = "🖼️ I've uploaded a photo";
            // Get the highest resolution photo
            const photo = message.photo.reduce((prev, current) => 
                (prev.file_size > current.file_size) ? prev : current
            );
            documentData = {
                file_id: photo.file_id,
                file_name: 'photo.jpg',
                mime_type: 'image/jpeg',
                type: 'photo'
            };
        }
        
        // Add user message to conversation
        leadData.conversation.push({
            role: 'user',
            content: userMessage,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            document: documentData
        });
        
        // Save document if uploaded
        if (documentData && leadData.state === USER_STATES.DOCUMENT_COLLECTION) {
            const docType = leadData.documentType || 'unknown';
            const docRef = db.collection('documents').doc();
            
            // Get file path from Telegram
            const fileInfoUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${documentData.file_id}`;
            const fileInfoRes = await fetch(fileInfoUrl);
            const fileInfo = await fileInfoRes.json();
            
            if (!fileInfo.ok) {
                throw new Error('Failed to get file info from Telegram');
            }
            
            await docRef.set({
                leadId: leadRef.id,
                type: docType,
                file_id: documentData.file_id,
                file_path: fileInfo.result.file_path,
                file_name: documentData.file_name,
                mime_type: documentData.mime_type,
                uploadedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            // Update document status in lead
            leadData.documents = leadData.documents || {};
            leadData.documents[docType] = docRef.id;
            
            // Check if all documents received
            const docsNeeded = [DOCUMENT_TYPES.PASSPORT, DOCUMENT_TYPES.ID, DOCUMENT_TYPES.DRIVING_LICENSE];
            const nextDoc = docsNeeded.find(doc => !leadData.documents?.[doc]);
            
            if (nextDoc) {
                // Update lead with next document type to request
                leadData.documentType = nextDoc;
            } else {
                // All documents received - create booking
                leadData.state = USER_STATES.COMPLETED;
                
                // Create booking
                const bookingData = {
                    leadId: leadRef.id,
                    customerName: leadData.name,
                    contact: leadData.contact,
                    vehicle: leadData.selectedVehicle || 'Not specified',
                    startDate: leadData.bookingStart || new Date(),
                    endDate: leadData.bookingEnd || new Date(),
                    totalPrice: leadData.bookingPrice || 0,
                    status: 'confirmed',
                    documents: leadData.documents,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                };
                
                await db.collection('bookings').add(bookingData);
                console.log(`✅ Booking created for lead: ${leadRef.id}`);
            }
        }
        
        // Generate AI response (only if not document upload)
        let aiResponse = {};
        if (!documentData || leadData.state !== USER_STATES.DOCUMENT_COLLECTION) {
            aiResponse = await generateAIResponse(
                userMessage,
                leadData.state,
                leadData.conversation,
                companyProfile,
                fleetData,
                marketFleet
            );
            
            // Update lead state
            leadData.state = aiResponse.state || leadData.state;
            
            // Handle special actions
            if (aiResponse.action === 'request_documents') {
                leadData.documentType = DOCUMENT_TYPES.PASSPORT; // Start with passport
                leadData.state = USER_STATES.DOCUMENT_COLLECTION;
            }
            
            // Add AI response to conversation
            leadData.conversation.push({
                role: 'assistant',
                content: aiResponse.text,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // Update lead in Firestore
        leadData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        await leadRef.set(leadData, { merge: true });
        console.log(`✅ Updated lead: ${leadRef.id} with state: ${leadData.state}`);
        
        // Send AI response to user
        if (aiResponse.text) {
            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: aiResponse.text,
                    parse_mode: 'HTML'
                })
            });
        }

        // Send document request if in document collection state
        if (leadData.state === USER_STATES.DOCUMENT_COLLECTION && leadData.documentType) {
            const docType = leadData.documentType;
            let requestMessage = '';
            
            switch(docType) {
                case DOCUMENT_TYPES.PASSPORT:
                    requestMessage = `📘 Please share a clear photo of your passport information page. We need this for verification purposes.`;
                    break;
                case DOCUMENT_TYPES.ID:
                    requestMessage = `🆔 Please share photos of your Emirates ID (front and back). This is required for local regulations.`;
                    break;
                case DOCUMENT_TYPES.DRIVING_LICENSE:
                    requestMessage = `🚗 Please share your valid driving license (both sides if applicable). This confirms you're eligible to drive our vehicles.`;
                    break;
            }
            
            if (requestMessage) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Brief delay
                
                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: requestMessage,
                        parse_mode: 'HTML'
                    })
                });
            }
        }

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