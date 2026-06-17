// src/config/firebase.js
// ─────────────────────────────────────────────────────────────
// Firebase Admin SDK (v14 modular API) — MyLocalBazaar.store
// Handles: FCM push notifications + Phone Auth ID token verification
// for Customer/Merchant/Delivery apps
// ─────────────────────────────────────────────────────────────

const { initializeApp, getApps, getApp, cert } = require('firebase-admin/app');
const logger = require('./logger');

let firebaseApp = null;
let unavailable = false;

const initFirebase = () => {
  if (firebaseApp) return firebaseApp;
  if (unavailable) return null;

  if (
    !process.env.FIREBASE_PROJECT_ID ||
    !process.env.FIREBASE_CLIENT_EMAIL ||
    !process.env.FIREBASE_PRIVATE_KEY
  ) {
    logger.warn('Firebase: credentials not configured. Push notifications & Phone Auth disabled.');
    unavailable = true;
    return null;
  }

  try {
    firebaseApp = getApps().length
      ? getApp()
      : initializeApp({
          credential: cert({
            projectId:   process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          }),
        });
    logger.info('Firebase Admin SDK initialized');
    return firebaseApp;
  } catch (err) {
    logger.error('Firebase initialization failed:', { message: err.message });
    unavailable = true;
    return null;
  }
};

// Verify a Firebase Phone Auth ID token (sent by the client after
// completing signInWithPhoneNumber). Returns the decoded token,
// which includes `phone_number` in E.164 format (e.g. +919876543210).
const verifyIdToken = async (idToken) => {
  const app = initFirebase();
  if (!app) {
    throw new Error('Firebase Admin SDK not configured');
  }
  const { getAuth } = require('firebase-admin/auth');
  return getAuth(app).verifyIdToken(idToken);
};

module.exports = { initFirebase, verifyIdToken };
