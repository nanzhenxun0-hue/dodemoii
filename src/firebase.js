import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// ↓ Firebaseコンソールで発行される設定値に置き換えてください
const firebaseConfig = {
  apiKey: "AIzaSyClZ2KnM6hjeMUCKtDdRAIaAX3vzRKp83E",
  authDomain: "dodemoii-563fd.firebaseapp.com",
  projectId: "dodemoii-563fd",
  storageBucket: "dodemoii-563fd.firebasestorage.app",
  messagingSenderId: "217217419418",
  appId: "1:217217419418:web:cbd39ddefd9107d55af723",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
