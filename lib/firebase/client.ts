'use client';

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || (process.env.NODE_ENV === 'production' ? 'AIzaSyASRp60yKSS4yYH9F_Cqvb6Mqqw4FvbhZM' : undefined),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || (process.env.NODE_ENV === 'production' ? 'food-5fb44.firebaseapp.com' : undefined),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || (process.env.NODE_ENV === 'production' ? 'food-5fb44' : undefined),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || (process.env.NODE_ENV === 'production' ? 'food-5fb44.firebasestorage.app' : undefined),
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || (process.env.NODE_ENV === 'production' ? '479799095107' : undefined),
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || (process.env.NODE_ENV === 'production' ? '1:479799095107:web:2772afc2ff0ca65c6c09f6' : undefined),
};

export const hasFirebaseConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)
  && !(process.env.NODE_ENV === 'production' && (firebaseConfig.projectId?.startsWith('demo-') || process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true'));
export const useDevelopmentSeed = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_USE_DEVELOPMENT_SEED !== 'false';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let functions: Functions | null = null;
let emulatorsConnected = false;

export function getFirebaseClient(): { app: FirebaseApp; auth: Auth; db: Firestore; functions: Functions } {
  if (!hasFirebaseConfig) throw new Error('Firebase não configurado. Copie .env.example para .env.local.');
  app = getApps()[0] ?? initializeApp(firebaseConfig);
  auth ??= getAuth(app);
  db ??= getFirestore(app);
  functions ??= getFunctions(app, 'southamerica-east1');

  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true' && !emulatorsConnected) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8180);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    emulatorsConnected = true;
  }

  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY;
  if (siteKey && typeof window !== 'undefined' && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== 'true') {
    try { initializeAppCheck(app, { provider: new ReCaptchaV3Provider(siteKey), isTokenAutoRefreshEnabled: true }); } catch { /* already initialized */ }
  }
  return { app, auth, db, functions };
}
