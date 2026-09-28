import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Safe to commit -- this is a public client identifier, not a secret.
// Firebase's security model relies on server-side ID-token verification
// (see server/src/middleware/auth.ts) and Firebase's own project security
// settings, not on hiding this config from the browser.
const firebaseConfig = {
  apiKey: 'AIzaSyA4Q7ZxaNq178UH7cwVy5H0tru04FujE24',
  authDomain: 'masterbook-2caae.firebaseapp.com',
  projectId: 'masterbook-2caae',
  storageBucket: 'masterbook-2caae.firebasestorage.app',
  messagingSenderId: '517561137324',
  appId: '1:517561137324:web:f9db1900c49ffddcb58709'
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
