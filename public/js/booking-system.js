import { db, collection, addDoc, serverTimestamp } from './firebase-init.js';

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

export async function getCustomerBookings(customerId) {
  const bookings = [];
  const snapshot = await getDocs(
    query(collection(db, "bookings"), 
    where("customerId", "==", customerId))
  );
  
  snapshot.forEach(doc => {
    bookings.push({ id: doc.id, ...doc.data() });
  });
  
  return bookings;
}