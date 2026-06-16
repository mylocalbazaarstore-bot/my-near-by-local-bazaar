// src/validators/saas.validator.js
// ─────────────────────────────────────────────────────────────
// SaaS Subscription Validators — MyLocalBazaar.store
// Covers: Plan selection | Payment | Upgrade/downgrade |
//         Feature gate checks | Franchise application
// ─────────────────────────────────────────────────────────────

const Joi = require('joi');

const uuid = Joi.string().uuid({ version: 'uuidv4' });

// ── Subscription Plans ────────────────────────────────────────
const PLANS = ['free', 'basic', 'pro', 'enterprise'];

const PLAN_LIMITS = {
  free:       { max_products: 10,  max_images_per_product: 2,  ads: false, analytics: false, whatsapp: false },
  basic:      { max_products: 100, max_images_per_product: 5,  ads: false, analytics: true,  whatsapp: true  },
  pro:        { max_products: -1,  max_images_per_product: 8,  ads: true,  analytics: true,  whatsapp: true  },
  enterprise: { max_products: -1,  max_images_per_product: 8,  ads: true,  analytics: true,  whatsapp: true  },
};

const PLAN_PRICES = {
  free:       { monthly: 0,    annual: 0     },
  basic:      { monthly: 499,  annual: 4990  },
  pro:        { monthly: 999,  annual: 9990  },
  enterprise: { monthly: 2499, annual: 24990 },
};

// ── Select / Upgrade Plan ─────────────────────────────────────
const selectPlan = Joi.object({
  plan:     Joi.string().valid(...PLANS).required()
    .messages({ 'any.required': 'Subscription plan is required' }),
  billing:  Joi.string().valid('monthly', 'annual').default('monthly'),
  // For paid plans, Razorpay payment details come after
});

// ── Verify Subscription Payment ───────────────────────────────
const verifySubscriptionPayment = Joi.object({
  plan:                Joi.string().valid(...PLANS).required(),
  billing:             Joi.string().valid('monthly', 'annual').required(),
  razorpay_order_id:   Joi.string().required(),
  razorpay_payment_id: Joi.string().required(),
  razorpay_signature:  Joi.string().required(),
});

// ── Cancel Subscription ───────────────────────────────────────
const cancelSubscription = Joi.object({
  reason: Joi.string().max(500).optional().allow(''),
});

// ── Admin: Grant Free Plan ────────────────────────────────────
const adminGrantPlan = Joi.object({
  merchant_id:  uuid.required(),
  plan:         Joi.string().valid(...PLANS).required(),
  months:       Joi.number().integer().min(1).max(24).default(1),
  reason:       Joi.string().max(300).optional().allow(''),
});

// ── Franchise Application ─────────────────────────────────────
const franchiseApply = Joi.object({
  applicant_name:  Joi.string().min(2).max(200).trim().required(),
  email:           Joi.string().email().required(),
  phone:           Joi.string().pattern(/^[6-9]\d{9}$/).required(),
  city:            Joi.string().min(2).max(100).trim().required(),
  state:           Joi.string().min(2).max(100).trim().required(),
  investment_capacity: Joi.number().min(50000).required()
    .messages({ 'number.min': 'Minimum investment capacity is ₹50,000' }),
  business_experience: Joi.string().max(500).optional().allow(''),
  message:         Joi.string().max(1000).optional().allow(''),
});

// ── Franchise Onboarding (Admin approves) ─────────────────────
const franchiseOnboard = Joi.object({
  territory_name:   Joi.string().min(2).max(200).required(),
  territory_city:   Joi.string().min(2).max(100).required(),
  territory_state:  Joi.string().min(2).max(100).required(),
  revenue_share_pct: Joi.number().min(1).max(50).required()
    .messages({ 'number.min': 'Revenue share must be at least 1%' }),
  contract_months:  Joi.number().integer().min(6).max(60).default(12),
  notes:            Joi.string().max(500).optional(),
});

// ── AI Recommendation request ─────────────────────────────────
const recommendationQuery = Joi.object({
  limit:     Joi.number().integer().min(1).max(20).default(10),
  context:   Joi.string().valid('home', 'cart', 'product', 'category').default('home'),
  product_id: uuid.optional(),  // For "similar products" context
  category_id: uuid.optional(), // For category-based recommendations
});

// ── CRM Segmentation query ────────────────────────────────────
const segmentQuery = Joi.object({
  segment: Joi.string()
    .valid('champions', 'loyal', 'at_risk', 'new', 'inactive', 'all')
    .default('all'),
  area_id:  uuid.optional(),
  from_date: Joi.date().iso().optional(),
  to_date:   Joi.date().iso().optional(),
  page:      Joi.number().integer().min(1).default(1),
  limit:     Joi.number().integer().min(1).max(100).default(20),
});

// ── Multi-city: New city onboarding ──────────────────────────
const onboardCity = Joi.object({
  name:        Joi.string().min(2).max(100).trim().required(),
  state:       Joi.string().min(2).max(100).trim().required(),
  country:     Joi.string().default('India'),
  launch_date: Joi.date().min('now').optional(),
  manager_name:  Joi.string().max(200).optional(),
  manager_email: Joi.string().email().optional(),
  manager_phone: Joi.string().pattern(/^[6-9]\d{9}$/).optional(),
});

module.exports = {
  selectPlan, verifySubscriptionPayment, cancelSubscription, adminGrantPlan,
  franchiseApply, franchiseOnboard,
  recommendationQuery, segmentQuery, onboardCity,
  PLAN_LIMITS, PLAN_PRICES, PLANS,
};
