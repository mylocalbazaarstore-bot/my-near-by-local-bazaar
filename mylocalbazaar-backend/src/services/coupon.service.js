// src/services/coupon.service.js
// ─────────────────────────────────────────────────────────────
// Coupon Service — MyLocalBazaar.store
// Validates and applies discount coupons at checkout
// Types: percentage | flat | free_delivery
// ─────────────────────────────────────────────────────────────

const { query, withTransaction } = require('../config/db');
const logger = require('../config/logger');

const CouponService = {

  // ── Validate a coupon code (does NOT persist usage) ───────
  // Returns discount details or throws a descriptive error
  validate: async (code, { userId, merchantId, subtotal, isNewUser = false }) => {
    const { rows } = await query(
      `SELECT c.*,
              cat.name AS category_name
       FROM coupons c
       LEFT JOIN categories cat ON cat.id = c.category_id
       WHERE UPPER(c.code) = UPPER($1)
         AND c.is_active = true
         AND c.valid_from  <= NOW()
         AND c.valid_until >= NOW()
       LIMIT 1`,
      [code]
    );

    const coupon = rows[0];
    if (!coupon) {
      throw Object.assign(
        new Error('Invalid or expired coupon code'),
        { statusCode: 400, code: 'INVALID_COUPON' }
      );
    }

    // Merchant-specific coupon check
    if (coupon.merchant_id && coupon.merchant_id !== merchantId) {
      throw Object.assign(
        new Error('This coupon is not valid for this store'),
        { statusCode: 400, code: 'COUPON_STORE_MISMATCH' }
      );
    }

    // Applicable_for check
    if (coupon.applicable_for === 'new_user' && !isNewUser) {
      throw Object.assign(
        new Error('This coupon is only for first-time customers'),
        { statusCode: 400, code: 'COUPON_NEW_USER_ONLY' }
      );
    }

    // Min order check
    if (subtotal < parseFloat(coupon.min_order_value)) {
      throw Object.assign(
        new Error(`Minimum order of ₹${coupon.min_order_value} required for this coupon`),
        { statusCode: 400, code: 'COUPON_MIN_ORDER' }
      );
    }

    // Global usage limit
    if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
      throw Object.assign(
        new Error('This coupon has reached its usage limit'),
        { statusCode: 400, code: 'COUPON_EXHAUSTED' }
      );
    }

    // Per-user usage limit
    if (coupon.uses_per_user !== null) {
      const { rows: usageRows } = await query(
        'SELECT COUNT(*) AS cnt FROM coupon_usage WHERE coupon_id = $1 AND user_id = $2',
        [coupon.id, userId]
      );
      if (parseInt(usageRows[0].cnt) >= coupon.uses_per_user) {
        throw Object.assign(
          new Error('You have already used this coupon the maximum number of times'),
          { statusCode: 400, code: 'COUPON_USER_LIMIT' }
        );
      }
    }

    // Calculate discount amount
    let discountAmount = 0;
    let freeDelivery   = false;

    if (coupon.coupon_type === 'percentage') {
      discountAmount = (subtotal * parseFloat(coupon.discount_value)) / 100;
      if (coupon.max_discount_amount) {
        discountAmount = Math.min(discountAmount, parseFloat(coupon.max_discount_amount));
      }
    } else if (coupon.coupon_type === 'flat') {
      discountAmount = Math.min(parseFloat(coupon.discount_value), subtotal);
    } else if (coupon.coupon_type === 'free_delivery') {
      freeDelivery = true;
    }

    discountAmount = parseFloat(discountAmount.toFixed(2));

    return {
      coupon_id:       coupon.id,
      code:            coupon.code,
      description:     coupon.description,
      coupon_type:     coupon.coupon_type,
      discount_value:  parseFloat(coupon.discount_value),
      discount_amount: discountAmount,
      free_delivery:   freeDelivery,
      max_discount:    coupon.max_discount_amount,
      valid: true,
    };
  },

  // ── Record coupon usage (called inside order transaction) ──
  recordUsage: async (client, couponId, userId, orderId) => {
    await client.query(
      `INSERT INTO coupon_usage (coupon_id, user_id, order_id) VALUES ($1, $2, $3)`,
      [couponId, userId, orderId]
    );
    await client.query(
      `UPDATE coupons SET used_count = used_count + 1 WHERE id = $1`,
      [couponId]
    );
  },
};

module.exports = CouponService;
