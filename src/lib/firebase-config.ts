// Firebase Web SDK Configuration
export const firebaseConfig = {
  apiKey: "AIzaSyCaSlX7htQkBfUuSYUnmzPt8xsBGLbbock",
  authDomain: "soundwavr-9b1ea.firebaseapp.com",
  projectId: "soundwavr-9b1ea",
  storageBucket: "soundwavr-9b1ea.firebasestorage.app",
  messagingSenderId: "65486827898",
  appId: "1:65486827898:web:fd3771c654c3fcfddfa6c3",
};

// Check if Firebase is properly configured
export const isFirebaseConfigured = 
  firebaseConfig.apiKey && 
  !firebaseConfig.apiKey.startsWith('YOUR_');
