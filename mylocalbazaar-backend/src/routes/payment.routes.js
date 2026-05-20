// src/routes/payment.routes.js
// ─────────────────────────────────────────────────────────────
// Payment Routes — MyLocalBazaar.store
// Base: /api/v1/payments
//
// ⚠️ CRITICAL: Razorpay webhook MUST receive the raw body
//    to verify HMAC signature. The webhook route is mounted
//    BEFORE express.json() in app.js using express.raw()
// ─────────────────────────────────────────────────────────────

const express      = require('express');
const router       = express.Router();
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { query }                   = require('../config/db');
const { success }                 = require('../utils/response');
const { razorpayWebhook }         = require('../controllers/payment/razorpay.controller');

// ── POST /payments/webhook/razorpay ───────────────────────────
// MUST use express.raw() — registered specially in app.js
// body is raw Buffer here, parsed JSON inside controller
router.post('/webhook/razorpay', razorpayWebhook);

// ── GET /payments/history ────────────────────────────────────
// Customer: own payment history
router.get('/history',
  authenticate,
  authorize('customer'),
  async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows } = await query(
      `SELECT p.id, p.amount, p.currency, p.payment_method, p.payment_status,
              p.razorpay_payment_id, p.captured_at, p.refunded_at, p.refund_amount,
              o.order_number, o.total_amount AS order_total
       FROM payments p
       LEFT JOIN orders o ON o.id = p.order_id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, parseInt(limit), offset]
    );

    return success(res, { payments: rows });
  }
);

// ── GET /payments/razorpay-key ────────────────────────────────
// Returns the correct Razorpay key_id for the frontend to use
router.get('/razorpay-key', (req, res) => {
  const key = process.env.NODE_ENV === 'production'
    ? process.env.RAZORPAY_KEY_ID
    : process.env.RAZORPAY_TEST_KEY_ID;
  return success(res, { key_id: key });
});

module.exports = router;
