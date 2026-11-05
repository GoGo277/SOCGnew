import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';

/**
 * Firebase bootstrap.
 *
 * Cloud mode (VITE_FIREBASE_* set): Firebase Authentication holds analyst
 * credentials and MFA, roles are custom claims set by Cloud Functions, and all
 * collections sync in real time through Firestore onSnapshot listeners.
 *
 * Local mode (no config): single-browser evaluation store with cross-tab sync.
 *
 * VITE_USE_FIREBASE_EMULATORS=true connects to the local Emulator Suite.
 */
const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = !!(firebaseConfig.apiKey && firebaseConfig.projectId);
export const FUNCTIONS_REGION = env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
let functions: Functions | null = null;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    functions = getFunctions(app, FUNCTIONS_REGION);
    if (env.VITE_USE_FIREBASE_EMULATORS === 'true') {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    }
  } catch (err) {
    console.error('[G-Eyes] Firebase initialisation failed, falling back to local store.', err);
    app = db = auth = functions = null as any;
  }
}

export { app as firebaseApp, db, auth, functions };
export const isCloudMode = () => !!db;
export const backendLabel = db ? 'Firestore Cloud Sync' : 'Local Sync (offline mode)';
