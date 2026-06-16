// src/controllers/admin/merchant.admin.controller.js
// ─────────────────────────────────────────────────────────────
// Admin Merchant Management — MyLocalBazaar.store
//
// ENDPOINTS:
//   GET    /admin/merchants              → Paginated merchant list
//   GET    /admin/merchants/:id          → Full merchant profile
//   POST   /admin/merchants/:id/decision → approve|reject|suspend|disable|reactivate
//   GET    /admin/merchants/:id/kyc      → KYC documents
//   POST   /admin/merchants/:id/kyc      → verify|reject KYC
//   PATCH  /admin/merchants/:id/subscription → Update plan
//   GET    /admin/merchants/:id/orders   → Merchant order history
//   GET    /admin/merchants/:id/products → Merchant product list
//   GET    /admin/merchants/pending-kyc  → All KYC awaiting review
// ─────────────────────────────────────────────────────────────

const { query, queryPaginated, withTransaction } = require('../../config/db');
const { NotificationService } = require('../../services/notification.service');
const { success, created, notFound, paginated } = require('../../utils/response');
const logger = require('../../config/logger');

// Audit log helper
const audit = async (adminId, action, entityType, entityId, newValues, req) => {
  await query(
    `INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, new_values, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [adminId, action, entityType, entityId, JSON.stringify(newValues), req.ip, req.get('User-Agent')]
  );
};

// ── GET /admin/merchants ──────────────────────────────────────
const listMerchants = async (req, res) => {
  const {
    page = 1, limit = 20, search, status, kyc_status,
    store_category, pincode, subscription,
    sort_by = 'created_at', sort_order = 'desc',
  } = req.query;

  const params  = [];
  const clauses = [];

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    clauses.push(`(LOWER(m.store_name) LIKE $${params.length}
                   OR LOWER(m.owner_name) LIKE $${params.length}
                   OR m.phone LIKE $${params.length}
                   OR m.gstin LIKE $${params.length})`);
  }
  if (status)         { params.push(status);         clauses.push(`m.merchant_status = $${params.length}`); }
  if (kyc_status)     { params.push(kyc_status);     clauses.push(`m.kyc_status = $${params.length}`); }
  if (store_category) { params.push(store_category); clauses.push(`m.store_category = $${params.length}`); }
  if (pincode)        { params.push(pincode);         clauses.push(`m.pincode = $${params.length}`); }
  if (subscription)   { params.push(subscription);   clauses.push(`m.subscription_plan = $${params.length}`); }

  const where    = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const sortCols = { created_at: 'm.created_at', store_name: 'm.store_name', rating: 'm.rating' };
  const safeSort = sortCols[sort_by] || 'm.created_at';
  const safeOrd  = sort_order === 'asc' ? 'ASC' : 'DESC';

  const result = await queryPaginated(
    `SELECT
       m.id, m.owner_name, m.store_name, m.store_slug, m.store_category,
       m.phone, m.email, m.gstin, m.pan_number,
       m.pincode, m.area_id,
       m.merchant_status, m.kyc_status, m.subscription_plan,
       m.rating, m.total_reviews, m.is_featured, m.is_open,
       m.delivery_radius_km, m.min_order_value,
       m.last_login_at, m.created_at,
       (SELECT COUNT(*) FROM products WHERE merchant_id = m.id AND product_status = 'active')::int  AS active_products,
       (SELECT COUNT(*) FROM orders   WHERE merchant_id = m.id AND order_status = 'delivered')::int AS completed_orders,
       (SELECT COALESCE(SUM(balance), 0) FROM wallets WHERE owner_id = m.id AND owner_type = 'merchant') AS wallet_balance
     FROM merchants m
     ${where}
     ORDER BY ${safeSort} ${safeOrd}`,
    params, { page, limit }
  );

  return paginated(res, result, 'Merchants fetched');
};

// ── GET /admin/merchants/pending-kyc ─────────────────────────
const getPendingKYC = async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const result = await queryPaginated(
    `SELECT
       m.id, m.owner_name, m.store_name, m.store_category,
       m.phone, m.email, m.gstin, m.pan_number,
       m.kyc_status, m.merchant_status, m.created_at,
       k.submitted_at,
       k.gst_certificate_url, k.pan_card_url,
       k.aadhaar_front_url, k.aadhaar_back_url,
       k.shop_license_url, k.food_license_url
     FROM merchants m
     JOIN merchant_kyc k ON k.merchant_id = m.id
     WHERE m.kyc_status = 'submitted'
     ORDER BY k.submitted_at ASC`,
    [], { page, limit }
  );
  return paginated(res, result, 'Pending KYC reviews');
};

// ── GET /admin/merchants/:id ──────────────────────────────────
const getMerchant = async (req, res) => {
  const { rows } = await query(
    `SELECT m.*,
            k.gst_certificate_url, k.pan_card_url, k.aadhaar_front_url,
            k.aadhaar_back_url, k.shop_license_url, k.food_license_url,
            k.submitted_at AS kyc_submitted_at, k.verified_at AS kyc_verified_at,
            k.rejection_reason AS kyc_rejection_reason,
            b.account_holder_name, b.account_number, b.ifsc_code, b.bank_name,
            b.upi_id, b.is_verified AS bank_verified,
            w.balance AS wallet_balance, w.locked_balance, w.total_credited, w.total_debited,
            a.name AS area_name, a.pincode AS area_pincode
     FROM merchants m
     LEFT JOIN merchant_kyc          k ON k.merchant_id = m.id
     LEFT JOIN merchant_bank_details  b ON b.merchant_id = m.id
     LEFT JOIN wallets                w ON w.owner_id = m.id AND w.owner_type = 'merchant'
     LEFT JOIN areas                  a ON a.id = m.area_id
     WHERE m.id = $1`,
    [req.params.id]
  );

  if (!rows[0]) return notFound(res, 'Merchant not found');

  // Operating hours
  const { rows: hours } = await query(
    'SELECT * FROM merchant_operating_hours WHERE merchant_id = $1 ORDER BY day_of_week',
    [req.params.id]
  );

  const { password_hash, ...safeMerchant } = rows[0];
  return success(res, { merchant: { ...safeMerchant, operating_hours: hours } });
};

// ── POST /admin/merchants/:id/decision ────────────────────────
const merchantDecision = async (req, res) => {
  const { action, reason, notify_merchant = true } = req.body;
  const merchantId = req.params.id;
  const adminId    = req.user.id;

  const { rows: mRows } = await query(
    'SELECT * FROM merchants WHERE id = $1', [merchantId]
  );
  if (!mRows[0]) return notFound(res, 'Merchant not found');
  const merchant = mRows[0];

  const statusMap = {
    approve:    'active',
    reject:     'rejected',
    suspend:    'suspended',
    disable:    'disabled',
    reactivate: 'active',
  };

  const newStatus = statusMap[action];
  await query(
    `UPDATE merchants SET merchant_status = $1, updated_at = NOW() WHERE id = $2`,
    [newStatus, merchantId]
  );

  await audit(adminId, `merchant_${action}`, 'merchants', merchantId,
    { action, new_status: newStatus, reason }, req
  );

  // Send notifications
  if (notify_merchant) {
    if (action === 'approve') {
      NotificationService.sendMerchantApproved({
        email:     merchant.email, phone: merchant.phone,
        ownerName: merchant.owner_name, storeName:  merchant.store_name,
        storeSlug: merchant.store_slug,
      }).catch(err => logger.warn('Merchant approval email failed:', { message: err.message }));
    } else if (action === 'reject') {
      NotificationService.sendMerchantRejected({
        email:     merchant.email, phone: merchant.phone,
        ownerName: merchant.owner_name, storeName:  merchant.store_name,
        reason,
      }).catch(err => logger.warn('Merchant rejection email failed:', { message: err.message }));
    }

    // Always insert DB notification
    await query(
      `INSERT INTO notifications (recipient_id, recipient_type, notification_type, title, body, data)
       VALUES ($1, 'merchant', 'system', $2, $3, $4)`,
      [
        merchantId,
        `Account ${action === 'approve' ? 'Approved' : action.charAt(0).toUpperCase() + action.slice(1)}`,
        action === 'approve'
          ? 'Your store is now live on MyLocalBazaar!'
          : `Your account has been ${action}ed. Reason: ${reason || 'N/A'}`,
        JSON.stringify({ action, reason }),
      ]
    );
  }

  logger.info('Admin merchant decision', { adminId, merchantId, action, newStatus });
  return success(res, { merchant_id: merchantId, new_status: newStatus },
    `Merchant ${action}d successfully`
  );
};

// ── POST /admin/merchants/:id/kyc ─────────────────────────────
const kycDecision = async (req, res) => {
  const { action, rejection_reason } = req.body;
  const merchantId = req.params.id;
  const adminId    = req.user.id;

  const newKycStatus = action === 'verify' ? 'verified' : 'rejected';

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE merchant_kyc
       SET verified_by = $1, verified_at = NOW(), rejection_reason = $2
       WHERE merchant_id = $3`,
      [adminId, rejection_reason || null, merchantId]
    );

    await client.query(
      `UPDATE merchants
       SET kyc_status = $1,
           -- Auto-activate merchant when KYC verified and was pending
           merchant_status = CASE
             WHEN $1 = 'verified' AND merchant_status = 'pending' THEN 'active'
             ELSE merchant_status
           END,
           updated_at = NOW()
       WHERE id = $2`,
      [newKycStatus, merchantId]
    );
  });

  await audit(adminId, `kyc_${action}`, 'merchant_kyc', merchantId,
    { action: newKycStatus, rejection_reason }, req
  );

  // Notify merchant of KYC outcome
  const { rows } = await query(
    'SELECT owner_name, store_name, email, phone, store_slug FROM merchants WHERE id = $1',
    [merchantId]
  );

  if (rows[0]) {
    if (action === 'verify') {
      NotificationService.sendMerchantApproved({
        email:     rows[0].email,    phone:     rows[0].phone,
        ownerName: rows[0].owner_name, storeName: rows[0].store_name,
        storeSlug: rows[0].store_slug,
      }).catch(() => {});
    } else {
      NotificationService.sendMerchantRejected({
        email:     rows[0].email,    phone:     rows[0].phone,
        ownerName: rows[0].owner_name, storeName: rows[0].store_name,
        reason:    rejection_reason,
      }).catch(() => {});
    }
  }

  return success(res, { kyc_status: newKycStatus },
    `KYC ${action === 'verify' ? 'verified' : 'rejected'} successfully`
  );
};

// ── PATCH /admin/merchants/:id/subscription ───────────────────
const updateSubscription = async (req, res) => {
  const { plan, expires_at, note } = req.body;
  const merchantId = req.params.id;

  await query(
    `UPDATE merchants SET subscription_plan = $1, subscription_expires_at = $2, updated_at = NOW()
     WHERE id = $3`,
    [plan, expires_at, merchantId]
  );

  await query(
    `INSERT INTO merchant_subscriptions (merchant_id, plan, price, expires_at)
     VALUES ($1, $2, 0, $3)`,
    [merchantId, plan, expires_at]
  );

  await audit(req.user.id, 'subscription_update', 'merchants', merchantId,
    { plan, expires_at, note }, req
  );

  return success(res, { plan, expires_at }, 'Subscription updated');
};

// ── GET /admin/merchants/:id/orders ──────────────────────────
const getMerchantOrders = async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const params  = [req.params.id];
  const clauses = ['o.merchant_id = $1'];
  if (status) { params.push(status); clauses.push(`o.order_status = $${params.length}`); }

  const result = await queryPaginated(
    `SELECT o.id, o.order_number, o.order_status, o.payment_method,
            o.total_amount, o.created_at, o.delivered_at,
            u.full_name AS customer_name, u.phone AS customer_phone
     FROM orders o JOIN users u ON u.id = o.user_id
     WHERE ${clauses.join(' AND ')} ORDER BY o.created_at DESC`,
    params, { page, limit }
  );
  return paginated(res, result, 'Merchant orders');
};

// ── GET /admin/merchants/:id/products ─────────────────────────
const getMerchantProducts = async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const params  = [req.params.id];
  const clauses = ['p.merchant_id = $1'];
  if (status) { params.push(status); clauses.push(`p.product_status = $${params.length}`); }

  const result = await queryPaginated(
    `SELECT p.id, p.name, p.slug, p.mrp, p.retail_price, p.stock_quantity,
            p.product_status, p.is_featured, p.created_at,
            c.name AS category_name,
            (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary LIMIT 1) AS image
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${clauses.join(' AND ')} ORDER BY p.created_at DESC`,
    params, { page, limit }
  );
  return paginated(res, result, 'Merchant products');
};

// ── Route-name aliases expected by admin.routes.js ───────────

const approveMerchant = (req, res, next) => {
  req.body.action = 'approve';
  return merchantDecision(req, res, next);
};

const rejectMerchant = (req, res, next) => {
  req.body.action = 'reject';
  return merchantDecision(req, res, next);
};

const updateMerchantStatus = async (req, res) => {
  const { status, reason } = req.body;
  const actionMap = { active: 'reactivate', suspended: 'suspend', disabled: 'disable' };
  req.body.action = actionMap[status] || status;
  req.body.reason = reason;
  return merchantDecision(req, res, () => {});
};

const getMerchantKYC = async (req, res) => {
  const { rows } = await query(
    `SELECT
       k.*,
       m.owner_name, m.store_name, m.phone, m.kyc_status, m.merchant_status
     FROM merchant_kyc k
     JOIN merchants m ON m.id = k.merchant_id
     WHERE k.merchant_id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return notFound(res, 'KYC record not found');
  return success(res, { kyc: rows[0] });
};

const verifyKYC = (req, res, next) => {
  req.body.action = req.body.decision;
  return kycDecision(req, res, next);
};

const processSettlement = async (req, res) => {
  const { merchant_id, settlement_period, net_payable, note } = req.body;
  const adminId = req.user.id;

  const { rows: mRows } = await query('SELECT store_name FROM merchants WHERE id = $1', [merchant_id]);
  if (!mRows[0]) return notFound(res, 'Merchant not found');

  const { rows } = await query(
    `INSERT INTO merchant_settlements
       (merchant_id, settlement_period, total_orders, gross_amount,
        platform_fee, gst_on_fee, tds, net_payable, status, processed_at)
     VALUES ($1, $2, 0, $3, 0, 0, 0, $3, 'processed', NOW())
     RETURNING id, merchant_id, settlement_period, net_payable, status`,
    [merchant_id, settlement_period, net_payable]
  );

  await audit(adminId, 'settlement_processed', 'merchants', merchant_id,
    { settlement_period, net_payable, note }, req
  );

  logger.info('Settlement processed', { adminId, merchantId: merchant_id, net_payable });
  return success(res, { settlement: rows[0] },
    `Settlement of ₹${net_payable} processed for ${mRows[0].store_name}`
  );
};

module.exports = {
  listMerchants, getPendingKYC, getMerchant,
  merchantDecision, kycDecision, updateSubscription,
  getMerchantOrders, getMerchantProducts,
  approveMerchant, rejectMerchant, updateMerchantStatus,
  getMerchantKYC, verifyKYC, processSettlement,
};
