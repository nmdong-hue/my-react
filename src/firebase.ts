
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCo9JCoN0BRb2dB6a5Wm6itU3Fsr0G3fd0",
  authDomain: "my-react-app-90516368-4aea3.firebaseapp.com",
  projectId: "my-react-app-90516368-4aea3",
  storageBucket: "my-react-app-90516368-4aea3.firebasestorage.app",
  messagingSenderId: "1055850855092",
  appId: "1:1055850855092:web:4c429dcf291ab5df7ab5e1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
