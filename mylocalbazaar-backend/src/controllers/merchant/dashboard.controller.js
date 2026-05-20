// src/controllers/merchant/dashboard.controller.js
// ─────────────────────────────────────────────────────────────
// Merchant Dashboard Controller — MyLocalBazaar.store
//
// ENDPOINTS:
//   GET /merchant/dashboard/overview      → All KPI cards
//   GET /merchant/dashboard/revenue-trend → Chart data
//   GET /merchant/dashboard/top-products  → Best sellers
//   GET /merchant/dashboard/recent-orders → Order feed
//   GET /merchant/dashboard/pending       → Awaiting approval
//   GET /merchant/dashboard/bookings      → Booking summary
//   GET /merchant/dashboard/low-stock     → Inventory alerts
//   GET /merchant/dashboard/profile-checklist → Onboarding progress
// ─────────────────────────────────────────────────────────────

const DashboardService  = require('../../services/dashboard.service');
const ProductService    = require('../../services/product.service');
const { query }         = require('../../config/db');
const { success, paginated } = require('../../utils/response');

// ── GET /merchant/dashboard/overview ──────────────────────────
const getOverview = async (req, res) => {
  const { period = 'month' } = req.query;
  const overview = await DashboardService.getOverview(req.user.id, period);
  return success(res, { overview }, 'Dashboard overview');
};

// ── GET /merchant/dashboard/revenue-trend ─────────────────────
const getRevenueTrend = async (req, res) => {
  const { period = 'month' } = req.query;
  const trend = await DashboardService.getRevenueTrend(req.user.id, period);
  return success(res, { trend, period }, 'Revenue trend');
};

// ── GET /merchant/dashboard/top-products ──────────────────────
const getTopProducts = async (req, res) => {
  const { period = 'month', limit = 10 } = req.query;
  const products = await DashboardService.getTopProducts(req.user.id, period, parseInt(limit));
  return success(res, { products, period }, 'Top products');
};

// ── GET /merchant/dashboard/recent-orders ─────────────────────
const getRecentOrders = async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const result = await DashboardService.getRecentOrders(
    req.user.id,
    { status },
    { page, limit }
  );
  return paginated(res, result, 'Recent orders');
};

// ── GET /merchant/dashboard/pending ───────────────────────────
// Orders in 'payment_processed' status — need merchant action NOW
const getPendingApprovals = async (req, res) => {
  const orders = await DashboardService.getPendingApprovals(req.user.id);
  return success(res, {
    orders,
    count: orders.length,
    message: orders.length
      ? `${orders.length} order(s) awaiting your approval`
      : 'No pending orders',
  }, 'Pending approvals');
};

// ── GET /merchant/dashboard/bookings ──────────────────────────
const getBookingSummary = async (req, res) => {
  const { period = 'month' } = req.query;
  const summary = await DashboardService.getBookingSummary(req.user.id, period);
  return success(res, { summary, period }, 'Booking summary');
};

// ── GET /merchant/dashboard/low-stock ─────────────────────────
const getLowStock = async (req, res) => {
  const items = await ProductService.getLowStockProducts(req.user.id, 20);
  return success(res, { items, count: items.length }, 'Low stock alerts');
};

// ── GET /merchant/dashboard/profile-checklist ─────────────────
// Shows merchant onboarding completion status
const getProfileChecklist = async (req, res) => {
  const merchantId = req.user.id;

  const { rows } = await query(
    `SELECT
       m.store_name, m.store_logo_url, m.store_banner_url,
       m.store_description, m.whatsapp_catalog_link,
       m.gstin, m.pan_number, m.latitude, m.longitude,
       m.kyc_status, m.merchant_status, m.subscription_plan,
       k.gst_certificate_url, k.pan_card_url,
       k.aadhaar_front_url, k.shop_license_url,
       (SELECT COUNT(*) FROM products WHERE merchant_id = m.id AND product_status = 'active') AS active_products,
       (SELECT COUNT(*) FROM merchant_operating_hours WHERE merchant_id = m.id) AS hours_set,
       (SELECT COUNT(*) FROM merchant_bank_details WHERE merchant_id = m.id) AS bank_linked
     FROM merchants m
     LEFT JOIN merchant_kyc k ON k.merchant_id = m.id
     WHERE m.id = $1`,
    [merchantId]
  );

  const d = rows[0] || {};

  // Build checklist items
  const checklist = [
    {
      key:       'store_profile',
      label:     'Complete Store Profile',
      done:      !!(d.store_name && d.store_description),
      action:    '/merchant/settings/profile',
      priority:  1,
    },
    {
      key:       'store_logo',
      label:     'Upload Store Logo & Banner',
      done:      !!(d.store_logo_url && d.store_banner_url),
      action:    '/merchant/settings/branding',
      priority:  2,
    },
    {
      key:       'location',
      label:     'Set Store Location on Map',
      done:      !!(d.latitude && d.longitude),
      action:    '/merchant/settings/location',
      priority:  3,
    },
    {
      key:       'kyc',
      label:     'Submit KYC Documents',
      done:      d.kyc_status === 'verified',
      pending:   d.kyc_status === 'submitted',
      action:    '/merchant/kyc',
      priority:  4,
    },
    {
      key:       'bank',
      label:     'Link Bank Account for Payouts',
      done:      parseInt(d.bank_linked) > 0,
      action:    '/merchant/settings/bank',
      priority:  5,
    },
    {
      key:       'products',
      label:     'Add at Least 1 Active Product',
      done:      parseInt(d.active_products) > 0,
      action:    '/merchant/products/new',
      priority:  6,
    },
    {
      key:       'hours',
      label:     'Set Operating Hours',
      done:      parseInt(d.hours_set) >= 7,
      action:    '/merchant/settings/hours',
      priority:  7,
    },
    {
      key:       'whatsapp',
      label:     'Connect WhatsApp Catalog (Optional)',
      done:      !!d.whatsapp_catalog_link,
      action:    '/merchant/settings/whatsapp',
      optional:  true,
      priority:  8,
    },
  ];

  const required  = checklist.filter((c) => !c.optional);
  const completed = required.filter((c) => c.done).length;
  const pct       = Math.round((completed / required.length) * 100);

  return success(res, {
    checklist,
    completion: {
      completed_steps:  completed,
      total_steps:      required.length,
      percentage:       pct,
      profile_complete: pct === 100,
    },
  }, 'Profile checklist');
};

module.exports = {
  getOverview,
  getRevenueTrend,
  getTopProducts,
  getRecentOrders,
  getPendingApprovals,
  getBookingSummary,
  getLowStock,
  getProfileChecklist,
};
