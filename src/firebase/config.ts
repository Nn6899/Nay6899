import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { initializeFirestore, getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { parseFirebaseConfigText } from './parseConfig';

// Cách 1 (dễ nhất): một biến VITE_FIREBASE_CONFIG chứa nguyên khối firebaseConfig.
// Cách 2: từng biến VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, ...
const combined = parseFirebaseConfigText(import.meta.env.VITE_FIREBASE_CONFIG);

export const firebaseConfig = {
  apiKey: combined.apiKey || import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: combined.authDomain || import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: combined.projectId || import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: combined.storageBucket || import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: combined.messagingSenderId || import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: combined.appId || import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: combined.measurementId || import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '',
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== 'your-api-key' &&
  firebaseConfig.projectId &&
  firebaseConfig.projectId !== 'your-project-id'
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

try {
  if (isFirebaseConfigured) {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    // Bỏ qua field undefined (vd câu hỏi không có lời giải) thay vì báo lỗi khi lưu
    try {
      db = initializeFirestore(app, { ignoreUndefinedProperties: true });
    } catch {
      db = getFirestore(app);
    }
    storage = getStorage(app);
  }
} catch (error) {
  console.warn('Firebase initialization warning:', error);
}

export { app, auth, db, storage };
