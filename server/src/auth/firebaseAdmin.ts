import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';

// Initialized lazily (on first actual use, not at import time) so simply
// importing this module never has the side effect of reaching out to
// Firebase or requiring a credential to be present -- only calling
// getFirebaseAuth() does. GOOGLE_APPLICATION_CREDENTIALS is the Admin
// SDK's own standard env var convention (a path to the service-account
// JSON downloaded from the Firebase Console). Checked explicitly here so a
// missing/misconfigured credential fails with one clear message the first
// time a request needs it, instead of a cryptic internal SDK error.
let auth: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (!auth) {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      throw new Error(
        'GOOGLE_APPLICATION_CREDENTIALS is not set -- point it at the Firebase service-account JSON ' +
          'downloaded from the Firebase Console (Project settings > Service accounts > Generate new private key).'
      );
    }
    if (getApps().length === 0) {
      initializeApp({ credential: applicationDefault() });
    }
    auth = getAuth();
  }
  return auth;
}
