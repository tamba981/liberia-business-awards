// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyC8MO55eg14CWogP4SingE3FR3gnF95AHY",
    authDomain: "liberia-business-awards.firebaseapp.com",
    projectId: "liberia-business-awards",
    storageBucket: "liberia-business-awards.firebasestorage.app",
    messagingSenderId: "587090267399",
    appId: "1:587090267399:web:71f874b090171e9c6fc9a2",
    measurementId: "G-HFJYS6MM3N"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();