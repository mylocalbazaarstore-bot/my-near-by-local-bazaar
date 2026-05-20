// src/config/firebase.js
// ─────────────────────────────────────────────────────────────
// Firebase Admin SDK — MyLocalBazaar.store
// Handles: FCM push notifications for Customer/Merchant/Delivery apps
// ─────────────────────────────────────────────────────────────

const logger = require('./logger');

let firebaseAdmin = null;

const initFirebase = () => {
  if (firebaseAdmin) return firebaseAdmin;

  if (
    !process.env.FIREBASE_PROJECT_ID ||
    !process.env.FIREBASE_CLIENT_EMAIL ||
    !process.env.FIREBASE_PRIVATE_KEY
  ) {
    logger.warn('Firebase: credentials not configured. Push notifications disabled.');
    return null;
  }

  try {
    const admin = require('firebase-admin');

    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId:   process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
      logger.info('Firebase Admin SDK initialized');
    }

    firebaseAdmin = admin;
    return admin;
  } catch (err) {
    logger.error('Firebase initialization failed:', { message: err.message });
    return null;
  }
};

module.exports = { initFirebase };
