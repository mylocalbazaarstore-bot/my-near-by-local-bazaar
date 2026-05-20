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
    logger.error('Razorpay order creation failed', { message: err.message });
    throw err;
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
const verifyWebhookSignature = (body, signature) => {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(JSON.stringify(body))
    .digest('hex');
  return expectedSignature === signature;
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
    logger.error('Razorpay refund failed', { paymentId, message: err.message });
    throw err;
  }
};

// ── Fetch Payment Details ─────────────────────────────────────
const fetchPayment = async (paymentId) => {
  try {
    return await razorpay.payments.fetch(paymentId);
  } catch (err) {
    logger.error('Razorpay fetch payment failed', { paymentId, message: err.message });
    throw err;
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
