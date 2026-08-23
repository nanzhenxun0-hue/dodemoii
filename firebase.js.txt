import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// ↓ Firebaseコンソールで発行される設定値に置き換えてください
const firebaseConfig = {
  apiKey: "ここにapiKeyを貼る",
  authDomain: "ここにauthDomainを貼る",
  projectId: "ここにprojectIdを貼る",
  storageBucket: "ここにstorageBucketを貼る",
  messagingSenderId: "ここにmessagingSenderIdを貼る",
  appId: "ここにappIdを貼る",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
