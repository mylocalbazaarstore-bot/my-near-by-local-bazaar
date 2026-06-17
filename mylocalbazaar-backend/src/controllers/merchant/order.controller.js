// src/controllers/merchant/order.controller.js
// ─────────────────────────────────────────────────────────────
// Merchant Order Controller — MyLocalBazaar.store
//
// ★ Implements the Double-Approval flow (merchant side) ★
//
// ENDPOINTS:
//   GET   /merchant/orders                → All merchant orders
//   GET   /merchant/orders/pending        → Orders needing approval
//   GET   /merchant/orders/:id            → Full order detail
//   POST  /merchant/orders/:id/action     → approve | reject
//   PATCH /merchant/orders/:id/status     → packed | out_for_delivery | delivered
//   GET   /merchant/orders/returns        → Return requests
//   PATCH /merchant/orders/returns/:rid   → Approve/reject return
// ─────────────────────────────────────────────────────────────

const OrderService = require('../../services/order.service');
const { query, queryPaginated } = require('../../config/db');
const { success, notFound, badRequest, paginated } = require('../../utils/response');
const logger = require('../../config/logger');

// ── GET /merchant/orders ──────────────────────────────────────
const listOrders = async (req, res) => {
  const merchantId = req.user.id;
  const {
    page = 1, limit = 20, status,
    from_date, to_date, sort_by = 'created_at', sort_order = 'desc',
  } = req.query;

  const params  = [merchantId];
  const clauses = ['o.merchant_id = $1'];

  if (status)    { params.push(status);    clauses.push(`o.order_status = $${params.length}`); }
  if (from_date) { params.push(from_date); clauses.push(`o.created_at >= $${params.length}`); }
  if (to_date)   { params.push(to_date);   clauses.push(`o.created_at <= $${params.length}`); }

  const sortCols  = { created_at: 'o.created_at', total_amount: 'o.total_amount' };
  const safeSort  = sortCols[sort_by] || 'o.created_at';
  const safeOrder = sort_order === 'asc' ? 'ASC' : 'DESC';

  const result = await queryPaginated(
    `SELECT
       o.id, o.order_number, o.order_status, o.payment_status, o.payment_method,
       o.total_amount, o.subtotal, o.delivery_charge, o.discount_amount,
       o.created_at, o.payment_processed_at, o.merchant_action_at,
       o.delivered_at, o.merchant_rejection_reason, o.delivery_otp,
       o.payment_utr, o.payment_screenshot_url,
       o.delivery_address->>'full_name'     AS customer_name,
       o.delivery_address->>'phone'         AS customer_phone,
       o.delivery_address->>'address_line1' AS delivery_preview,
       o.delivery_address->>'pincode'       AS delivery_pincode,
       EXTRACT(EPOCH FROM (NOW() - o.payment_processed_at)) / 60 AS minutes_since_payment,
       (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id)::int AS item_count
     FROM orders o
     WHERE ${clauses.join(' AND ')}
     ORDER BY
       CASE WHEN o.order_status = 'payment_processed' THEN 0 ELSE 1 END,
       ${safeSort} ${safeOrder}`,
    params,
    { page, limit }
  );

  return paginated(res, result, 'Orders fetched');
};

// ── GET /merchant/orders/pending ──────────────────────────────
// Orders in payment_processed — need merchant approval immediately
const getPending = async (req, res) => {
  const { rows } = await query(
    `SELECT
       o.id, o.order_number, o.total_amount, o.payment_method,
       o.created_at, o.payment_processed_at,
       o.delivery_address->>'full_name' AS customer_name,
       o.delivery_address->>'phone'     AS customer_phone,
       ROUND(EXTRACT(EPOCH FROM (NOW() - o.payment_processed_at)) / 60) AS minutes_waiting,
       json_agg(json_build_object(
         'name',  oi.product_name,
         'qty',   oi.quantity,
         'price', oi.unit_price,
         'total', oi.line_total
       ) ORDER BY oi.created_at) AS items
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.merchant_id = $1 AND o.order_status = 'payment_processed'
     GROUP BY o.id
     ORDER BY o.payment_processed_at ASC`,
    [req.user.id]
  );

  return success(res, {
    orders: rows,
    count:  rows.length,
    alert:  rows.length > 0
      ? `You have ${rows.length} order(s) waiting for your approval!`
      : null,
  }, 'Pending approvals');
};

// ── GET /merchant/orders/:id ──────────────────────────────────
const getOrder = async (req, res) => {
  const { rows } = await query(
    `SELECT o.*,
            u.full_name AS customer_name, u.phone AS customer_phone, u.email AS customer_email
     FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.id = $1 AND o.merchant_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!rows[0]) return notFound(res, 'Order not found');

  const order = rows[0];

  const [items, statusLogs] = await Promise.all([
    query(
      `SELECT oi.*,
              (SELECT image_url FROM product_images pi WHERE pi.product_id = oi.product_id AND pi.is_primary LIMIT 1) AS image
       FROM order_items oi WHERE oi.order_id = $1`,
      [req.params.id]
    ),
    query(
      `SELECT from_status, to_status, changed_by_role, note, created_at
       FROM order_status_logs WHERE order_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    ),
  ]);

  return success(res, {
    order: {
      ...order,
      items:           items.rows,
      status_timeline: statusLogs.rows,
    },
  });
};

// ── POST /merchant/orders/:id/action ─────────────────────────
// ★ DOUBLE-APPROVAL STEP: approve or reject ★
// Body: { action: 'approve'|'reject', rejection_reason?, estimated_delivery_minutes? }
const orderAction = async (req, res) => {
  const result = await OrderService.merchantAction(
    req.user.id,
    req.params.id,
    req.body
  );

  const message = req.body.action === 'approve'
    ? '✅ Order approved! Customer has been notified.'
    : '❌ Order rejected. Refund will be processed automatically.';

  return success(res, result, message);
};

// ── PATCH /merchant/orders/:id/status ─────────────────────────
// Updates order through lifecycle: accepted → packed → out_for_delivery → delivered
// Body: { status: 'packed'|'out_for_delivery'|'delivered', note? }
const updateStatus = async (req, res) => {
  const result = await OrderService.merchantUpdateStatus(
    req.user.id,
    req.params.id,
    req.body
  );

  const statusMessages = {
    accepted:         'Order marked as accepted',
    packed:           'Order marked as packed. Ready for pickup!',
    out_for_delivery: `Order out for delivery. Delivery OTP: ${result.delivery_otp}`,
    delivered:        '✅ Order delivered! Payment settled to your wallet.',
  };

  return success(res, result, statusMessages[req.body.status]);
};

// ── GET /merchant/orders/returns ──────────────────────────────
const getReturnRequests = async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const params  = [req.user.id];
  const clauses = ['rr.merchant_id = $1'];

  if (status) { params.push(status); clauses.push(`rr.status = $${params.length}`); }

  const result = await queryPaginated(
    `SELECT
       rr.id, rr.reason, rr.return_items, rr.status, rr.refund_amount,
       rr.created_at, rr.resolved_at, rr.merchant_response,
       o.order_number, o.total_amount,
       u.full_name AS customer_name, u.phone AS customer_phone
     FROM return_requests rr
     JOIN orders o ON o.id = rr.order_id
     JOIN users u  ON u.id = rr.user_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY rr.created_at DESC`,
    params,
    { page, limit }
  );

  return paginated(res, result, 'Return requests fetched');
};

// ── PATCH /merchant/orders/returns/:rid ───────────────────────
// Merchant approves or rejects a return
const respondToReturn = async (req, res) => {
  const { rid } = req.params;
  const { action, merchant_response, refund_amount } = req.body;

  if (!['approve', 'reject'].includes(action)) {
    return badRequest(res, 'Action must be approve or reject');
  }

  const { rows } = await query(
    `SELECT rr.*, o.user_id, o.payment_method, o.merchant_id
     FROM return_requests rr
     JOIN orders o ON o.id = rr.order_id
     WHERE rr.id = $1 AND rr.merchant_id = $2 AND rr.status = 'pending'`,
    [rid, req.user.id]
  );

  const returnReq = rows[0];
  if (!returnReq) return notFound(res, 'Return request not found or already resolved');

  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  await query(
    `UPDATE return_requests
     SET status            = $1,
         merchant_response = $2,
         refund_amount     = $3,
         resolved_at       = NOW()
     WHERE id = $4`,
    [newStatus, merchant_response || null, refund_amount || null, rid]
  );

  // Update order status
  await query(
    `UPDATE orders
     SET order_status = $1, updated_at = NOW()
     WHERE id = $2`,
    [action === 'approve' ? 'return_approved' : 'return_rejected', returnReq.order_id]
  );

  // Trigger refund if approved
  if (action === 'approve' && refund_amount) {
    const { rows: payRows } = await query(
      `SELECT razorpay_payment_id FROM payments WHERE order_id = $1 AND payment_status = 'captured'`,
      [returnReq.order_id]
    );
    if (payRows[0]?.razorpay_payment_id) {
      try {
        const { initiateRefund } = require('../../config/razorpay');
        await initiateRefund({
          paymentId: payRows[0].razorpay_payment_id,
          amount:    parseFloat(refund_amount),
          notes:     { return_request_id: rid },
        });
        await query(
          `UPDATE orders SET order_status = 'refund_initiated' WHERE id = $1`,
          [returnReq.order_id]
        );
      } catch (err) {
        logger.error('Return refund failed:', { returnId: rid, error: err.message });
      }
    }
  }

  return success(res, { status: newStatus },
    action === 'approve'
      ? 'Return approved. Refund initiated for customer.'
      : 'Return request rejected.'
  );
};

module.exports = {
  listOrders, getPending, getOrder,
  orderAction, updateStatus,
  getReturnRequests, respondToReturn,
};
