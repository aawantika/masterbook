import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Safe to commit -- this is a public client identifier, not a secret.
// Firebase's security model relies on server-side ID-token verification
// (see server/src/middleware/auth.ts) and Firebase's own project security
// settings, not on hiding this config from the browser.
//
// PLACEHOLDER VALUES -- replace with the real config from Firebase Console
// > Project settings > General > Your apps > Web app > SDK setup and
// configuration, once that project has been created.
const firebaseConfig = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME.appspot.com',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME'
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
