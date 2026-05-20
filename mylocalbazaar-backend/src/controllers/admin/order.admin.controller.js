// src/controllers/admin/order.admin.controller.js
// ─────────────────────────────────────────────────────────────
// Admin Order Governance — MyLocalBazaar.store
// ENDPOINTS:
//   GET   /admin/orders                → All orders, advanced filters
//   GET   /admin/orders/:id            → Full order detail
//   POST  /admin/orders/:id/override   → Override merchant decision
//   POST  /admin/orders/:id/refund     → Initiate manual refund
//   GET   /admin/orders/returns        → All pending return requests
//   PATCH /admin/orders/returns/:rid   → Approve/reject return (admin level)
// ─────────────────────────────────────────────────────────────

const { query, queryPaginated } = require('../../config/db');
const OrderService              = require('../../services/order.service');
const { initiateRefund }        = require('../../config/razorpay');
const { success, notFound, badRequest, paginated } = require('../../utils/response');
const logger = require('../../config/logger');

const audit = async (adminId, action, entityId, old_, new_, ip) =>
  query(`INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, old_values, new_values, ip_address)
         VALUES ($1,$2,'orders',$3,$4,$5,$6)`,
        [adminId, action, entityId, JSON.stringify(old_), JSON.stringify(new_), ip]);

// ── GET /admin/orders ──────────────────────────────────────────
const listOrders = async (req, res) => {
  const { page=1, limit=20, status, merchant_id, user_id, payment_method, from_date, to_date, sort_by='created_at', sort_order='desc', search } = req.query;

  const params  = [];
  const clauses = [];

  if (status)         { params.push(status);         clauses.push(`o.order_status = $${params.length}`); }
  if (merchant_id)    { params.push(merchant_id);    clauses.push(`o.merchant_id = $${params.length}`); }
  if (user_id)        { params.push(user_id);        clauses.push(`o.user_id = $${params.length}`); }
  if (payment_method) { params.push(payment_method); clauses.push(`o.payment_method = $${params.length}`); }
  if (from_date)      { params.push(from_date);      clauses.push(`o.created_at >= $${params.length}`); }
  if (to_date)        { params.push(to_date);        clauses.push(`o.created_at <= $${params.length}`); }
  if (search)         { params.push(`%${search}%`);  clauses.push(`o.order_number ILIKE $${params.length}`); }

  const sortCols  = { created_at: 'o.created_at', total_amount: 'o.total_amount' };
  const safeSort  = sortCols[sort_by] || 'o.created_at';
  const safeOrder = sort_order === 'asc' ? 'ASC' : 'DESC';
  const where     = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const result = await queryPaginated(
    `SELECT o.id, o.order_number, o.order_status, o.payment_status, o.payment_method,
            o.total_amount, o.created_at, o.delivered_at,
            o.merchant_rejection_reason, o.admin_override_note,
            m.store_name, m.phone AS merchant_phone,
            u.full_name AS customer_name, u.phone AS customer_phone
     FROM orders o
     JOIN merchants m ON m.id = o.merchant_id
     JOIN users     u ON u.id = o.user_id
     ${where}
     ORDER BY ${safeSort} ${safeOrder}`,
    params, { page, limit }
  );

  return paginated(res, result, 'Orders fetched');
};

// ── GET /admin/orders/:id ─────────────────────────────────────
const getOrder = async (req, res) => {
  const { rows } = await query(
    `SELECT o.*, m.store_name, m.phone AS merchant_phone,
            u.full_name AS customer_name, u.phone AS customer_phone, u.email AS customer_email,
            p.razorpay_payment_id, p.razorpay_order_id, p.amount AS paid_amount, p.payment_status AS gateway_status
     FROM orders o
     JOIN merchants m ON m.id = o.merchant_id
     JOIN users     u ON u.id = o.user_id
     LEFT JOIN payments p ON p.order_id = o.id
     WHERE o.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return notFound(res, 'Order not found');

  const [items, logs] = await Promise.all([
    query('SELECT * FROM order_items WHERE order_id = $1', [req.params.id]),
    query('SELECT * FROM order_status_logs WHERE order_id = $1 ORDER BY created_at ASC', [req.params.id]),
  ]);

  return success(res, { order: { ...rows[0], items: items.rows, timeline: logs.rows } });
};

// ── POST /admin/orders/:id/override ──────────────────────────
const overrideOrder = async (req, res) => {
  const result = await OrderService.adminOverride(req.user.id, req.params.id, req.body);
  await audit(req.user.id, 'admin_order_override', req.params.id, {}, req.body, req.ip);
  logger.info('Admin order override', { orderId: req.params.id, adminId: req.user.id, ...req.body });
  return success(res, result, `Order status updated to ${req.body.target_status}`);
};

// ── POST /admin/orders/:id/refund ─────────────────────────────
const initiateManualRefund = async (req, res) => {
  const { amount, reason } = req.body;
  const orderId = req.params.id;

  const { rows } = await query(
    `SELECT o.*, p.razorpay_payment_id
     FROM orders o LEFT JOIN payments p ON p.order_id = o.id AND p.payment_status = 'captured'
     WHERE o.id = $1`,
    [orderId]
  );
  if (!rows[0]) return notFound(res, 'Order not found');

  const order = rows[0];
  if (!order.razorpay_payment_id) {
    return badRequest(res, 'No captured Razorpay payment found for this order. Refund may need to be handled manually.');
  }

  const refund = await initiateRefund({
    paymentId: order.razorpay_payment_id,
    amount:    parseFloat(amount),
    notes:     { order_id: orderId, reason, admin_id: req.user.id },
  });

  await query(
    `UPDATE orders SET order_status = 'refund_initiated', updated_at = NOW() WHERE id = $1`,
    [orderId]
  );
  await audit(req.user.id, 'admin_manual_refund', orderId, {}, { amount, reason, refund_id: refund.id }, req.ip);

  return success(res, {
    refund_id:     refund.id,
    amount:        amount,
    order_id:      orderId,
    order_status:  'refund_initiated',
  }, `Refund of ₹${amount} initiated successfully`);
};

// ── GET /admin/orders/returns ─────────────────────────────────
const getReturnRequests = async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const params  = [];
  const clauses = [];
  if (status) { params.push(status); clauses.push(`rr.status = $${params.length}`); }

  const result = await queryPaginated(
    `SELECT rr.id, rr.reason, rr.status, rr.refund_amount, rr.created_at, rr.resolved_at,
            o.order_number, o.total_amount,
            m.store_name,
            u.full_name AS customer_name, u.phone AS customer_phone
     FROM return_requests rr
     JOIN orders   o ON o.id = rr.order_id
     JOIN merchants m ON m.id = rr.merchant_id
     JOIN users    u ON u.id = rr.user_id
     ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''}
     ORDER BY rr.created_at DESC`,
    params, { page, limit }
  );

  return paginated(res, result, 'Return requests');
};

// ── PATCH /admin/orders/returns/:rid ─────────────────────────
const resolveReturn = async (req, res) => {
  const { rid }                  = req.params;
  const { action, refund_amount, admin_response } = req.body;

  if (!['approve','reject'].includes(action)) return badRequest(res, 'Action must be approve or reject');

  const { rows } = await query(
    `SELECT rr.*, o.user_id, o.payment_method FROM return_requests rr JOIN orders o ON o.id = rr.order_id WHERE rr.id = $1`,
    [rid]
  );
  if (!rows[0]) return notFound(res, 'Return request not found');

  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  await query(
    `UPDATE return_requests SET status = $1, admin_response = $2, refund_amount = $3, approved_by = $4, resolved_at = NOW() WHERE id = $5`,
    [newStatus, admin_response, refund_amount || null, req.user.id, rid]
  );

  await query(
    `UPDATE orders SET order_status = $1, updated_at = NOW() WHERE id = $2`,
    [action === 'approve' ? 'return_approved' : 'return_rejected', rows[0].order_id]
  );

  await audit(req.user.id, `return_${action}d`, rid, {}, { action, refund_amount }, req.ip);
  return success(res, { return_id: rid, status: newStatus }, `Return ${action}d successfully`);
};

module.exports = {
  listOrders, getOrder, overrideOrder, initiateManualRefund,
  getReturnRequests, resolveReturn,
};
