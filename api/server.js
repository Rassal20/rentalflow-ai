/* 
 * RentalFlow AI Server - Gemini Flash 2.0 Integration
 * ---------------------------------------------------------
 * Uses gemini-2.0-flash model with proper API configuration
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
    // Use correct model name for Gemini Flash 2.0
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: {
        maxOutputTokens: 300
      }
    });
    
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
        stateInstructions = `Greet customer, suggest vehicles, start conversation`;
        break;
        
      case USER_STATES.NEGOTIATING:
        stateInstructions = `Handle objections, offer alternatives, provide discounts`;
        break;
        
      case USER_STATES.BOOKING_CONFIRMATION:
        stateInstructions = `Confirm booking, ask for confirmation, explain next steps`;
        break;
        
      case USER_STATES.DOCUMENT_COLLECTION:
        stateInstructions = `Request documents one by one, explain purpose, reassure security`;
        break;
        
      case USER_STATES.COMPLETED:
        stateInstructions = `Thank customer, provide delivery details, offer support`;
        break;
    }

    // Custom prompt with state management
    const prompt = `
      Role: ${companyProfile.ai_agent_name || 'Alex'} at ${companyProfile.company_name || 'Prestige Rentals Dubai'}
      Current State: ${userState}
      Instructions: ${stateInstructions}
      
      Conversation History:
      ${historyText || 'No history yet'}
      
      Customer Message: "${userMessage}"
      
      Fleet Highlights:
      ${fleetInfo.slice(0, 5).join('\n')}
      
      Response Rules:
      - Be human-like and professional
      - Negotiate effectively
      - Progress conversation to booking
      - Request documents when ready
      - Keep response under 300 characters
      - Use 1-2 emojis
      - Sign with name and company
      
      Output Format:
      <response>Your response text</response>
      <state>next_state</state>
      <action>optional_action</action>
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const fullResponse = response.text();
    console.log("🤖 AI Response:", fullResponse);

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

// ... [REST OF THE CODE REMAINS THE SAME] ...