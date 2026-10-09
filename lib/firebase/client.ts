'use client';

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { resolveFirebaseEmulatorConfig } from '@/lib/firebase/emulator-config';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
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
  // Em redes móveis/proxies, o WebChannel pode cair repetidamente. O fallback por long-polling
  // mantém carrinho, acompanhamento e painel operando sem exigir configuração do cliente.
  db ??= initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  functions ??= getFunctions(app, 'southamerica-east1');

  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true' && !emulatorsConnected) {
    const emulator = resolveFirebaseEmulatorConfig();
    connectAuthEmulator(auth, emulator.authUrl, { disableWarnings: true });
    connectFirestoreEmulator(db, emulator.firestoreHost, emulator.firestorePort);
    connectFunctionsEmulator(functions, emulator.functionsHost, emulator.functionsPort);
    emulatorsConnected = true;
  }

  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY;
  if (siteKey && typeof window !== 'undefined' && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== 'true') {
    try { initializeAppCheck(app, { provider: new ReCaptchaV3Provider(siteKey), isTokenAutoRefreshEnabled: true }); } catch { /* already initialized */ }
  }
  return { app, auth, db, functions };
}
