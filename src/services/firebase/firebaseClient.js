// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { 
  getAuth, 
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut 
} from "firebase/auth";

// Your web app's Firebase configuration (hardcoded to prevent undefined env variable errors)
const firebaseConfig = {
  apiKey: "AIzaSyDqdPbkpI54X1_KpNErPkGfW-Ccv0ly7fU",
  authDomain: "icloud-8bc82.firebaseapp.com",
  projectId: "icloud-8bc82",
  storageBucket: "icloud-8bc82.firebasestorage.app",
  messagingSenderId: "275506075212",
  appId: "1:275506075212:web:38eae04104c991db6c46e9",
  measurementId: "G-4BPTE78HJQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth & Google Provider
// Explicitly persist the session on-device so users stay signed in after the app is closed
let authInstance;
try {
  authInstance = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
} catch {
  // Already initialised (e.g. hot reload)
  authInstance = getAuth(app);
}
export const auth = authInstance;
export const googleProvider = new GoogleAuthProvider();

// Initialize Analytics safely (Conditional check for Capacitor / non-browser environments)
export let analytics = null;
isSupported().then((supported) => {
  if (supported) {
    analytics = getAnalytics(app);
  }
});

export { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  signOut 
};
