// src/lib/firebase.ts
// ─────────────────────────────────────────────────────────────
// Firebase Client SDK — MyLocalBazaar Frontend
// Used for Phone Authentication (signInWithPhoneNumber + reCAPTCHA)
// ─────────────────────────────────────────────────────────────

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Lazy initialization — Firebase is only spun up the first time it is actually
// needed (in the browser, inside auth handlers). Initializing at module scope
// would run getAuth() during the server prerender pass, which throws
// auth/invalid-api-key when NEXT_PUBLIC_FIREBASE_* are absent at build time and
// breaks `next build`.
let _firebaseApp: FirebaseApp | null = null;
let _firebaseAuth: Auth | null = null;

export const getFirebaseApp = (): FirebaseApp => {
  if (!_firebaseApp) {
    _firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return _firebaseApp;
};

export const getFirebaseAuth = (): Auth => {
  if (!_firebaseAuth) {
    _firebaseAuth = getAuth(getFirebaseApp());
  }
  return _firebaseAuth;
};
