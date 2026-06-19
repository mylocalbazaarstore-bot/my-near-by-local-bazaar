// src/controllers/reviews.controller.js
// ─────────────────────────────────────────────────────────────
// Reviews Controller — MyLocalBazaar.store
//
// ENDPOINTS:
//   POST /reviews                    → Submit review (verified purchase check)
//   GET  /reviews/product/:productId → Product reviews
//   GET  /reviews/merchant/:merchantId → Merchant reviews
//   GET  /reviews/my                 → Own reviews
//   DELETE /reviews/:id              → Delete own review
//   POST /reviews/:id/helpful        → Mark review as helpful
// ─────────────────────────────────────────────────────────────

const { query, queryPaginated } = require('../config/db');
const { success, created, badRequest, notFound, conflict, paginated } = require('../utils/response');
const logger = require('../config/logger');

// ── POST /reviews ─────────────────────────────────────────────
const submitReview = async (req, res) => {
  const { product_id, merchant_id, service_id, order_id, booking_id, rating, title, body } = req.body;
  const userId = req.user.id;

  if (!rating || rating < 1 || rating > 5) {
    return badRequest(res, 'Rating must be between 1 and 5');
  }
  if (!product_id && !merchant_id && !service_id) {
    return badRequest(res, 'Provide at least one of: product_id, merchant_id, or service_id');
  }

  // Verified purchase check — must have a delivered order for this merchant/product
  let isVerified = false;
  if (order_id) {
    const { rows } = await query(
      `SELECT id FROM orders
       WHERE id = $1 AND user_id = $2 AND order_status = 'delivered'`,
      [order_id, userId]
    );
    isVerified = !!rows[0];
  }

  // Prevent duplicate reviews on same entity
  let entityColumn;
  let entityId;
  if (product_id) {
    entityColumn = 'product_id';
    entityId = product_id;
  } else if (merchant_id) {
    entityColumn = 'merchant_id';
    entityId = merchant_id;
  } else {
    entityColumn = 'service_id';
    entityId = service_id;
  }

  const { rows: existing } = await query(
    `SELECT id
     FROM reviews
     WHERE user_id = $1
       AND ${entityColumn} = $2
       AND (order_id = $3 OR order_id IS NULL)
     LIMIT 1`,
    [userId, entityId, order_id || null]
  );
  if (existing[0]) {
    return conflict(res, 'You have already submitted a review for this item');
  }

  const { rows } = await query(
    `INSERT INTO reviews
       (user_id, product_id, merchant_id, service_id, order_id, booking_id,
        rating, title, body, is_verified, is_published)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, true)
     RETURNING id, rating, title, body, is_verified, created_at`,
    [
      userId,
      product_id  || null,
      merchant_id || null,
      service_id  || null,
      order_id    || null,
      booking_id  || null,
      rating, title || null, body || null,
      isVerified,
    ]
  );

  // Update merchant/product aggregate rating
  if (merchant_id) {
    await query(
      `UPDATE merchants
       SET rating       = (SELECT AVG(rating) FROM reviews WHERE merchant_id = $1 AND is_published = true),
           total_reviews = (SELECT COUNT(*) FROM reviews WHERE merchant_id = $1 AND is_published = true),
           updated_at   = NOW()
       WHERE id = $1`,
      [merchant_id]
    );
  }

  logger.info('Review submitted', { userId, reviewId: rows[0].id, rating });
  return created(res, { review: rows[0] }, 'Thank you for your review!');
};

// ── GET /reviews/product/:productId ──────────────────────────
const getProductReviews = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const result = await queryPaginated(
    `SELECT r.id, r.rating, r.title, r.body, r.is_verified, r.created_at,
            u.full_name AS reviewer_name, u.profile_image_url AS reviewer_avatar
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     WHERE r.product_id = $1 AND r.is_published = true
     ORDER BY r.is_verified DESC, r.created_at DESC`,
    [req.params.productId],
    { page, limit }
  );

  // Rating breakdown
  const { rows: breakdown } = await query(
    `SELECT rating, COUNT(*)::int AS count
     FROM reviews WHERE product_id = $1 AND is_published = true
     GROUP BY rating ORDER BY rating DESC`,
    [req.params.productId]
  );

  return res.json({
    success: true,
    data:    result.rows,
    meta:    { ...result, breakdown },
    message: 'Product reviews',
  });
};

// ── GET /reviews/merchant/:merchantId ─────────────────────────
const getMerchantReviews = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const result = await queryPaginated(
    `SELECT r.id, r.rating, r.title, r.body, r.is_verified, r.created_at,
            u.full_name AS reviewer_name
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     WHERE r.merchant_id = $1 AND r.is_published = true
     ORDER BY r.is_verified DESC, r.created_at DESC`,
    [req.params.merchantId],
    { page, limit }
  );
  return paginated(res, result, 'Merchant reviews');
};

// ── GET /reviews/my ──────────────────────────────────────────
const getMyReviews = async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const result = await queryPaginated(
    `SELECT r.id, r.rating, r.title, r.body, r.is_verified, r.created_at,
            p.name AS product_name, m.store_name
     FROM reviews r
     LEFT JOIN products  p ON p.id = r.product_id
     LEFT JOIN merchants m ON m.id = r.merchant_id
     WHERE r.user_id = $1
     ORDER BY r.created_at DESC`,
    [req.user.id],
    { page, limit }
  );
  return paginated(res, result, 'My reviews');
};

// ── DELETE /reviews/:id ───────────────────────────────────────
const deleteReview = async (req, res) => {
  const { rowCount } = await query(
    'UPDATE reviews SET is_published = false WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!rowCount) return notFound(res, 'Review not found');
  return success(res, null, 'Review removed');
};

module.exports = {
  submitReview, getProductReviews, getMerchantReviews, getMyReviews, deleteReview,
};


// ─────────────────────────────────────────────────────────────
// WALLET CONTROLLER
// ─────────────────────────────────────────────────────────────

// GET  /wallet              → Balance + recent transactions
// GET  /wallet/transactions → Full transaction history (paginated)
// POST /wallet/topup        → Initiate Razorpay top-up

const walletController = {

  getWallet: async (req, res) => {
    const { rows } = await query(
      `SELECT w.balance, w.locked_balance, w.total_credited, w.total_debited,
              (SELECT json_agg(t ORDER BY t.created_at DESC)
               FROM (SELECT id, transaction_type, amount, closing_balance,
                            reference_type, description, created_at
                     FROM wallet_transactions WHERE wallet_id = w.id
                     ORDER BY created_at DESC LIMIT 5) t) AS recent_transactions
       FROM wallets w
       WHERE w.owner_id = $1 AND w.owner_type = 'customer'`,
      [req.user.id]
    );

    if (!rows[0]) {
      // Create wallet if doesn't exist
      await query(
        "INSERT INTO wallets (owner_id, owner_type) VALUES ($1, 'customer') ON CONFLICT DO NOTHING",
        [req.user.id]
      );
      return success(res, { wallet: { balance: 0, locked_balance: 0, recent_transactions: [] } });
    }

    return success(res, { wallet: rows[0] });
  },

  getTransactions: async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const { rows: walletRows } = await query(
      "SELECT id FROM wallets WHERE owner_id = $1 AND owner_type = 'customer'",
      [req.user.id]
    );
    if (!walletRows[0]) {
      return paginated(res, {
        rows: [], total: 0, page: Number(page), limit: Number(limit),
        totalPages: 0, hasNext: false, hasPrev: false,
      }, 'Wallet transactions');
    }

    const result = await queryPaginated(
      `SELECT id, transaction_type, amount, closing_balance,
              reference_type, reference_id, description, created_at
       FROM wallet_transactions
       WHERE wallet_id = $1
       ORDER BY created_at DESC`,
      [walletRows[0].id],
      { page, limit }
    );
    return paginated(res, result, 'Wallet transactions');
  },

  initiateTopup: async (req, res) => {
    const { amount } = req.body;
    if (!amount || amount < 10) return badRequest(res, 'Minimum top-up amount is ₹10');
    if (amount > 10000) return badRequest(res, 'Maximum top-up amount is ₹10,000');

    const { createRazorpayOrder } = require('../config/razorpay');
    const order = await createRazorpayOrder({
      amount:  parseFloat(amount),
      receipt: `wallet_${req.user.id.substring(0, 8)}`,
      notes:   { user_id: req.user.id, type: 'wallet_topup' },
    });

    return created(res, {
      razorpay_order_id: order.id,
      amount:            parseFloat(amount),
      key_id:            process.env.NODE_ENV === 'production'
        ? process.env.RAZORPAY_KEY_ID
        : process.env.RAZORPAY_TEST_KEY_ID,
    }, 'Top-up order created. Complete payment to credit wallet.');
  },
};


// ─────────────────────────────────────────────────────────────
// COUPON CONTROLLER (Customer-facing)
// ─────────────────────────────────────────────────────────────

const couponController = {

  // GET /coupons → All active platform coupons visible to customers
  list: async (req, res) => {
    const { merchant_id, category_id } = req.query;
    const params  = [];
    const clauses = [
      "c.is_active = true",
      "c.valid_from <= NOW()",
      "c.valid_until >= NOW()",
    ];

    if (merchant_id) {
      params.push(merchant_id);
      clauses.push(`(c.merchant_id = $${params.length} OR c.merchant_id IS NULL)`);
    }
    if (category_id) {
      params.push(category_id);
      clauses.push(`(c.category_id = $${params.length} OR c.category_id IS NULL)`);
    }

    // Filter out user's exhausted coupons
    params.push(req.user.id);
    clauses.push(`
      (c.uses_per_user IS NULL OR (
        SELECT COUNT(*) FROM coupon_usage cu
        WHERE cu.coupon_id = c.id AND cu.user_id = $${params.length}
      ) < c.uses_per_user)
    `);

    const { rows } = await query(
      `SELECT c.id, c.code, c.description, c.coupon_type,
              c.discount_value, c.max_discount_amount, c.min_order_value,
              c.applicable_for, c.valid_until, c.used_count, c.max_uses,
              m.store_name, cat.name AS category_name
       FROM coupons c
       LEFT JOIN merchants m   ON m.id  = c.merchant_id
       LEFT JOIN categories cat ON cat.id = c.category_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY c.discount_value DESC
       LIMIT 50`,
      params
    );

    return success(res, { coupons: rows });
  },

  // POST /coupons/validate → Preview discount before checkout
  validate: async (req, res) => {
    const { code, merchant_id, subtotal } = req.body;
    if (!code) return badRequest(res, 'Coupon code is required');

    const CouponService = require('../services/coupon.service');
    const result = await CouponService.validate(code, {
      userId:     req.user.id,
      merchantId: merchant_id,
      subtotal:   parseFloat(subtotal || 0),
      isNewUser:  false,
    });

    return success(res, { coupon: result }, 'Coupon is valid!');
  },
};

module.exports.walletController = walletController;
module.exports.couponController = couponController;
