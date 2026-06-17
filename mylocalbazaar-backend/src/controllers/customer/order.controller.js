// src/controllers/customer/order.controller.js
// ─────────────────────────────────────────────────────────────
// Customer Order Controller — MyLocalBazaar.store
//
// ENDPOINTS:
//   POST  /orders              → Place order (creates payment intent)
//   POST  /orders/verify       → Verify Razorpay payment → payment_processed
//   GET   /orders              → List customer's orders (paginated)
//   GET   /orders/:id          → Full order detail with timeline
//   POST  /orders/:id/return   → Raise return request
//   POST  /orders/:id/cancel   → Cancel (only payment_pending state)
// ─────────────────────────────────────────────────────────────

const OrderService = require('../../services/order.service');
const { success, created, badRequest, notFound, paginated } = require('../../utils/response');
const { query } = require('../../config/db');
const { validate } = require('../../middlewares/validate.middleware');

// ── POST /orders ──────────────────────────────────────────────
// Body: { address_id, payment_method, coupon_code?, notes?, use_wallet?, payment_utr?, payment_screenshot_url? }
const placeOrder = async (req, res) => {
  const result = await OrderService.place(req.user.id, req.body);

  const instantMethods = ['cod', 'wallet', 'upi_direct'];
  const statusCode = instantMethods.includes(req.body.payment_method) ? 201 : 200;

  return res.status(statusCode).json({
    success: true,
    message: result.message,
    data:    result,
  });
};

// ── POST /orders/upload-proof ────────────────────────────────
// Upload a UPI payment screenshot to Cloudinary before order creation.
// Returns { url } — the Cloudinary URL to include in payment_screenshot_url.
const uploadPaymentProof = async (req, res) => {
  if (!req.file) return badRequest(res, 'No screenshot file uploaded');
  return success(res, { url: req.file.path }, 'Screenshot uploaded');
};

// ── POST /orders/verify ───────────────────────────────────────
// Called by frontend AFTER Razorpay checkout completes
// Body: { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }
const verifyPayment = async (req, res) => {
  const result = await OrderService.verifyPayment(req.user.id, req.body);
  return success(res, result, result.message);
};

// ── GET /orders ───────────────────────────────────────────────
const listOrders = async (req, res) => {
  const { page, limit, status, from_date, to_date, sort_by, sort_order } = req.query;
  const result = await OrderService.listForCustomer(
    req.user.id,
    { status, from_date, to_date, sort_by, sort_order },
    { page, limit }
  );
  return paginated(res, result, 'Orders fetched');
};

// ── GET /orders/:id ───────────────────────────────────────────
const getOrder = async (req, res) => {
  const order = await OrderService.getForCustomer(req.user.id, req.params.id);
  return success(res, { order });
};

// ── POST /orders/:id/return ───────────────────────────────────
const raiseReturn = async (req, res) => {
  const result = await OrderService.raiseReturn(req.user.id, req.params.id, req.body);
  return created(res, result, result.message);
};

// ── POST /orders/:id/cancel ───────────────────────────────────
// Customer can only cancel payment_pending orders (before Razorpay payment)
const cancelOrder = async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user.id]
  );

  const order = rows[0];
  if (!order) return notFound(res, 'Order not found');

  if (order.order_status !== 'payment_pending') {
    return badRequest(
      res,
      'Only orders awaiting payment can be cancelled. For other cancellations, contact support.'
    );
  }

  await query(
    `UPDATE orders
     SET order_status = 'cancelled', cancellation_reason = $1,
         cancelled_by = 'customer', updated_at = NOW()
     WHERE id = $2`,
    [req.body.reason || 'Customer cancelled', req.params.id]
  );

  await query(
    `INSERT INTO order_status_logs (order_id, from_status, to_status, changed_by_role, changed_by_id, note)
     VALUES ($1, 'payment_pending', 'cancelled', 'customer', $2, $3)`,
    [req.params.id, req.user.id, 'Customer cancelled order before payment']
  );

  return success(res, null, 'Order cancelled successfully');
};

module.exports = { placeOrder, uploadPaymentProof, verifyPayment, listOrders, getOrder, raiseReturn, cancelOrder };
