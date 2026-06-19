// src/config/razorpay.js
// ─────────────────────────────────────────────────────────────
// Razorpay Configuration — MyLocalBazaar.store
// Handles: Order creation, payment verification, refunds,
//          webhook signature validation, merchant settlements
// ─────────────────────────────────────────────────────────────

const Razorpay = require('razorpay');
const crypto  = require('crypto');
const logger  = require('./logger');

const isProduction = process.env.NODE_ENV === 'production';

const razorpay = new Razorpay({
  key_id:     isProduction ? process.env.RAZORPAY_KEY_ID     : process.env.RAZORPAY_TEST_KEY_ID,
  key_secret: isProduction ? process.env.RAZORPAY_KEY_SECRET : process.env.RAZORPAY_TEST_KEY_SECRET,
});

// ── Normalise Razorpay SDK errors ─────────────────────────────
// The Razorpay SDK v2 throws a plain object { statusCode, error }
// (not an Error instance), so err.message is always undefined and
// the global error handler falls back to "Internal server error"
// while leaking the upstream 401 status to the client.
// This wrapper converts every Razorpay error into a proper Error
// with a meaningful message and a safe HTTP status code.
function normaliseRazorpayError(err, context) {
  const rzpCode  = err?.error?.code        || 'RAZORPAY_ERROR';
  const rzpDesc  = err?.error?.description || err?.message || 'Payment gateway error';
  const httpCode = err?.statusCode;

  logger.error(`Razorpay ${context} failed`, { rzpCode, description: rzpDesc, httpCode });

  const isAuthFailure = httpCode === 401 || httpCode === 403;
  const outErr = new Error(
    isAuthFailure
      ? 'Payment gateway is not configured. Please contact support.'
      : `Payment gateway error: ${rzpDesc}`
  );
  outErr.statusCode = isAuthFailure ? 503 : (httpCode || 502);
  outErr.code       = rzpCode;
  throw outErr;
}

// ── Create Razorpay Order ──────────────────────────────────────
const createRazorpayOrder = async ({ amount, currency = 'INR', receipt, notes = {} }) => {
  try {
    const order = await razorpay.orders.create({
      amount:   Math.round(amount * 100),  // Razorpay expects paise
      currency,
      receipt:  receipt.substring(0, 40),  // Max 40 chars
      notes,
    });
    logger.info('Razorpay order created', { orderId: order.id, amount });
    return order;
  } catch (err) {
    normaliseRazorpayError(err, 'order creation');
  }
};

// ── Verify Payment Signature ───────────────────────────────────
// Called after customer completes payment on frontend
const verifyPaymentSignature = ({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) => {
  const secret = isProduction ? process.env.RAZORPAY_KEY_SECRET : process.env.RAZORPAY_TEST_KEY_SECRET;
  const body   = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  const isValid = expectedSignature === razorpaySignature;
  if (!isValid) logger.warn('Razorpay signature verification FAILED', { razorpayOrderId });
  return isValid;
};

// ── Verify Webhook Signature ───────────────────────────────────
// Called for Razorpay webhook events
const verifyWebhookSignature = (rawBody, signature) => {
  if (!rawBody || !signature || !process.env.RAZORPAY_WEBHOOK_SECRET) return false;

  const payload = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody));

  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(signature);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
};

// ── Initiate Refund ───────────────────────────────────────────
const initiateRefund = async ({ paymentId, amount, notes = {} }) => {
  try {
    const refund = await razorpay.payments.refund(paymentId, {
      amount: Math.round(amount * 100), // paise
      notes,
    });
    logger.info('Razorpay refund initiated', { paymentId, refundId: refund.id, amount });
    return refund;
  } catch (err) {
    normaliseRazorpayError(err, 'refund');
  }
};

// ── Fetch Payment Details ─────────────────────────────────────
const fetchPayment = async (paymentId) => {
  try {
    return await razorpay.payments.fetch(paymentId);
  } catch (err) {
    normaliseRazorpayError(err, 'fetch payment');
  }
};

module.exports = {
  razorpay,
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  initiateRefund,
  fetchPayment,
};
