// src/services/delivery.service.js
// ─────────────────────────────────────────────────────────────
// Delivery Partner Service — MyLocalBazaar.store
//
// Responsibilities:
//   • Partner registration, authentication & profile
//   • Live GPS location tracking (Redis + PostgreSQL PostGIS)
//   • Order assignment (admin assigns to nearest partner)
//   • Delivery lifecycle: assigned → picked_up → in_transit → delivered
//   • Doorstep OTP verification & proof-of-delivery upload
//   • Failed delivery reporting
//   • Earnings calculation & dashboard
//   • Payout settlement
// ─────────────────────────────────────────────────────────────

const bcrypt   = require('bcryptjs');
const { query, withTransaction, queryPaginated } = require('../config/db');
const { redis }                = require('../config/redis');
const { generateDeliveryOTP }  = require('../utils/generators');
const logger                   = require('../config/logger');

const BCRYPT_ROUNDS     = 12;
const LOCATION_TTL      = 300; // 5 min Redis TTL for GPS location
const EARNINGS_PER_KM   = parseFloat(process.env.DELIVERY_PER_KM_CHARGE || 5);
const BASE_EARNING      = parseFloat(process.env.DELIVERY_BASE_CHARGE   || 20);

// ── Helper: cache partner location in Redis ───────────────────
const cachePartnerLocation = async (partnerId, lat, lng) => {
  const key = `mlb:dp_location:${partnerId}`;
  await redis.set(key, { lat, lng, updated_at: new Date().toISOString() }, LOCATION_TTL);
};

// ─────────────────────────────────────────────────────────────
// AUTH SERVICE
// ─────────────────────────────────────────────────────────────
const DeliveryAuthService = {

  findByPhone: async (phone) => {
    const { rows } = await query(
      'SELECT * FROM delivery_partners WHERE phone = $1 LIMIT 1', [phone]
    );
    return rows[0] || null;
  },

  findById: async (id) => {
    const { rows } = await query(
      `SELECT id, full_name, phone, email, vehicle_type, vehicle_number,
              area_id, is_online, is_verified, is_active,
              rating, total_deliveries, wallet_balance,
              current_latitude, current_longitude, created_at
       FROM delivery_partners WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  register: async (phone, data) => {
    const existing = await DeliveryAuthService.findByPhone(phone);
    if (existing) {
      throw Object.assign(
        new Error('A delivery partner account with this phone already exists'),
        { statusCode: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    const { rows } = await query(
      `INSERT INTO delivery_partners
         (full_name, phone, email, password_hash, vehicle_type, vehicle_number,
          aadhaar_number, dl_number, area_id, is_online, is_verified, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, false, false, true)
       RETURNING id, full_name, phone, vehicle_type, vehicle_number, is_verified`,
      [
        data.full_name, phone, data.email || null, passwordHash,
        data.vehicle_type, data.vehicle_number,
        data.aadhaar_number, data.dl_number, data.area_id || null,
      ]
    );

    logger.info('Delivery partner registered', { partnerId: rows[0].id, phone });
    return rows[0];
  },

  login: async (phone, password) => {
    const partner = await DeliveryAuthService.findByPhone(phone);
    if (!partner) {
      throw Object.assign(new Error('Invalid phone or password'), { statusCode: 401 });
    }
    if (!partner.is_active) {
      throw Object.assign(new Error('Account is deactivated. Contact support.'), { statusCode: 403 });
    }

    const match = await bcrypt.compare(password, partner.password_hash);
    if (!match) {
      throw Object.assign(new Error('Invalid phone or password'), { statusCode: 401 });
    }

    const { createAccessToken, createRefreshToken } = require('../utils/generators');
    const { token: accessToken }  = createAccessToken(partner.id, 'delivery_partner');
    const { token: refreshToken } = createRefreshToken(partner.id, 'delivery_partner');

    await query(
      'UPDATE delivery_partners SET last_login_at = NOW() WHERE id = $1',
      [partner.id]
    );

    const { password_hash, ...safeProfile } = partner;
    return { partner: safeProfile, tokens: { access_token: accessToken, refresh_token: refreshToken, token_type: 'Bearer' } };
  },
};

// ─────────────────────────────────────────────────────────────
// LOCATION SERVICE
// ─────────────────────────────────────────────────────────────
const LocationService = {

  // Called every 30s from mobile app while online
  updateLocation: async (partnerId, lat, lng) => {
    // 1. Update Redis (real-time — fast)
    await cachePartnerLocation(partnerId, lat, lng);

    // 2. Update PostgreSQL (persistent — lat/lng only; PostGIS geom skipped if unavailable)
    await query(
      `UPDATE delivery_partners
       SET current_latitude  = $1,
           current_longitude = $2,
           updated_at        = NOW()
       WHERE id = $3`,
      [lat, lng, partnerId]
    );

    return { updated: true };
  },

  // Get live location (tries Redis first, falls back to DB)
  getLocation: async (partnerId) => {
    const cached = await redis.get(`mlb:dp_location:${partnerId}`);
    if (cached) return { ...cached, source: 'realtime' };

    const { rows } = await query(
      'SELECT current_latitude AS lat, current_longitude AS lng, updated_at FROM delivery_partners WHERE id = $1',
      [partnerId]
    );
    return rows[0] ? { ...rows[0], source: 'last_known' } : null;
  },

  // Find nearest available delivery partners using PostGIS
  findNearest: async (lat, lng, radiusKm = 5, limit = 10) => {
    // Haversine approximation (no PostGIS required)
    const { rows } = await query(
      `SELECT
         dp.id, dp.full_name, dp.phone, dp.vehicle_type,
         dp.rating, dp.total_deliveries, dp.is_verified,
         ROUND((
           6371 * acos(
             cos(radians($1)) * cos(radians(dp.current_latitude)) *
             cos(radians(dp.current_longitude) - radians($2)) +
             sin(radians($1)) * sin(radians(dp.current_latitude))
           )
         )::numeric, 2) AS distance_km,
         (SELECT COUNT(*) FROM delivery_assignments da
          WHERE da.partner_id = dp.id
            AND da.delivery_status IN ('assigned','picked_up','in_transit')) AS active_deliveries
       FROM delivery_partners dp
       WHERE dp.is_online   = true
         AND dp.is_active   = true
         AND dp.is_verified = true
         AND dp.current_latitude  IS NOT NULL
         AND dp.current_longitude IS NOT NULL
         AND (
           6371 * acos(
             cos(radians($1)) * cos(radians(dp.current_latitude)) *
             cos(radians(dp.current_longitude) - radians($2)) +
             sin(radians($1)) * sin(radians(dp.current_latitude))
           )
         ) <= $3
       ORDER BY distance_km ASC
       LIMIT $4`,
      [lat, lng, radiusKm, limit]
    );
    return rows;
  },
};

// ─────────────────────────────────────────────────────────────
// ASSIGNMENT SERVICE
// ─────────────────────────────────────────────────────────────
const AssignmentService = {

  // Admin assigns an order to a delivery partner
  assign: async (orderId, partnerId, adminId, notes = null) => {
    return withTransaction(async (client) => {
      // Verify order is in the right state
      const { rows: orderRows } = await client.query(
        `SELECT o.id, o.order_status, o.merchant_id, o.total_amount,
                o.delivery_address, o.delivery_otp
         FROM orders o
         WHERE o.id = $1 AND o.order_status IN ('packed', 'accepted')`,
        [orderId]
      );

      const order = orderRows[0];
      if (!order) {
        throw Object.assign(
          new Error('Order not found or not ready for delivery assignment'),
          { statusCode: 404 }
        );
      }

      // Check partner isn't overwhelmed (max 3 concurrent active)
      const { rows: activeRows } = await client.query(
        `SELECT COUNT(*) AS cnt FROM delivery_assignments
         WHERE partner_id = $1 AND delivery_status IN ('assigned','picked_up','in_transit')`,
        [partnerId]
      );
      if (parseInt(activeRows[0].cnt) >= 3) {
        throw Object.assign(
          new Error('This partner already has 3 active deliveries. Choose another partner.'),
          { statusCode: 400 }
        );
      }

      // Generate delivery OTP if not already set
      const deliveryOtp = order.delivery_otp || generateDeliveryOTP();

      // Create assignment record
      const { rows: assignRows } = await client.query(
        `INSERT INTO delivery_assignments
           (order_id, partner_id, delivery_status, delivery_otp)
         VALUES ($1, $2, 'assigned', $3)
         ON CONFLICT (order_id) DO UPDATE
           SET partner_id       = EXCLUDED.partner_id,
               delivery_status  = 'assigned',
               delivery_otp     = EXCLUDED.delivery_otp,
               assigned_at      = NOW()
         RETURNING id, delivery_otp`,
        [orderId, partnerId, deliveryOtp]
      );

      // Update order with partner + OTP
      await client.query(
        `UPDATE orders
         SET delivery_partner_id = $1,
             delivery_otp        = $2,
             order_status        = 'out_for_delivery',
             updated_at          = NOW()
         WHERE id = $3`,
        [partnerId, deliveryOtp, orderId]
      );

      // Audit log
      if (adminId) {
        await client.query(
          `INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, new_values)
           VALUES ($1, 'assigned_delivery', 'orders', $2, $3)`,
          [adminId, orderId, JSON.stringify({ partner_id: partnerId, notes })]
        );
      }

      logger.info('Delivery assigned', { orderId, partnerId, assignmentId: assignRows[0].id });
      return assignRows[0];
    });
  },

  // Partner marks as picked up from merchant
  markPickedUp: async (partnerId, orderId) => {
    const { rows } = await query(
      `UPDATE delivery_assignments
       SET delivery_status = 'picked_up',
           picked_up_at   = NOW(),
           updated_at     = NOW()
       WHERE partner_id = $1 AND order_id = $2 AND delivery_status = 'assigned'
       RETURNING id`,
      [partnerId, orderId]
    );

    if (!rows[0]) {
      throw Object.assign(
        new Error('Assignment not found or already picked up'),
        { statusCode: 404 }
      );
    }

    // Mark as in_transit immediately
    await query(
      `UPDATE delivery_assignments
       SET delivery_status = 'in_transit'
       WHERE partner_id = $1 AND order_id = $2`,
      [partnerId, orderId]
    );

    logger.info('Order picked up by partner', { partnerId, orderId });
    return { status: 'in_transit' };
  },

  // Partner verifies OTP at customer door (CRITICAL step)
  verifyDeliveryOTP: async (partnerId, orderId, inputOtp) => {
    return withTransaction(async (client) => {
      const { rows: assignRows } = await client.query(
        `SELECT da.id, da.delivery_otp, da.delivery_status, da.distance_km,
                o.id AS order_id, o.total_amount, o.merchant_id
         FROM delivery_assignments da
         JOIN orders o ON o.id = da.order_id
         WHERE da.partner_id = $1 AND da.order_id = $2`,
        [partnerId, orderId]
      );

      const assignment = assignRows[0];
      if (!assignment) {
        throw Object.assign(new Error('Assignment not found'), { statusCode: 404 });
      }

      if (assignment.delivery_status === 'delivered') {
        throw Object.assign(new Error('This order has already been delivered'), { statusCode: 400 });
      }

      if (assignment.delivery_otp !== inputOtp) {
        throw Object.assign(
          new Error('Invalid delivery OTP. Please ask customer for the correct code.'),
          { statusCode: 400 }
        );
      }

      // OTP verified → mark delivered
      await client.query(
        `UPDATE delivery_assignments
         SET delivery_status   = 'delivered',
             otp_verified      = true,
             delivered_at      = NOW(),
             updated_at        = NOW()
         WHERE id = $1`,
        [assignment.id]
      );

      await client.query(
        `UPDATE orders
         SET order_status             = 'delivered',
             delivery_otp_verified    = true,
             delivered_at             = NOW(),
             updated_at               = NOW()
         WHERE id = $1`,
        [orderId]
      );

      // Update partner stats
      await client.query(
        `UPDATE delivery_partners
         SET total_deliveries = total_deliveries + 1
         WHERE id = $1`,
        [partnerId]
      );

      const earnings = await EarningsService.creditEarnings(
        client,
        partnerId,
        orderId,
        parseFloat(assignment.distance_km || 0)
      );

      logger.info('Delivery OTP verified — order delivered', { partnerId, orderId, earnings });
      return { verified: true, order_id: orderId, earnings };
    });
  },

  // Upload proof of delivery image
  uploadProof: async (partnerId, orderId, imageUrl) => {
    const { rowCount } = await query(
      `UPDATE delivery_assignments
       SET proof_image_url = $1, updated_at = NOW()
       WHERE partner_id = $2 AND order_id = $3`,
      [imageUrl, partnerId, orderId]
    );

    if (!rowCount) {
      throw Object.assign(new Error('Assignment not found'), { statusCode: 404 });
    }

    return { uploaded: true, proof_url: imageUrl };
  },

  // Partner reports failed delivery
  reportFailed: async (partnerId, orderId, reason, notes) => {
    return withTransaction(async (client) => {
      await client.query(
        `UPDATE delivery_assignments
         SET delivery_status = 'failed',
             failure_reason  = $1,
             updated_at      = NOW()
         WHERE partner_id = $2 AND order_id = $3`,
        [`${reason}: ${notes || ''}`, partnerId, orderId]
      );

      // Reset order for re-delivery attempt
      await client.query(
        `UPDATE orders
         SET order_status = 'packed',
             updated_at   = NOW()
         WHERE id = $1`,
        [orderId]
      );

      // Notify merchant and admin
      await client.query(
        `INSERT INTO notifications (recipient_id, recipient_type, notification_type, title, body, data)
         SELECT merchant_id, 'merchant', 'order',
                '⚠️ Delivery Failed',
                'Delivery partner could not deliver order. Reason: ' || $1,
                $2::jsonb
         FROM orders WHERE id = $3`,
        [reason, JSON.stringify({ order_id: orderId, reason }), orderId]
      );

      logger.warn('Delivery failed', { partnerId, orderId, reason });
      return { reported: true };
    });
  },

  // Get partner's active assignments
  getActive: async (partnerId) => {
    const { rows } = await query(
      `SELECT
         da.id, da.delivery_status, da.assigned_at, da.picked_up_at,
         da.delivery_otp, da.distance_km,
         o.id AS order_id, o.order_number, o.total_amount,
         o.delivery_address,
         m.store_name, m.address_line1 AS merchant_address,
         m.latitude AS merchant_lat, m.longitude AS merchant_lng,
         m.phone AS merchant_phone
       FROM delivery_assignments da
       JOIN orders   o ON o.id = da.order_id
       JOIN merchants m ON m.id = o.merchant_id
       WHERE da.partner_id = $1
         AND da.delivery_status IN ('assigned', 'picked_up', 'in_transit')
       ORDER BY da.assigned_at ASC`,
      [partnerId]
    );
    return rows;
  },

  // Get partner's delivery history
  getHistory: async (partnerId, filters = {}, pagination = {}) => {
    const { status, from_date, to_date } = filters;
    const { page = 1, limit = 20 } = pagination;

    const params  = [partnerId];
    const clauses = ['da.partner_id = $1'];

    if (status) {
      params.push(status);
      clauses.push(`da.delivery_status = $${params.length}`);
    }
    if (from_date) { params.push(from_date); clauses.push(`da.assigned_at >= $${params.length}`); }
    if (to_date)   { params.push(to_date);   clauses.push(`da.assigned_at <= $${params.length}`); }

    return queryPaginated(
      `SELECT
         da.id, da.delivery_status, da.assigned_at, da.delivered_at,
         da.distance_km, da.earnings,
         o.order_number, o.total_amount,
         o.delivery_address->>'pincode' AS delivery_pincode,
         m.store_name
       FROM delivery_assignments da
       JOIN orders   o ON o.id = da.order_id
       JOIN merchants m ON m.id = o.merchant_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY da.assigned_at DESC`,
      params,
      { page, limit }
    );
  },
};

// ─────────────────────────────────────────────────────────────
// EARNINGS SERVICE
// ─────────────────────────────────────────────────────────────
const EarningsService = {

  // Dashboard overview for partner
  getOverview: async (partnerId, period = 'week') => {
    const INTERVAL = {
      today: '1 day', week: '7 days', month: '30 days',
    }[period] || '7 days';

    const { rows } = await query(
      `SELECT
         COUNT(*)  FILTER (WHERE delivery_status = 'delivered')::int       AS total_delivered,
         COUNT(*)  FILTER (WHERE delivery_status = 'delivered'
                            AND delivered_at >= NOW() - INTERVAL '${INTERVAL}')::int AS period_delivered,
         COUNT(*)  FILTER (WHERE delivery_status = 'failed')::int          AS total_failed,
         COALESCE(SUM(earnings) FILTER (WHERE delivery_status = 'delivered'), 0)          AS total_earnings,
         COALESCE(SUM(earnings) FILTER (WHERE delivery_status = 'delivered'
                                         AND delivered_at >= NOW() - INTERVAL '${INTERVAL}'), 0) AS period_earnings,
         COALESCE(AVG(distance_km) FILTER (WHERE delivery_status = 'delivered'), 0) AS avg_distance_km
       FROM delivery_assignments
       WHERE partner_id = $1`,
      [partnerId]
    );

    const partner = await DeliveryAuthService.findById(partnerId);

    return {
      period,
      deliveries: {
        total_all_time:  rows[0].total_delivered,
        this_period:     rows[0].period_delivered,
        failed:          rows[0].total_failed,
      },
      earnings: {
        total_all_time:  parseFloat(rows[0].total_earnings),
        this_period:     parseFloat(rows[0].period_earnings),
        wallet_balance:  parseFloat(partner?.wallet_balance || 0),
        avg_per_delivery: rows[0].total_delivered > 0
          ? parseFloat((rows[0].total_earnings / rows[0].total_delivered).toFixed(2))
          : 0,
      },
      avg_distance_km: parseFloat(rows[0].avg_distance_km || 0).toFixed(2),
    };
  },

  // Credit earnings to partner wallet after delivery
  creditEarnings: async (client, partnerId, orderId, distanceKm = 0) => {
    const earnings = parseFloat(
      (BASE_EARNING + distanceKm * EARNINGS_PER_KM).toFixed(2)
    );

    await client.query(
      `UPDATE delivery_assignments SET earnings = $1 WHERE partner_id = $2 AND order_id = $3`,
      [earnings, partnerId, orderId]
    );

    await client.query(
      `UPDATE delivery_partners
       SET wallet_balance = wallet_balance + $1
       WHERE id = $2`,
      [earnings, partnerId]
    );

    logger.info('Delivery earnings credited', { partnerId, orderId, earnings });
    return earnings;
  },

  // Payout request (partner withdraws wallet balance)
  requestPayout: async (partnerId, amount) => {
    const partner = await DeliveryAuthService.findById(partnerId);

    if (parseFloat(partner.wallet_balance) < amount) {
      throw Object.assign(
        new Error('Insufficient wallet balance'),
        { statusCode: 400 }
      );
    }

    if (amount < 100) {
      throw Object.assign(
        new Error('Minimum payout amount is ₹100'),
        { statusCode: 400 }
      );
    }

    await query(
      `UPDATE delivery_partners
       SET wallet_balance = wallet_balance - $1
       WHERE id = $2`,
      [amount, partnerId]
    );

    logger.info('Delivery partner payout requested', { partnerId, amount });
    return { requested: true, amount, message: 'Payout will be processed within 24 hours' };
  },
};

// ─────────────────────────────────────────────────────────────
// TOGGLE ONLINE / OFFLINE
// ─────────────────────────────────────────────────────────────
const toggleOnline = async (partnerId, isOnline) => {
  const { rows } = await query(
    `UPDATE delivery_partners
     SET is_online = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING is_online`,
    [isOnline, partnerId]
  );

  if (isOnline) {
    // Mark as available in Redis for fast nearest-partner queries
    await redis.set(`mlb:dp_online:${partnerId}`, '1', 3600);
  } else {
    await redis.del(`mlb:dp_online:${partnerId}`);
  }

  return { is_online: rows[0].is_online };
};

module.exports = {
  DeliveryAuthService,
  LocationService,
  AssignmentService,
  EarningsService,
  toggleOnline,
};
