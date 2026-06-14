// src/routes/profile.routes.js
// ─────────────────────────────────────────────────────────────
// Customer Profile Routes — MyLocalBazaar.store
// Base: /api/v1/profile
// All routes: authenticate + authorize('customer')
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();

const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { validate }                = require('../middlewares/validate.middleware');
const customerCtrl                = require('../controllers/auth/customer.auth.controller');
const V                            = require('../validators/auth.validator');

router.use(authenticate, authorize('customer'));

router.get('/',   customerCtrl.getProfile);
router.patch('/', validate(V.customerUpdateProfile), customerCtrl.updateProfile);

module.exports = router;
