// src/controllers/saas/subscription.controller.js
// ─────────────────────────────────────────────────────────────
// SaaS Subscription Controller — MyLocalBazaar.store
//
// MERCHANT ENDPOINTS:
//   GET  /saas/plans                  → All plans with features + pricing
//   GET  /saas/my-plan                → Current plan + limits + usage
//   POST /saas/subscribe              → Create payment order for plan
//   POST /saas/subscribe/verify       → Verify payment → activate plan
//   POST /saas/cancel                 → Downgrade to free
//   GET  /saas/billing-history        → Subscription history
//   GET  /saas/feature-check/:feature → Check if feature is available
//
// ADMIN ENDPOINTS:
//   GET  /saas/admin/revenue          → Subscription revenue stats
//   POST /saas/admin/grant            → Grant plan to merchant (free)
//   POST /saas/admin/expire           → Manually trigger expiry check
// ─────────────────────────────────────────────────────────────

const { PlanService, FeatureGate, BillingService } = require('../../services/saas.service');
const { query } = require('../../config/db');
const { success, created, badRequest, notFound } = require('../../utils/response');
const logger = require('../../config/logger');

// ── GET /saas/plans ───────────────────────────────────────────
const getPlans = async (req, res) => {
  const plans = PlanService.getAllPlans();
  return success(res, { plans }, 'Subscription plans');
};

// ── GET /saas/my-plan ─────────────────────────────────────────
const getMyPlan = async (req, res) => {
  const merchantId = req.user.id;
  const plan = await PlanService.getCurrentPlan(merchantId);

  if (!plan) return notFound(res, 'Merchant not found');

  // Compute current usage
  const { rows: productCount } = await query(
    `SELECT COUNT(*) AS cnt FROM products
     WHERE merchant_id = $1 AND product_status NOT IN ('archived')`,
    [merchantId]
  );

  const { rows: adCount } = await query(
    `SELECT COUNT(*) AS cnt FROM sponsored_ads
     WHERE merchant_id = $1 AND is_active = true`,
    [merchantId]
  );

  const currentUsage = {
    products:      parseInt(productCount[0].cnt),
    active_ads:    parseInt(adCount[0].cnt),
  };

  const daysRemaining = plan.expires_at
    ? Math.max(0, Math.ceil((new Date(plan.expires_at) - new Date()) / (1000 * 60 * 60 * 24)))
    : null;

  return success(res, {
    plan: {
      ...plan,
      current_usage:  currentUsage,
      days_remaining: daysRemaining,
      is_expiring_soon: daysRemaining !== null && daysRemaining <= 7,
    },
  }, 'Current subscription plan');
};

// ── POST /saas/subscribe ──────────────────────────────────────
// Creates Razorpay payment order for plan upgrade
const subscribe = async (req, res) => {
  const { plan, billing = 'monthly' } = req.body;
  const merchantId = req.user.id;

  // Free plan doesn't need payment
  if (plan === 'free') {
    await BillingService.cancelToPlan(merchantId, 'Downgraded to free voluntarily');
    return success(res, { plan: 'free' }, 'Switched to Free plan');
  }

  const order = await BillingService.createPaymentOrder(merchantId, plan, billing);

  return created(res, {
    payment_order: order,
    key_id: process.env.NODE_ENV === 'production'
      ? process.env.RAZORPAY_KEY_ID
      : process.env.RAZORPAY_TEST_KEY_ID,
    message: `Complete payment to activate ${plan} plan`,
  }, 'Payment order created');
};

// ── POST /saas/subscribe/verify ───────────────────────────────
const verifySubscription = async (req, res) => {
  const merchantId = req.user.id;
  const result = await BillingService.activateSubscription(merchantId, req.body);

  // Send confirmation notification
  await query(
    `INSERT INTO notifications
       (recipient_id, recipient_type, notification_type, title, body, data)
     VALUES ($1, 'merchant', 'system', $2, $3, $4)`,
    [
      merchantId,
      `🎉 ${result.plan} Plan Activated!`,
      `Your MyLocalBazaar ${result.plan} subscription is now active. Enjoy your new features!`,
      JSON.stringify({ plan: result.plan, expires_at: result.expires_at }),
    ]
  );

  return success(res, result, result.message);
};

// ── POST /saas/cancel ─────────────────────────────────────────
const cancelSubscription = async (req, res) => {
  const { reason } = req.body;
  const result = await BillingService.cancelToPlan(req.user.id, reason);
  return success(res, result,
    'Subscription cancelled. Your plan will remain active until the billing period ends, then revert to Free.'
  );
};

// ── GET /saas/billing-history ─────────────────────────────────
const getBillingHistory = async (req, res) => {
  const history = await BillingService.getHistory(req.user.id);
  return success(res, { history }, 'Billing history');
};

// ── GET /saas/feature-check/:feature ─────────────────────────
// Used by frontend to show upgrade prompts before gated actions
const checkFeature = async (req, res) => {
  const { feature } = req.params;
  const merchantId  = req.user.id;

  let result;
  switch (feature) {
    case 'add_product':  result = await FeatureGate.canAddProduct(merchantId);  break;
    case 'ads':          result = await FeatureGate.canUseAds(merchantId);      break;
    case 'analytics':    result = await FeatureGate.canViewAnalytics(merchantId); break;
    case 'whatsapp':     result = await FeatureGate.canUseWhatsApp(merchantId); break;
    default:
      return badRequest(res, `Unknown feature: ${feature}. Valid: add_product, ads, analytics, whatsapp`);
  }

  return success(res, { feature, ...result });
};

// ─────────────────────────────────────────────────────────────
// ADMIN ENDPOINTS
// ─────────────────────────────────────────────────────────────

// ── GET /saas/admin/revenue ───────────────────────────────────
const getRevenueStats = async (req, res) => {
  const stats = await BillingService.getRevenueStats();

  // Total MRR (Monthly Recurring Revenue)
  const mrr = stats.reduce((sum, s) => {
    const { PLAN_PRICES } = require('../../validators/saas.validator');
    return sum + (PLAN_PRICES[s.plan]?.monthly || 0) * s.merchant_count;
  }, 0);

  return success(res, {
    stats,
    mrr,
    arr: mrr * 12,
  }, 'Subscription revenue stats');
};

// ── POST /saas/admin/grant ────────────────────────────────────
const adminGrantPlan = async (req, res) => {
  const { merchant_id, plan, months, reason } = req.body;
  const result = await BillingService.adminGrantPlan(req.user.id, merchant_id, plan, months, reason);
  return success(res, result, `${plan} plan granted to merchant for ${months} month(s)`);
};

// ── POST /saas/admin/expire ───────────────────────────────────
const triggerExpiry = async (req, res) => {
  const result = await BillingService.expireSubscriptions();
  return success(res, result, `${result.expired} subscriptions expired and downgraded to free`);
};

module.exports = {
  getPlans, getMyPlan, subscribe, verifySubscription,
  cancelSubscription, getBillingHistory, checkFeature,
  getRevenueStats, adminGrantPlan, triggerExpiry,
};
