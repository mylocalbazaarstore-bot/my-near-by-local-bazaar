// src/controllers/admin/analytics.admin.controller.js
// ─────────────────────────────────────────────────────────────
// Admin Analytics Controller — MyLocalBazaar.store
// ENDPOINTS:
//   GET /admin/analytics/overview           → Platform KPIs
//   GET /admin/analytics/revenue-trend      → GMV chart
//   GET /admin/analytics/geographic         → Heatmap data
//   GET /admin/analytics/top-merchants      → Best performers
//   GET /admin/analytics/fraud-signals      → Risk flagged merchants
//   GET /admin/analytics/categories         → Category performance
//   GET /admin/analytics/user-growth        → Registration trend
//   GET /admin/analytics/settlements        → Settlement summary
// ─────────────────────────────────────────────────────────────

const AdminAnalyticsService = require('../../services/admin.analytics.service');
const { success } = require('../../utils/response');

const getOverview        = async (req, res) => success(res, { overview: await AdminAnalyticsService.getPlatformOverview(req.query.period) }, 'Platform overview');
const getRevenueTrend    = async (req, res) => success(res, { trend: await AdminAnalyticsService.getRevenueTrend(req.query.period) }, 'Revenue trend');
const getGeographic      = async (req, res) => success(res, { heatmap: await AdminAnalyticsService.getGeographicReport(req.query.period) }, 'Geographic report');
const getTopMerchants    = async (req, res) => success(res, { merchants: await AdminAnalyticsService.getTopMerchants(req.query.period, parseInt(req.query.limit || 10)) }, 'Top merchants');
const getFraudSignals    = async (req, res) => success(res, { signals: await AdminAnalyticsService.getFraudSignals() }, 'Fraud signals');
const getCategoryPerf    = async (req, res) => success(res, { categories: await AdminAnalyticsService.getCategoryPerformance(req.query.period) }, 'Category performance');
const getUserGrowth      = async (req, res) => success(res, { growth: await AdminAnalyticsService.getUserGrowth(req.query.period) }, 'User growth');
const getSettlementSummary = async (req, res) => success(res, { summary: await AdminAnalyticsService.getSettlementSummary() }, 'Settlement summary');

module.exports = {
  getOverview, getRevenueTrend, getGeographic, getTopMerchants,
  getFraudSignals, getCategoryPerf, getUserGrowth, getSettlementSummary,
};


// ─────────────────────────────────────────────────────────────
// src/controllers/admin/complaint.admin.controller.js
// Admin Complaint Management — MyLocalBazaar.store
// ENDPOINTS:
//   GET   /admin/complaints            → All tickets
//   GET   /admin/complaints/:id        → Full ticket thread
//   POST  /admin/complaints/:id/assign → Assign to admin
//   POST  /admin/complaints/:id/reply  → Admin replies
//   PATCH /admin/complaints/:id/resolve → Mark resolved/closed
// ─────────────────────────────────────────────────────────────

const { query, queryPaginated } = require('../../config/db');
const { success: suc, notFound, paginated } = require('../../utils/response');

const listComplaints = async (req, res) => {
  const { page=1, limit=20, status, priority, sort_by='created_at', sort_order='desc' } = req.query;
  const params = [], clauses = [];
  if (status)   { params.push(status);   clauses.push(`ct.status = $${params.length}`); }
  if (priority) { params.push(priority); clauses.push(`ct.priority = $${params.length}`); }

  const sortCols  = { created_at: 'ct.created_at', priority: `CASE ct.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END` };
  const safeSort  = sortCols[sort_by] || 'ct.created_at';
  const safeOrder = sort_order === 'asc' ? 'ASC' : 'DESC';

  const result = await queryPaginated(
    `SELECT ct.id, ct.ticket_number, ct.subject, ct.status, ct.priority,
            ct.created_at, ct.resolved_at,
            u.full_name AS customer_name, u.phone AS customer_phone,
            m.store_name AS merchant_name,
            o.order_number,
            a.full_name AS assigned_to_name
     FROM complaint_tickets ct
     JOIN users u ON u.id = ct.user_id
     LEFT JOIN merchants m ON m.id = ct.merchant_id
     LEFT JOIN orders o    ON o.id = ct.order_id
     LEFT JOIN admins a    ON a.id = ct.assigned_to
     ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''}
     ORDER BY ${safeSort} ${safeOrder}`,
    params, { page, limit }
  );

  return paginated(res, result, 'Complaints fetched');
};

const getComplaint = async (req, res) => {
  const { rows } = await query(
    `SELECT ct.*, u.full_name AS customer_name, u.phone, m.store_name
     FROM complaint_tickets ct
     JOIN users u ON u.id = ct.user_id
     LEFT JOIN merchants m ON m.id = ct.merchant_id
     WHERE ct.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return notFound(res, 'Complaint not found');

  const { rows: replies } = await query(
    `SELECT tr.*, a.full_name AS admin_name, u.full_name AS user_name
     FROM ticket_replies tr
     LEFT JOIN admins a ON a.id = tr.sender_id AND tr.sender_type = 'admin'
     LEFT JOIN users  u ON u.id = tr.sender_id AND tr.sender_type = 'customer'
     WHERE tr.ticket_id = $1 ORDER BY tr.created_at ASC`,
    [req.params.id]
  );

  return suc(res, { complaint: { ...rows[0], replies } });
};

const assignComplaint = async (req, res) => {
  const { admin_id, priority } = req.body;
  await query(
    `UPDATE complaint_tickets SET assigned_to = $1, status = 'in_progress',
     priority = COALESCE($2, priority), updated_at = NOW() WHERE id = $3`,
    [admin_id, priority || null, req.params.id]
  );
  return suc(res, null, 'Complaint assigned');
};

const replyToComplaint = async (req, res) => {
  await query(
    `INSERT INTO ticket_replies (ticket_id, sender_id, sender_type, message)
     VALUES ($1, $2, 'admin', $3)`,
    [req.params.id, req.user.id, req.body.message]
  );
  return suc(res, null, 'Reply sent');
};

const resolveComplaint = async (req, res) => {
  const { resolution, status = 'resolved' } = req.body;
  await query(
    `UPDATE complaint_tickets
     SET status = $1, resolution = $2, resolved_at = NOW(), updated_at = NOW()
     WHERE id = $3`,
    [status, resolution, req.params.id]
  );
  return suc(res, null, `Complaint marked as ${status}`);
};

module.exports.complaintController = {
  listComplaints, getComplaint, assignComplaint, replyToComplaint, resolveComplaint,
};


// ─────────────────────────────────────────────────────────────
// src/controllers/admin/marketing.admin.controller.js
// Admin Marketing Management
// ─────────────────────────────────────────────────────────────

const mkQuery = require('../../config/db').query;
const mkQP    = require('../../config/db').queryPaginated;
const { success: mkSuc, created: mkCreated, notFound: mkNotFound, paginated: mkPag } = require('../../utils/response');

const listCoupons = async (req, res) => {
  const { page=1, limit=20 } = req.query;
  const result = await mkQP(
    `SELECT c.*, cat.name AS category_name, m.store_name
     FROM coupons c
     LEFT JOIN categories cat ON cat.id = c.category_id
     LEFT JOIN merchants  m   ON m.id   = c.merchant_id
     ORDER BY c.created_at DESC`,
    [], { page, limit }
  );
  return mkPag(res, result, 'Coupons fetched');
};

const createCoupon = async (req, res) => {
  const d = req.body;
  const { rows } = await mkQuery(
    `INSERT INTO coupons
       (code, description, coupon_type, discount_value, max_discount_amount, min_order_value,
        merchant_id, category_id, applicable_for, max_uses, uses_per_user, valid_from, valid_until, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [d.code, d.description||null, d.coupon_type, d.discount_value, d.max_discount_amount||null,
     d.min_order_value||0, d.merchant_id||null, d.category_id||null,
     d.applicable_for||'all', d.max_uses||null, d.uses_per_user||1,
     d.valid_from, d.valid_until, req.user.id]
  );
  return mkCreated(res, { coupon: rows[0] }, 'Coupon created');
};

const toggleCoupon = async (req, res) => {
  const { rows } = await mkQuery(
    'UPDATE coupons SET is_active = NOT is_active WHERE id = $1 RETURNING id, code, is_active',
    [req.params.id]
  );
  if (!rows[0]) return mkNotFound(res, 'Coupon not found');
  return mkSuc(res, { coupon: rows[0] }, `Coupon ${rows[0].is_active ? 'activated' : 'deactivated'}`);
};

const listBanners = async (req, res) => {
  const { rows } = await mkQuery(
    'SELECT * FROM banners ORDER BY sort_order ASC, created_at DESC'
  );
  return mkSuc(res, { banners: rows });
};

const createBanner = async (req, res) => {
  const d = req.body;
  const { rows } = await mkQuery(
    `INSERT INTO banners
       (title, subtitle, image_url, mobile_image_url, link_url, link_type, link_target_id,
        position, area_id, sort_order, valid_from, valid_until, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [d.title||null, d.subtitle||null, d.image_url, d.mobile_image_url||null,
     d.link_url||null, d.link_type||null, d.link_target_id||null,
     d.position||'hero', d.area_id||null, d.sort_order||0,
     d.valid_from||null, d.valid_until||null, req.user.id]
  );
  return mkCreated(res, { banner: rows[0] }, 'Banner created');
};

const toggleBanner = async (req, res) => {
  const { rows } = await mkQuery(
    'UPDATE banners SET is_active = NOT is_active WHERE id = $1 RETURNING id, title, is_active',
    [req.params.id]
  );
  if (!rows[0]) return mkNotFound(res, 'Banner not found');
  return mkSuc(res, { banner: rows[0] }, `Banner ${rows[0].is_active ? 'activated' : 'deactivated'}`);
};

module.exports.marketingController = {
  listCoupons, createCoupon, toggleCoupon, listBanners, createBanner, toggleBanner,
};
