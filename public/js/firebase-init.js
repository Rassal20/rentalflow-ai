// public/js/firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getFirestore, doc, getDoc, collection, getDocs,
  addDoc, serverTimestamp, query, where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword } 
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAZL-KL0vyCw4qixtzJhP7H8PuyytDWQhs",
  authDomain: "rentalflow-ai-app.firebaseapp.com",
  projectId: "rentalflow-ai-app",
  storageBucket: "rentalflow-ai-app.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef1234567890"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth, doc, getDoc, collection, getDocs, addDoc, serverTimestamp, query, where };

// Fetch available vehicles
export async function getAvailableVehicles() {
  const vehicles = [];
  const snapshot = await getDocs(collection(db, "fleet"));
  
  snapshot.forEach(doc => {
    const data = doc.data();
    if(data.status === "available") {
      vehicles.push({ id: doc.id, ...data });
    }
  });
  
  return vehicles;
}

// Fetch company profile
export async function getCompanyProfile() {
  const docRef = doc(db, "company_profile", "main");
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data() : null;
}

// Fetch active bookings
export async function getActiveBookings() {
  const bookings = [];
  const snapshot = await getDocs(collection(db, "bookings"));
  
  snapshot.forEach(doc => {
    const data = doc.data();
    if(data.status === "active") {
      bookings.push({ id: doc.id, ...data });
    }
  });
  
  return bookings;
}

// Create a new booking
export async function createBooking(bookingData) {
  try {
    const docRef = await addDoc(collection(db, "bookings"), {
      ...bookingData,
      createdAt: serverTimestamp(),
      status: "confirmed",
      totalPrice: calculatePrice(
        bookingData.dailyRate,
        bookingData.startDate,
        bookingData.endDate
      )
    });
    return docRef.id;
  } catch (error) {
    console.error("Error creating booking:", error);
    throw error;
  }
}

function calculatePrice(dailyRate, start, end) {
  const days = Math.ceil((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24));
  return dailyRate * days;
}