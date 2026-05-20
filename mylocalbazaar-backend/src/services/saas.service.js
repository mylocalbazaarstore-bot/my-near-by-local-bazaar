// src/services/saas.service.js
// ─────────────────────────────────────────────────────────────
// SaaS Subscription Service — MyLocalBazaar.store
//
// Plan Tiers:
//   Free       → ₹0    | 10 products  | basic features
//   Basic      → ₹499  | 100 products | analytics + WhatsApp
//   Pro        → ₹999  | Unlimited    | sponsored ads + priority
//   Enterprise → ₹2499 | Unlimited    | white-label + API + manager
//
// Feature Gates:
//   Every merchant action checks their plan limits before proceeding.
//   Prevents free merchants from exceeding product limits, using ads etc.
// ─────────────────────────────────────────────────────────────

const { query, withTransaction } = require('../config/db');
const { createRazorpayOrder, verifyPaymentSignature } = require('../config/razorpay');
const { redis }  = require('../config/redis');
const logger     = require('../config/logger');
const { PLAN_LIMITS, PLAN_PRICES } = require('../validators/saas.validator');

// ── Cache key ─────────────────────────────────────────────────
const planCacheKey = (merchantId) => `mlb:merchant_plan:${merchantId}`;

// ─────────────────────────────────────────────────────────────
// PLAN INFORMATION
// ─────────────────────────────────────────────────────────────
const PlanService = {

  // Get merchant's current active plan (with Redis cache)
  getCurrentPlan: async (merchantId) => {
    const cached = await redis.get(planCacheKey(merchantId));
    if (cached) return cached;

    const { rows } = await query(
      `SELECT
         m.subscription_plan AS plan,
         m.subscription_expires_at,
         ms.id AS subscription_id,
         ms.price, ms.started_at, ms.expires_at, ms.is_active,
         CASE
           WHEN m.subscription_expires_at IS NULL THEN true
           WHEN m.subscription_expires_at > NOW() THEN true
           ELSE false
         END AS is_valid
       FROM merchants m
       LEFT JOIN merchant_subscriptions ms
         ON ms.merchant_id = m.id AND ms.is_active = true
       WHERE m.id = $1
       ORDER BY ms.started_at DESC LIMIT 1`,
      [merchantId]
    );

    if (!rows[0]) return null;

    const planData = {
      ...rows[0],
      limits:  PLAN_LIMITS[rows[0].plan] || PLAN_LIMITS.free,
      prices:  PLAN_PRICES[rows[0].plan] || PLAN_PRICES.free,
    };

    // Cache for 10 minutes
    await redis.set(planCacheKey(merchantId), planData, 600);
    return planData;
  },

  // Get all plan details for display
  getAllPlans: () => {
    return [
      {
        plan:        'free',
        name:        'Free Starter',
        price:       PLAN_PRICES.free,
        description: 'Get started with MyLocalBazaar at zero cost',
        limits:      PLAN_LIMITS.free,
        features: [
          '✅ Up to 10 products',
          '✅ Basic order management',
          '✅ Customer reviews',
          '❌ Analytics dashboard',
          '❌ Sponsored ads',
          '❌ WhatsApp catalog',
          '❌ Priority support',
        ],
        badge:    null,
        cta:      'Start Free',
      },
      {
        plan:        'basic',
        name:        'Basic Growth',
        price:       PLAN_PRICES.basic,
        description: 'For growing local businesses',
        limits:      PLAN_LIMITS.basic,
        features: [
          '✅ Up to 100 products',
          '✅ Sales analytics dashboard',
          '✅ WhatsApp catalog integration',
          '✅ Customer insights',
          '✅ Bulk product upload',
          '❌ Sponsored ads',
          '❌ Priority support',
        ],
        badge:    'Popular',
        cta:      'Upgrade to Basic',
      },
      {
        plan:        'pro',
        name:        'Pro Scale',
        price:       PLAN_PRICES.pro,
        description: 'Unlimited products, maximum visibility',
        limits:      PLAN_LIMITS.pro,
        features: [
          '✅ Unlimited products',
          '✅ Sponsored ads & promotions',
          '✅ Advanced analytics + heatmaps',
          '✅ WhatsApp catalog',
          '✅ Priority customer support',
          '✅ Custom loyalty programs',
          '✅ Early access to new features',
        ],
        badge:    'Best Value',
        cta:      'Go Pro',
      },
      {
        plan:        'enterprise',
        name:        'Enterprise',
        price:       PLAN_PRICES.enterprise,
        description: 'White-label solution for large businesses',
        limits:      PLAN_LIMITS.enterprise,
        features: [
          '✅ Everything in Pro',
          '✅ White-label branding',
          '✅ Dedicated account manager',
          '✅ API access',
          '✅ Custom integrations',
          '✅ SLA guarantee',
          '✅ Multi-store management',
        ],
        badge:    'Enterprise',
        cta:      'Contact Sales',
      },
    ];
  },
};

// ─────────────────────────────────────────────────────────────
// FEATURE GATE SERVICE
// Middleware-friendly checks before protected actions
// ─────────────────────────────────────────────────────────────
const FeatureGate = {

  // Check if merchant can add more products
  canAddProduct: async (merchantId) => {
    const plan = await PlanService.getCurrentPlan(merchantId);
    if (!plan) return { allowed: true }; // default allow

    const { max_products } = plan.limits;
    if (max_products === -1) return { allowed: true }; // unlimited

    const { rows } = await query(
      `SELECT COUNT(*) AS cnt FROM products
       WHERE merchant_id = $1 AND product_status NOT IN ('archived')`,
      [merchantId]
    );

    const current = parseInt(rows[0].cnt);
    if (current >= max_products) {
      return {
        allowed: false,
        reason:  `Your ${plan.plan} plan allows ${max_products} products. You have ${current}. Upgrade to add more.`,
        current_count: current,
        max_allowed:   max_products,
        upgrade_to:    plan.plan === 'free' ? 'basic' : 'pro',
      };
    }

    return {
      allowed: true,
      current_count: current,
      max_allowed:   max_products,
      remaining:     max_products - current,
    };
  },

  // Check if merchant can use sponsored ads
  canUseAds: async (merchantId) => {
    const plan = await PlanService.getCurrentPlan(merchantId);
    if (!plan?.limits?.ads) {
      return {
        allowed:    false,
        reason:     'Sponsored ads require a Pro or Enterprise plan. Upgrade to boost your products.',
        upgrade_to: 'pro',
      };
    }
    return { allowed: true };
  },

  // Check if merchant can access analytics
  canViewAnalytics: async (merchantId) => {
    const plan = await PlanService.getCurrentPlan(merchantId);
    if (!plan?.limits?.analytics) {
      return {
        allowed:    false,
        reason:     'Advanced analytics require Basic plan or above.',
        upgrade_to: 'basic',
      };
    }
    return { allowed: true };
  },

  // Check if merchant can use WhatsApp integration
  canUseWhatsApp: async (merchantId) => {
    const plan = await PlanService.getCurrentPlan(merchantId);
    if (!plan?.limits?.whatsapp) {
      return {
        allowed:    false,
        reason:     'WhatsApp catalog requires Basic plan or above.',
        upgrade_to: 'basic',
      };
    }
    return { allowed: true };
  },

  // Check if merchant can upload images (limit per plan)
  canUploadImages: async (merchantId, productId) => {
    const plan = await PlanService.getCurrentPlan(merchantId);
    const maxImages = plan?.limits?.max_images_per_product || 2;

    const { rows } = await query(
      'SELECT COUNT(*) AS cnt FROM product_images WHERE product_id = $1',
      [productId]
    );

    const current = parseInt(rows[0].cnt);
    if (current >= maxImages) {
      return {
        allowed: false,
        reason:  `Your ${plan.plan} plan allows ${maxImages} images per product. Upgrade for more.`,
        upgrade_to: plan.plan === 'free' ? 'basic' : 'pro',
      };
    }

    return { allowed: true, current, max: maxImages };
  },
};

// ─────────────────────────────────────────────────────────────
// BILLING SERVICE
// ─────────────────────────────────────────────────────────────
const BillingService = {

  // Create Razorpay subscription payment order
  createPaymentOrder: async (merchantId, plan, billing = 'monthly') => {
    if (plan === 'free') {
      throw Object.assign(
        new Error('Free plan does not require payment'),
        { statusCode: 400 }
      );
    }

    const amount = PLAN_PRICES[plan]?.[billing];
    if (!amount) {
      throw Object.assign(new Error('Invalid plan or billing period'), { statusCode: 400 });
    }

    const { rows: merchant } = await query(
      'SELECT store_name, email FROM merchants WHERE id = $1', [merchantId]
    );

    const razorpayOrder = await createRazorpayOrder({
      amount,
      receipt: `sub_${merchantId.substring(0, 8)}_${plan}`,
      notes: {
        merchant_id: merchantId,
        plan,
        billing,
        type: 'subscription',
      },
    });

    // Cache pending subscription details
    await redis.set(
      `mlb:pending_sub:${merchantId}`,
      { plan, billing, razorpay_order_id: razorpayOrder.id, amount },
      900 // 15 min
    );

    logger.info('Subscription payment order created', { merchantId, plan, billing, amount });

    return {
      razorpay_order_id: razorpayOrder.id,
      amount,
      plan,
      billing,
      currency: 'INR',
    };
  },

  // Activate subscription after payment verification
  activateSubscription: async (merchantId, { plan, billing, razorpay_order_id, razorpay_payment_id, razorpay_signature }) => {
    // Verify payment signature
    const isValid = verifyPaymentSignature({
      razorpayOrderId:   razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });

    if (!isValid) {
      throw Object.assign(
        new Error('Payment verification failed. Invalid signature.'),
        { statusCode: 400 }
      );
    }

    const amount      = PLAN_PRICES[plan][billing];
    const durationDays = billing === 'annual' ? 365 : 30;
    const expiresAt   = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

    return withTransaction(async (client) => {
      // Deactivate old subscription
      await client.query(
        'UPDATE merchant_subscriptions SET is_active = false WHERE merchant_id = $1',
        [merchantId]
      );

      // Create new subscription record
      const { rows } = await client.query(
        `INSERT INTO merchant_subscriptions
           (merchant_id, plan, price, started_at, expires_at, is_active)
         VALUES ($1, $2, $3, NOW(), $4, true)
         RETURNING id, plan, price, started_at, expires_at`,
        [merchantId, plan, amount, expiresAt]
      );

      // Update merchant plan
      await client.query(
        `UPDATE merchants
         SET subscription_plan       = $1,
             subscription_expires_at = $2,
             updated_at              = NOW()
         WHERE id = $3`,
        [plan, expiresAt, merchantId]
      );

      // Clear plan cache
      await redis.del(planCacheKey(merchantId));

      logger.info('Subscription activated', { merchantId, plan, billing, expiresAt });

      return {
        subscription: rows[0],
        plan,
        expires_at: expiresAt,
        message: `🎉 ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan activated successfully!`,
      };
    });
  },

  // Downgrade to free plan
  cancelToPlan: async (merchantId, reason = '') => {
    await query(
      `UPDATE merchant_subscriptions SET is_active = false WHERE merchant_id = $1`,
      [merchantId]
    );

    await query(
      `UPDATE merchants
       SET subscription_plan = 'free', subscription_expires_at = NULL, updated_at = NOW()
       WHERE id = $1`,
      [merchantId]
    );

    await redis.del(planCacheKey(merchantId));
    logger.info('Subscription cancelled → free', { merchantId, reason });

    return { cancelled: true, new_plan: 'free' };
  },

  // Admin grants plan (for promotions, partnerships)
  adminGrantPlan: async (adminId, merchantId, plan, months, reason) => {
    const expiresAt = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000);

    await withTransaction(async (client) => {
      await client.query(
        'UPDATE merchant_subscriptions SET is_active = false WHERE merchant_id = $1',
        [merchantId]
      );

      await client.query(
        `INSERT INTO merchant_subscriptions
           (merchant_id, plan, price, started_at, expires_at, is_active)
         VALUES ($1, $2, 0, NOW(), $3, true)`,
        [merchantId, plan, expiresAt]
      );

      await client.query(
        `UPDATE merchants SET subscription_plan = $1, subscription_expires_at = $2 WHERE id = $3`,
        [plan, expiresAt, merchantId]
      );

      await client.query(
        `INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, new_values)
         VALUES ($1, 'granted_subscription', 'merchants', $2, $3)`,
        [adminId, merchantId, JSON.stringify({ plan, months, reason })]
      );
    });

    await redis.del(planCacheKey(merchantId));
    logger.info('Plan granted by admin', { adminId, merchantId, plan, months });

    return { granted: true, plan, expires_at: expiresAt };
  },

  // Get subscription history for a merchant
  getHistory: async (merchantId) => {
    const { rows } = await query(
      `SELECT id, plan, price, started_at, expires_at, is_active, created_at
       FROM merchant_subscriptions
       WHERE merchant_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [merchantId]
    );
    return rows;
  },

  // Check and expire subscriptions (called by cron job)
  expireSubscriptions: async () => {
    const { rows, rowCount } = await query(
      `UPDATE merchants
       SET subscription_plan = 'free'
       WHERE subscription_expires_at < NOW()
         AND subscription_plan != 'free'
       RETURNING id`
    );

    if (rowCount > 0) {
      // Clear caches for expired merchants
      await Promise.all(rows.map((r) => redis.del(planCacheKey(r.id))));
      logger.info(`Expired ${rowCount} subscriptions → downgraded to free`);
    }

    return { expired: rowCount };
  },

  // Platform-wide subscription revenue stats (admin)
  getRevenueStats: async () => {
    const { rows } = await query(
      `SELECT
         m.subscription_plan AS plan,
         COUNT(*) AS merchant_count,
         SUM(ms.price) AS total_revenue
       FROM merchants m
       LEFT JOIN merchant_subscriptions ms
         ON ms.merchant_id = m.id AND ms.is_active = true
       GROUP BY m.subscription_plan
       ORDER BY total_revenue DESC NULLS LAST`
    );

    return rows.map((r) => ({
      plan:           r.plan,
      merchant_count: parseInt(r.merchant_count),
      total_revenue:  parseFloat(r.total_revenue || 0),
    }));
  },
};

module.exports = { PlanService, FeatureGate, BillingService };
