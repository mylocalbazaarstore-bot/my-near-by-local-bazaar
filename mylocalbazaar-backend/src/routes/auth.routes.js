// src/routes/auth.routes.js
// ─────────────────────────────────────────────────────────────
// Auth Routes — MyLocalBazaar.store
// Mounts customer | merchant | admin auth under /auth/*
// All validation is applied before controllers are called
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();

const { validate }          = require('../middlewares/validate.middleware');
const { authenticate, authorize, restrictToAdminIPs } = require('../middlewares/auth.middleware');
const { authLimiter, otpLimiter, adminLimiter, uploadLimiter } = require('../middlewares/rateLimiter.middleware');
const { uploadKYCDocument, uploadMerchantLogo } = require('../config/cloudinary');

const customerCtrl = require('../controllers/auth/customer.auth.controller');
const merchantCtrl = require('../controllers/auth/merchant.auth.controller');
const adminCtrl    = require('../controllers/auth/admin.auth.controller');

const V = require('../validators/auth.validator');

// ═══════════════════════════════════════════════════════════════
// CUSTOMER AUTH  —  /auth/customer/*
// ═══════════════════════════════════════════════════════════════
const customerRouter = express.Router();

// Public (no auth required)
customerRouter.post(
  '/send-otp',
  otpLimiter,
  validate(V.customerSendOTP),
  customerCtrl.sendOTPHandler
);

customerRouter.post(
  '/verify-otp',
  authLimiter,
  validate(V.customerVerifyOTP),
  customerCtrl.verifyOTPHandler
);

customerRouter.post(
  '/firebase-login',
  authLimiter,
  validate(V.customerFirebaseLogin),
  customerCtrl.firebaseLoginHandler
);

// Protected (customer must be logged in)
customerRouter.post(
  '/complete-profile',
  authenticate,
  authorize('customer'),
  validate(V.customerCompleteProfile),
  customerCtrl.completeProfile
);

customerRouter.get(
  '/me',
  authenticate,
  authorize('customer'),
  customerCtrl.getProfile
);

customerRouter.post(
  '/address',
  authenticate,
  authorize('customer'),
  validate(V.customerAddAddress),
  customerCtrl.addAddress
);

customerRouter.get(
  '/addresses',
  authenticate,
  authorize('customer'),
  customerCtrl.getAddresses
);

customerRouter.put(
  '/address/:id',
  authenticate,
  authorize('customer'),
  validate(V.customerAddAddress),
  customerCtrl.updateAddress
);

customerRouter.delete(
  '/address/:id',
  authenticate,
  authorize('customer'),
  customerCtrl.deleteAddress
);

customerRouter.post(
  '/refresh',
  validate(V.refreshToken),
  customerCtrl.refreshToken
);

customerRouter.post(
  '/logout',
  authenticate,
  customerCtrl.logout
);

// ═══════════════════════════════════════════════════════════════
// MERCHANT AUTH  —  /auth/merchant/*
// ═══════════════════════════════════════════════════════════════
const merchantRouter = express.Router();

// Public
merchantRouter.post(
  '/send-otp',
  otpLimiter,
  validate(V.merchantSendOTP),
  merchantCtrl.sendOTPHandler
);

merchantRouter.post(
  '/verify-otp',
  authLimiter,
  validate(V.merchantVerifyOTP),
  merchantCtrl.verifyOTPHandler
);

merchantRouter.post(
  '/register',
  authLimiter,
  validate(V.merchantRegister),
  merchantCtrl.register
);

merchantRouter.post(
  '/login',
  authLimiter,
  validate(V.merchantLogin),
  merchantCtrl.login
);

merchantRouter.post(
  '/refresh',
  validate(V.refreshToken),
  merchantCtrl.refreshToken
);

// Protected (merchant must be logged in)
merchantRouter.get(
  '/me',
  authenticate,
  authorize('merchant'),
  merchantCtrl.getProfile
);

merchantRouter.put(
  '/hours',
  authenticate,
  authorize('merchant'),
  validate(V.merchantOperatingHours),
  merchantCtrl.updateOperatingHours
);

merchantRouter.post(
  '/kyc',
  authenticate,
  authorize('merchant'),
  uploadLimiter,
  uploadKYCDocument,    // Cloudinary multer middleware
  validate(V.merchantKYCSubmit),
  merchantCtrl.submitKYC
);

merchantRouter.get(
  '/kyc/status',
  authenticate,
  authorize('merchant'),
  merchantCtrl.getKYCStatus
);

merchantRouter.patch(
  '/toggle-open',
  authenticate,
  authorize('merchant'),
  merchantCtrl.toggleOpen
);

merchantRouter.patch(
  '/settings',
  authenticate,
  authorize('merchant'),
  merchantCtrl.updateSettings
);

merchantRouter.post(
  '/logo',
  authenticate,
  authorize('merchant'),
  uploadLimiter,
  uploadMerchantLogo,
  merchantCtrl.uploadLogo
);

merchantRouter.get(
  '/bank',
  authenticate,
  authorize('merchant'),
  merchantCtrl.getBankDetails
);

merchantRouter.post(
  '/bank',
  authenticate,
  authorize('merchant'),
  merchantCtrl.saveBankDetails
);

merchantRouter.post(
  '/logout',
  authenticate,
  merchantCtrl.logout
);

// ═══════════════════════════════════════════════════════════════
// ADMIN AUTH  —  /auth/admin/*
// ═══════════════════════════════════════════════════════════════
const adminRouter = express.Router();

// Step 1: Email + Password (IP restricted in production)
adminRouter.post(
  '/login',
  restrictToAdminIPs,
  adminLimiter,
  validate(V.adminLogin),
  adminCtrl.login
);

// Step 2: Submit 2FA OTP
adminRouter.post(
  '/verify-2fa',
  restrictToAdminIPs,
  adminLimiter,
  validate(V.adminVerify2FA),
  adminCtrl.verify2FA
);

adminRouter.post(
  '/refresh',
  restrictToAdminIPs,
  validate(V.refreshToken),
  adminCtrl.refreshToken
);

// Protected (admin must be logged in)
adminRouter.get(
  '/me',
  restrictToAdminIPs,
  authenticate,
  authorize('admin'),
  adminCtrl.getProfile
);

adminRouter.post(
  '/create',
  restrictToAdminIPs,
  adminLimiter,
  authenticate,
  authorize('admin'),
  validate(V.adminCreate),
  adminCtrl.createAdmin
);

adminRouter.put(
  '/change-password',
  restrictToAdminIPs,
  authenticate,
  authorize('admin'),
  validate(V.adminChangePassword),
  adminCtrl.changePassword
);

adminRouter.get(
  '/sessions',
  restrictToAdminIPs,
  authenticate,
  authorize('admin'),
  adminCtrl.getSessions
);

adminRouter.get(
  '/audit-logs',
  restrictToAdminIPs,
  authenticate,
  authorize('admin'),
  adminCtrl.getAuditLogs
);

adminRouter.post(
  '/logout',
  restrictToAdminIPs,
  authenticate,
  authorize('admin'),
  adminCtrl.logout
);

// ── Mount sub-routers ──────────────────────────────────────────
router.use('/customer', customerRouter);
router.use('/merchant', merchantRouter);
router.use('/admin',    adminRouter);

module.exports = router;
