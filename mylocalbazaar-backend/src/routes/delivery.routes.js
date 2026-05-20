// src/routes/delivery.routes.js
// ─────────────────────────────────────────────────────────────
// Delivery Partner Routes — MyLocalBazaar.store
// Base: /api/v1/delivery
//
// Auth chain:
//   Partner routes: authenticate + authorize('delivery_partner')
//   Admin routes:   authenticate + authorize('admin') + restrictToAdminIPs
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();

const { authenticate, authorize, restrictToAdminIPs } = require('../middlewares/auth.middleware');
const { validate }          = require('../middlewares/validate.middleware');
const { otpLimiter, authLimiter, uploadLimiter } = require('../middlewares/rateLimiter.middleware');
const { uploadDeliveryProof } = require('../config/cloudinary');
const V = require('../validators/delivery.validator');

const authCtrl    = require('../controllers/delivery/auth.delivery.controller');
const partnerCtrl = require('../controllers/delivery/partner.delivery.controller');

// ═══════════════════════════════════════════════════════════════
// AUTH (no authentication required)
// ═══════════════════════════════════════════════════════════════
router.post('/auth/send-otp',
  otpLimiter,
  validate(V.sendOTP),
  authCtrl.sendOTPHandler
);

router.post('/auth/verify-otp',
  authLimiter,
  validate(V.verifyOTP),
  authCtrl.verifyOTPHandler
);

router.post('/auth/register',
  authLimiter,
  validate(V.registerPartner),
  authCtrl.register
);

router.post('/auth/login',
  authLimiter,
  validate(V.loginPartner),
  authCtrl.login
);

router.post('/auth/refresh',
  (req, res, next) => {
    if (!req.body.refresh_token) {
      return res.status(422).json({ success: false, message: 'refresh_token is required' });
    }
    next();
  },
  authCtrl.refreshToken
);

// ═══════════════════════════════════════════════════════════════
// PARTNER PROTECTED ROUTES
// Auth: authenticate + authorize('delivery_partner')
// ═══════════════════════════════════════════════════════════════
const partnerAuth = [authenticate, authorize('delivery_partner')];

router.get('/auth/me',         ...partnerAuth, authCtrl.getProfile);
router.post('/auth/logout',    ...partnerAuth, authCtrl.logout);

// Live GPS location update (high frequency — lightweight response)
router.patch('/location',
  ...partnerAuth,
  validate(V.updateLocation),
  partnerCtrl.updateLocation
);

// Online/offline toggle
router.patch('/status',
  ...partnerAuth,
  validate(V.toggleOnline),
  partnerCtrl.updateStatus
);

// Active assignments — BEFORE /assignments/:id to prevent route shadowing
router.get('/assignments/active',
  ...partnerAuth,
  partnerCtrl.getActiveAssignments
);

// Assignment history (paginated)
router.get('/assignments',
  ...partnerAuth,
  validate(V.deliveryListQuery, 'query'),
  partnerCtrl.getAssignmentHistory
);

// Pickup confirmation
router.post('/assignments/:id/pickup',
  ...partnerAuth,
  partnerCtrl.confirmPickup
);

// Doorstep OTP verification
router.post('/assignments/:id/otp',
  ...partnerAuth,
  validate(V.verifyDeliveryOTP),
  partnerCtrl.verifyDeliveryOTP
);

// Proof of delivery image upload
router.post('/assignments/:id/proof',
  ...partnerAuth,
  uploadLimiter,
  (req, res, next) => {
    uploadDeliveryProof(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message });
      next();
    });
  },
  partnerCtrl.uploadProof
);

// Failed delivery report
router.post('/assignments/:id/failed',
  ...partnerAuth,
  validate(V.reportFailedDelivery),
  partnerCtrl.reportFailed
);

// Earnings dashboard — BEFORE /earnings/:anything
router.get('/earnings',
  ...partnerAuth,
  validate(V.earningsQuery, 'query'),
  partnerCtrl.getEarnings
);

// Payout request
router.post('/earnings/payout',
  ...partnerAuth,
  (req, res, next) => {
    const { amount } = req.body;
    if (!amount) return res.status(422).json({ success: false, message: 'amount is required' });
    next();
  },
  partnerCtrl.requestPayout
);

// ═══════════════════════════════════════════════════════════════
// ADMIN DELIVERY MANAGEMENT ROUTES
// Auth: restrictToAdminIPs + authenticate + authorize('admin')
// ═══════════════════════════════════════════════════════════════
const adminAuth = [restrictToAdminIPs, authenticate, authorize('admin')];

// Assign delivery to partner
router.post('/admin/assign',
  ...adminAuth,
  validate(V.assignRoute),
  partnerCtrl.adminAssignDelivery
);

// Get nearest available partners for an order location
router.get('/admin/available',
  ...adminAuth,
  validate(V.nearbyPartnersQuery, 'query'),
  partnerCtrl.getAvailablePartners
);

// List all partners
router.get('/admin/partners',
  ...adminAuth,
  partnerCtrl.getAllPartners
);

// Verify / un-verify a partner
router.patch('/admin/partners/:id/verify',
  ...adminAuth,
  partnerCtrl.verifyPartner
);

// Get live location of a specific partner
router.get('/admin/partners/:id/location',
  ...adminAuth,
  partnerCtrl.getPartnerLiveLocation
);

module.exports = router;
