import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

/**
 * Firebase / Firestore bootstrap.
 *
 * When the VITE_FIREBASE_* variables are present the platform runs in
 * "cloud" mode: every collection is synchronised in real time through
 * Firestore onSnapshot listeners. Without them the platform falls back to
 * a local, cross-tab synchronised store so it can still be evaluated offline.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = !!(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    // Firestore security rules require an authenticated transport session.
    // Analyst identity / RBAC is layered on top by the platform's credential store.
    signInAnonymously(getAuth(app)).catch(err =>
      console.warn('[G-Eyes] Anonymous Firebase auth failed — enable the Anonymous provider in Firebase Auth.', err)
    );
  } catch (err) {
    console.error('[G-Eyes] Firebase initialisation failed, falling back to local store.', err);
    app = null;
    db = null;
  }
}

export { app as firebaseApp, db };
export const backendLabel = db ? 'Firestore Cloud Sync' : 'Local Sync (offline mode)';
