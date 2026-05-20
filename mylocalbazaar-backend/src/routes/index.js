// src/routes/index.js
// ─────────────────────────────────────────────────────────────
// Master Route Registry — MyLocalBazaar.store
// Company: Catalyst Service Private Limited
// Version: 3.0.0 | Phase 1 + Phase 2 + Phase 3
// Base URL: /api/v1
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();

const { generalLimiter }        = require('../middlewares/rateLimiter.middleware');
const { healthCheck: dbHealth } = require('../config/db');
const { redis }                 = require('../config/redis');

// ─────────────────────────────────────────────────────────────
// HEALTH CHECK  GET /api/v1/health
// ─────────────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
  const [db, redisStatus] = await Promise.all([
    dbHealth(),
    redis.healthCheck(),
  ]);
  res.status(200).json({
    success:     true,
    service:     'MyLocalBazaar API',
    version:     '3.0.0',
    phase:       'Phase 3 — SaaS + AI + Franchise',
    environment: process.env.NODE_ENV,
    timestamp:   new Date().toISOString(),
    services:    { database: db, redis: redisStatus },
  });
});

// Apply general rate limiter to all routes below
router.use(generalLimiter);

// ═════════════════════════════════════════════════════════════
// PHASE 1 — Backend Foundation
// Goals: 1.1 Schema | 1.2 Setup | 1.3 Auth | 1.4 Products
//        1.5 Cart+Orders | 1.6 Admin | 1.7 Homepage | 1.8 Dashboards
// ═════════════════════════════════════════════════════════════

// Goal 1.3 — Authentication (Customer | Merchant | Admin)
router.use('/auth', require('./auth.routes'));

// Goal 1.4 — Categories (Public)
router.use('/categories', require('./category.routes'));

// Goal 1.4 — Area & Merchant Discovery (Public, PostGIS-powered)
const { areaRouter, merchantPubRouter } = require('./area.routes');
router.use('/areas',     areaRouter);
router.use('/merchants', merchantPubRouter);

// Goal 1.4 — Merchant Product Management
router.use('/merchant/products',  require('./product.routes'));

// Goal 1.4 — Merchant Dashboard (Analytics, Orders Feed)
router.use('/merchant/dashboard', require('./merchant.dashboard.routes'));

// Goal 1.5 — Customer Cart
router.use('/cart', require('./cart.routes'));

// Goal 1.5 — Orders (Customer + Merchant Double-Approval Flow)
const { customerOrderRouter, merchantOrderRouter } = require('./order.routes');
router.use('/orders',          customerOrderRouter);
router.use('/merchant/orders', merchantOrderRouter);

// Goal 1.5 — Payments (Razorpay Webhook + History)
router.use('/payments', require('./payment.routes'));

// Goal 1.6 — Admin Panel
// (Merchant KYC | Product Approvals | Order Governance | Analytics | Marketing)
router.use('/admin', require('./admin.routes'));

// ═════════════════════════════════════════════════════════════
// PHASE 2 — Delivery + Notifications + Reviews + Mobile
// Goals: 2.1 Delivery | 2.2 Notifications | 2.3 Reviews/Wallet | 2.4 Mobile APIs
// ═════════════════════════════════════════════════════════════

// Goal 2.1 — Delivery Partner System
// (Auth | GPS Tracking | OTP Verify | Proof Upload | Earnings)
router.use('/delivery', require('./delivery.routes'));

// Goal 2.2 — Push Notifications + SMS Campaigns
// (FCM | Fast2SMS | In-App | Admin Broadcast)
router.use('/notifications', require('./notification.routes'));

// Goal 2.3 — Reviews, Wallet & Coupons
const reviewRoutes = require('./review.routes');
router.use('/reviews', reviewRoutes);
router.use('/wallet',  reviewRoutes.walletRouter);
router.use('/coupons', reviewRoutes.couponRouter);

// Goal 2.4 — Mobile App Aggregated APIs
// (Customer Home | Merchant Dashboard | Delivery Dashboard | Batch GPS)
router.use('/mobile', require('./mobile.routes'));

// ═════════════════════════════════════════════════════════════
// PHASE 3 — SaaS + AI + Franchise + CRM + Multi-City
// Goals: 3.1 SaaS Plans | 3.2 Franchise | 3.3 AI Recs | 3.4 CRM | 3.5 Cities
// ═════════════════════════════════════════════════════════════

// Import all Phase 3 sub-routers from saas.routes.js
const saasRoutes = require('./saas.routes');
const {
  aiRouter,
  franchiseRouter,
  crmRouter,
  cityRouter,
} = saasRoutes;

// Goal 3.1 — SaaS Subscription System
// (Plan Listing | Billing | Feature Gates | Admin Grant)
router.use('/saas', saasRoutes);

// Goal 3.3 — AI Recommendation Engine
// (Personalised Feed | Similar Products | Trending in Area)
router.use('/ai', aiRouter);

// Goal 3.2 — Franchise System
// (Apply | Territory | Onboarding | Earnings)
router.use('/franchise', franchiseRouter);

// Goal 3.4 — CRM & Advanced Analytics
// (RFM Segments | Cohort Analysis | Re-engagement | Platform Health)
router.use('/admin/crm', crmRouter);

// Goal 3.5 — Multi-City Scaling Engine
// (City Onboarding | City Stats | Toggle Active)
router.use('/cities', cityRouter);

// ─────────────────────────────────────────────────────────────
module.exports = router;
