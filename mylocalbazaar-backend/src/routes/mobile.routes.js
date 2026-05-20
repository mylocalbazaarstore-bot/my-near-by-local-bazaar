// src/routes/mobile.routes.js
// ─────────────────────────────────────────────────────────────
// Mobile App API Layer — MyLocalBazaar.store
// Base: /api/v1/mobile
//
// These endpoints are OPTIMISED for mobile:
//   - Single-request data aggregation (reduce round trips)
//   - Lightweight payloads (only fields mobile apps need)
//   - Offline-safe design (returns partial data on error)
//   - FCM token registration integrated into session
//
// Used by:
//   Customer App    → /mobile/customer/*
//   Merchant App    → /mobile/merchant/*
//   Delivery App    → /mobile/delivery/*
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { query }  = require('../config/db');
const { redis }  = require('../config/redis');
const { success, badRequest } = require('../utils/response');
const logger = require('../config/logger');

// ═══════════════════════════════════════════════════════════════
// CUSTOMER APP ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// ── GET /mobile/customer/home ─────────────────────────────────
// Returns everything the Customer App home screen needs in ONE call:
// Categories + Featured merchants + Active orders count + Wallet balance
router.get('/customer/home',
  authenticate, authorize('customer'),
  async (req, res) => {
    const userId = req.user.id;

    // Resolve area from saved location
    const areaData = await redis.get(`mlb:selected_area:${userId}`) || null;
    const pincode  = areaData?.pincode || '410210';

    const [categoriesRes, merchantsRes, ordersRes, walletRes, notifRes] = await Promise.allSettled([
      // 1. Top 8 categories
      query(
        `SELECT id, name, slug, theme_color, store_category, icon_url, image_url
         FROM categories WHERE is_active = true ORDER BY sort_order ASC LIMIT 8`
      ),
      // 2. Featured merchants in area
      query(
        `SELECT m.id, m.store_name, m.store_slug, m.store_category,
                m.store_logo_url, m.rating, m.is_open, m.min_order_value,
                m.delivery_radius_km, m.accepts_cod, m.is_featured
         FROM merchants m
         WHERE m.merchant_status = 'active' AND m.pincode = $1
         ORDER BY m.is_featured DESC, m.rating DESC LIMIT 12`,
        [pincode]
      ),
      // 3. Active orders count
      query(
        `SELECT COUNT(*) AS cnt FROM orders
         WHERE user_id = $1
           AND order_status NOT IN ('delivered','cancelled','refund_completed')`,
        [userId]
      ),
      // 4. Wallet balance
      query(
        "SELECT balance FROM wallets WHERE owner_id = $1 AND owner_type = 'customer'",
        [userId]
      ),
      // 5. Unread notification count
      query(
        "SELECT COUNT(*) AS cnt FROM notifications WHERE recipient_id = $1 AND is_read = false",
        [userId]
      ),
    ]);

    return success(res, {
      categories:    categoriesRes.status === 'fulfilled' ? categoriesRes.value.rows : [],
      merchants:     merchantsRes.status === 'fulfilled'  ? merchantsRes.value.rows  : [],
      active_orders: ordersRes.status === 'fulfilled'     ? parseInt(ordersRes.value.rows[0]?.cnt || 0) : 0,
      wallet_balance: walletRes.status === 'fulfilled'    ? parseFloat(walletRes.value.rows[0]?.balance || 0) : 0,
      unread_notifications: notifRes.status === 'fulfilled' ? parseInt(notifRes.value.rows[0]?.cnt || 0) : 0,
      area: areaData,
    }, 'Home data loaded');
  }
);

// ── GET /mobile/customer/cart-summary ─────────────────────────
// Lightweight cart: item count + total + merchant name
router.get('/customer/cart-summary',
  authenticate, authorize('customer'),
  async (req, res) => {
    const { rows } = await query(
      `SELECT
         COUNT(ci.id)::int AS item_count,
         COALESCE(SUM(ci.quantity * ci.unit_price), 0) AS subtotal,
         m.store_name, m.min_order_value, m.is_open
       FROM carts c
       LEFT JOIN cart_items ci ON ci.cart_id = c.id
       LEFT JOIN merchants   m ON m.id = c.merchant_id
       WHERE c.user_id = $1
       GROUP BY c.id, m.store_name, m.min_order_value, m.is_open`,
      [req.user.id]
    );

    return success(res, {
      cart: rows[0] || { item_count: 0, subtotal: 0, store_name: null },
    });
  }
);

// ── POST /mobile/customer/set-location ───────────────────────
// Customer saves their location (called on location permission grant)
router.post('/customer/set-location',
  authenticate,
  async (req, res) => {
    const { area_id, pincode, latitude, longitude } = req.body;
    if (!area_id && !pincode) return badRequest(res, 'area_id or pincode required');

    let area = null;
    if (area_id) {
      const { rows } = await query(
        'SELECT id, name, pincode, latitude, longitude FROM areas WHERE id = $1',
        [area_id]
      );
      area = rows[0];
    } else {
      const { rows } = await query(
        'SELECT id, name, pincode, latitude, longitude FROM areas WHERE pincode = $1 LIMIT 1',
        [pincode]
      );
      area = rows[0];
    }

    if (area) {
      await redis.set(`mlb:selected_area:${req.user.id}`, area, 86400 * 7); // 7 days
    }

    return success(res, { area }, 'Location saved');
  }
);

// ═══════════════════════════════════════════════════════════════
// MERCHANT APP ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// ── GET /mobile/merchant/dashboard ───────────────────────────
// Single call: pending orders + today's stats + low stock count
router.get('/merchant/dashboard',
  authenticate, authorize('merchant'),
  async (req, res) => {
    const merchantId = req.user.id;

    const [pendingRes, statsRes, lowStockRes, profileRes] = await Promise.allSettled([
      // Pending approvals
      query(
        `SELECT COUNT(*) AS cnt FROM orders
         WHERE merchant_id = $1 AND order_status = 'payment_processed'`,
        [merchantId]
      ),
      // Today's stats
      query(
        `SELECT
           COUNT(*) FILTER (WHERE order_status = 'delivered' AND DATE(created_at) = CURRENT_DATE)::int AS delivered_today,
           COALESCE(SUM(total_amount) FILTER (WHERE order_status = 'delivered' AND DATE(created_at) = CURRENT_DATE), 0) AS revenue_today,
           COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE)::int AS orders_today
         FROM orders WHERE merchant_id = $1`,
        [merchantId]
      ),
      // Low stock
      query(
        `SELECT COUNT(*) AS cnt FROM products
         WHERE merchant_id = $1 AND track_inventory = true
           AND stock_quantity <= low_stock_threshold
           AND product_status NOT IN ('archived','rejected')`,
        [merchantId]
      ),
      // Profile status
      query(
        'SELECT is_open, kyc_status, merchant_status, rating, total_reviews FROM merchants WHERE id = $1',
        [merchantId]
      ),
    ]);

    return success(res, {
      pending_approvals:  pendingRes.status   === 'fulfilled' ? parseInt(pendingRes.value.rows[0]?.cnt || 0) : 0,
      today:              statsRes.status     === 'fulfilled' ? statsRes.value.rows[0] : {},
      low_stock_count:    lowStockRes.status  === 'fulfilled' ? parseInt(lowStockRes.value.rows[0]?.cnt || 0) : 0,
      store:              profileRes.status   === 'fulfilled' ? profileRes.value.rows[0] : {},
    }, 'Merchant dashboard loaded');
  }
);

// ── PATCH /mobile/merchant/toggle-open ───────────────────────
// Quick open/close from merchant app home screen
router.patch('/merchant/toggle-open',
  authenticate, authorize('merchant'),
  async (req, res) => {
    const { rows } = await query(
      `UPDATE merchants SET is_open = NOT is_open WHERE id = $1 RETURNING is_open`,
      [req.user.id]
    );
    return success(res, { is_open: rows[0].is_open },
      rows[0].is_open ? '✅ Store is now Open' : '🔴 Store is now Closed'
    );
  }
);

// ═══════════════════════════════════════════════════════════════
// DELIVERY APP ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// ── GET /mobile/delivery/dashboard ───────────────────────────
// Single call: active assignments + today earnings + online status
router.get('/delivery/dashboard',
  authenticate, authorize('delivery_partner'),
  async (req, res) => {
    const partnerId = req.user.id;

    const [activeRes, earningsRes, profileRes] = await Promise.allSettled([
      // Active assignments
      query(
        `SELECT da.id, da.delivery_status, da.delivery_otp, da.assigned_at,
                o.order_number, o.total_amount,
                o.delivery_address->>'address_line1' AS delivery_address,
                m.store_name, m.address_line1 AS pickup_address,
                m.phone AS merchant_phone
         FROM delivery_assignments da
         JOIN orders   o ON o.id = da.order_id
         JOIN merchants m ON m.id = o.merchant_id
         WHERE da.partner_id = $1
           AND da.delivery_status IN ('assigned','picked_up','in_transit')
         ORDER BY da.assigned_at ASC`,
        [partnerId]
      ),
      // Today's earnings
      query(
        `SELECT
           COUNT(*) FILTER (WHERE delivery_status = 'delivered' AND DATE(delivered_at) = CURRENT_DATE)::int AS delivered_today,
           COALESCE(SUM(earnings) FILTER (WHERE delivery_status = 'delivered' AND DATE(delivered_at) = CURRENT_DATE), 0) AS earnings_today
         FROM delivery_assignments WHERE partner_id = $1`,
        [partnerId]
      ),
      // Partner profile
      query(
        'SELECT is_online, wallet_balance, total_deliveries, rating FROM delivery_partners WHERE id = $1',
        [partnerId]
      ),
    ]);

    return success(res, {
      active_assignments: activeRes.status   === 'fulfilled' ? activeRes.value.rows   : [],
      today:              earningsRes.status  === 'fulfilled' ? earningsRes.value.rows[0] : {},
      profile:            profileRes.status   === 'fulfilled' ? profileRes.value.rows[0] : {},
    }, 'Delivery dashboard loaded');
  }
);

// ── POST /mobile/delivery/location-batch ─────────────────────
// Batch GPS update — partner sends buffered points from offline mode
router.post('/delivery/location-batch',
  authenticate, authorize('delivery_partner'),
  async (req, res) => {
    const { points } = req.body; // [{ lat, lng, timestamp }]
    if (!points?.length) return badRequest(res, 'points array is required');

    const { LocationService } = require('../services/delivery.service');

    // Process only the most recent point for DB update
    const sorted = [...points].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const latest = sorted[0];

    await LocationService.updateLocation(req.user.id, latest.lat, latest.lng);

    return success(res, {
      processed:   points.length,
      latest_used: { lat: latest.lat, lng: latest.lng, timestamp: latest.timestamp },
    }, 'Location batch processed');
  }
);

// ═══════════════════════════════════════════════════════════════
// SHARED MOBILE ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// ── GET /mobile/app-config ────────────────────────────────────
// Returns app configuration: feature flags, min version, maintenance
router.get('/app-config', (req, res) => {
  return success(res, {
    config: {
      min_app_version:    { customer: '1.0.0', merchant: '1.0.0', delivery: '1.0.0' },
      features: {
        wallet_topup:      true,
        cod:               true,
        emergency_booking: true,
        live_tracking:     true,
        review_system:     true,
      },
      support: {
        phone:  '+91-99999-99999',
        email:  'support@mylocalbazaar.store',
        hours:  '9 AM – 9 PM, Mon–Sat',
      },
      free_delivery_above: parseFloat(process.env.FREE_DELIVERY_ABOVE || 500),
      platform_name:  'MyLocalBazaar',
      platform_tagline: 'Your Local Market, Digitally Connected',
    },
  });
});

// ── POST /mobile/feedback ─────────────────────────────────────
// In-app feedback / bug report from mobile users
router.post('/feedback',
  authenticate,
  async (req, res) => {
    const { type, message, app_version, device_info } = req.body;
    if (!message) return badRequest(res, 'message is required');

    await query(
      `INSERT INTO admin_audit_logs (admin_id, action, entity_type, new_values)
       VALUES ($1, 'mobile_feedback', 'users', $2)`,
      [
        req.user.id,
        JSON.stringify({ type, message, app_version, device_info, user_role: req.user.role }),
      ]
    ).catch(() => {});

    return success(res, null, 'Feedback received. Thank you!');
  }
);

module.exports = router;
