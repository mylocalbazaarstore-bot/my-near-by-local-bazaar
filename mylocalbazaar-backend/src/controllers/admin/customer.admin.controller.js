// src/controllers/admin/customer.admin.controller.js
// ─────────────────────────────────────────────────────────────
// Admin Customer Management — MyLocalBazaar.store
//
// ENDPOINTS:
//   GET    /admin/customers               → List + search
//   GET    /admin/customers/:id           → Full profile + order history
//   POST   /admin/customers/:id/block     → Block with reason
//   POST   /admin/customers/:id/unblock   → Unblock
//   GET    /admin/customers/:id/orders    → Customer order history
//   PATCH  /admin/customers/:id/wallet    → Manual wallet credit/debit
// ─────────────────────────────────────────────────────────────

const { query, queryPaginated, withTransaction } = require('../../config/db');
const { success, notFound, badRequest, paginated } = require('../../utils/response');
const logger = require('../../config/logger');

const audit = async (adminId, action, entityId, oldVals, newVals, ip) => {
  await query(
    `INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, old_values, new_values, ip_address)
     VALUES ($1, $2, 'users', $3, $4, $5, $6)`,
    [adminId, action, entityId, JSON.stringify(oldVals), JSON.stringify(newVals), ip]
  );
};

// ── GET /admin/customers ───────────────────────────────────────
const listCustomers = async (req, res) => {
  const { page = 1, limit = 20, search, is_blocked, sort_by = 'created_at', sort_order = 'desc', from_date, to_date } = req.query;

  const params  = [];
  const clauses = [];

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    clauses.push(`(LOWER(u.full_name) LIKE $${params.length} OR u.phone LIKE $${params.length} OR LOWER(u.email) LIKE $${params.length})`);
  }
  if (is_blocked !== undefined) {
    params.push(is_blocked === 'true');
    clauses.push(`u.is_blocked = $${params.length}`);
  }
  if (from_date) { params.push(from_date); clauses.push(`u.created_at >= $${params.length}`); }
  if (to_date)   { params.push(to_date);   clauses.push(`u.created_at <= $${params.length}`); }

  const sortCols  = { created_at: 'u.created_at', full_name: 'u.full_name', wallet_balance: 'u.wallet_balance' };
  const safeSort  = sortCols[sort_by] || 'u.created_at';
  const safeOrder = sort_order === 'asc' ? 'ASC' : 'DESC';
  const where     = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const result = await queryPaginated(
    `SELECT
       u.id, u.full_name, u.phone, u.email, u.gender,
       u.wallet_balance, u.referral_code,
       u.is_phone_verified, u.is_blocked, u.is_active,
       u.last_login_at, u.created_at,
       (SELECT COUNT(*) FROM orders WHERE user_id = u.id)::int AS total_orders,
       (SELECT COUNT(*) FROM orders WHERE user_id = u.id AND order_status = 'delivered')::int AS completed_orders,
       (SELECT SUM(total_amount) FROM orders WHERE user_id = u.id AND order_status = 'delivered') AS lifetime_value
     FROM users u
     ${where}
     ORDER BY ${safeSort} ${safeOrder}`,
    params, { page, limit }
  );

  return paginated(res, result, 'Customers fetched');
};

// ── GET /admin/customers/:id ──────────────────────────────────
const getCustomer = async (req, res) => {
  const { rows } = await query(
    `SELECT u.*,
            w.balance AS wallet_balance_live, w.total_credited, w.total_debited,
            (SELECT COUNT(*) FROM orders WHERE user_id = u.id)::int AS total_orders,
            (SELECT COUNT(*) FROM complaint_tickets WHERE user_id = u.id)::int AS total_complaints,
            (SELECT COUNT(*) FROM reviews WHERE user_id = u.id)::int AS total_reviews
     FROM users u
     LEFT JOIN wallets w ON w.owner_id = u.id AND w.owner_type = 'customer'
     WHERE u.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return notFound(res, 'Customer not found');

  const { rows: addresses } = await query(
    'SELECT * FROM user_addresses WHERE user_id = $1 ORDER BY is_default DESC',
    [req.params.id]
  );

  const { password_hash, ...safeCustomer } = rows[0];
  return success(res, { customer: { ...safeCustomer, addresses } });
};

// ── POST /admin/customers/:id/block ──────────────────────────
const blockCustomer = async (req, res) => {
  const { id }    = req.params;
  const { reason } = req.body;
  const adminId   = req.user.id;

  const { rows } = await query('SELECT full_name, is_blocked FROM users WHERE id = $1', [id]);
  if (!rows[0]) return notFound(res, 'Customer not found');
  if (rows[0].is_blocked) return badRequest(res, 'Customer is already blocked');

  await query('UPDATE users SET is_blocked = true, updated_at = NOW() WHERE id = $1', [id]);
  await audit(adminId, 'blocked_customer', id, { is_blocked: false }, { is_blocked: true, reason }, req.ip);

  await query(
    `INSERT INTO notifications (recipient_id, recipient_type, notification_type, title, body, data)
     VALUES ($1, 'customer', 'system', 'Account Suspended', $2, $3)`,
    [id, `Your account has been suspended. Reason: ${reason}`, JSON.stringify({ reason })]
  );

  logger.info('Customer blocked', { customerId: id, adminId, reason });
  return success(res, null, `Customer "${rows[0].full_name}" has been blocked`);
};

// ── POST /admin/customers/:id/unblock ─────────────────────────
const unblockCustomer = async (req, res) => {
  const { id } = req.params;
  const adminId = req.user.id;

  const { rows } = await query('SELECT full_name, is_blocked FROM users WHERE id = $1', [id]);
  if (!rows[0]) return notFound(res, 'Customer not found');
  if (!rows[0].is_blocked) return badRequest(res, 'Customer is not blocked');

  await query('UPDATE users SET is_blocked = false, updated_at = NOW() WHERE id = $1', [id]);
  await audit(adminId, 'unblocked_customer', id, { is_blocked: true }, { is_blocked: false }, req.ip);

  logger.info('Customer unblocked', { customerId: id, adminId });
  return success(res, null, `Customer "${rows[0].full_name}" has been unblocked`);
};

// ── GET /admin/customers/:id/orders ──────────────────────────
const getCustomerOrders = async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const result = await queryPaginated(
    `SELECT o.id, o.order_number, o.order_status, o.payment_method,
            o.total_amount, o.created_at, o.delivered_at,
            m.store_name, m.store_slug
     FROM orders o JOIN merchants m ON m.id = o.merchant_id
     WHERE o.user_id = $1
     ORDER BY o.created_at DESC`,
    [req.params.id], { page, limit }
  );
  return paginated(res, result, 'Customer orders');
};

// ── PATCH /admin/customers/:id/wallet ─────────────────────────
const adjustWallet = async (req, res) => {
  const { id }                      = req.params;
  const { amount, type, description } = req.body; // type: 'credit' | 'debit'
  const adminId                     = req.user.id;

  if (!['credit', 'debit'].includes(type)) return badRequest(res, 'type must be credit or debit');
  if (!amount || amount <= 0) return badRequest(res, 'Amount must be positive');

  await withTransaction(async (client) => {
    if (type === 'credit') {
      await client.query(
        `UPDATE wallets SET balance = balance + $1, total_credited = total_credited + $1 WHERE owner_id = $2 AND owner_type = 'customer'`,
        [amount, id]
      );
    } else {
      const { rows } = await client.query(
        `SELECT balance FROM wallets WHERE owner_id = $1 AND owner_type = 'customer'`, [id]
      );
      if (!rows[0] || parseFloat(rows[0].balance) < amount) {
        throw Object.assign(new Error('Insufficient wallet balance'), { statusCode: 400 });
      }
      await client.query(
        `UPDATE wallets SET balance = balance - $1, total_debited = total_debited + $1 WHERE owner_id = $2 AND owner_type = 'customer'`,
        [amount, id]
      );
    }

    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, closing_balance, reference_type, description)
       SELECT w.id, $1, $2, w.balance, 'admin_adjustment', $3
       FROM wallets w WHERE w.owner_id = $4 AND w.owner_type = 'customer'`,
      [type, amount, description || `Admin ${type}`, id]
    );
  });

  await audit(adminId, `wallet_${type}`, id, {}, { amount, type, description }, req.ip);
  return success(res, null, `Wallet ${type} of ₹${amount} applied successfully`);
};

module.exports = {
  listCustomers, getCustomer, blockCustomer, unblockCustomer,
  getCustomerOrders, adjustWallet,
};
