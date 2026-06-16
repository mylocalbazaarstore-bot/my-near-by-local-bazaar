// src/routes/saas.routes.js
// ─────────────────────────────────────────────────────────────
// Phase 3 — SaaS + AI + Franchise + CRM + City Routes
// MyLocalBazaar.store
// ─────────────────────────────────────────────────────────────

const express = require('express');
const { authenticate, authorize, restrictToAdminIPs } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const V  = require('../validators/saas.validator');

// ═══════════════════════════════════════════════════════════════
// 1. SAAS SUBSCRIPTION ROUTES — /api/v1/saas
// ═══════════════════════════════════════════════════════════════
const saasRouter = express.Router();
const subCtrl    = require('../controllers/saas/subscription.controller');

// Public — plan listing
saasRouter.get('/plans', subCtrl.getPlans);

// Merchant protected
const mAuth = [authenticate, authorize('merchant')];
saasRouter.get('/my-plan',                    ...mAuth, subCtrl.getMyPlan);
saasRouter.post('/subscribe',                 ...mAuth, validate(V.selectPlan), subCtrl.subscribe);
saasRouter.post('/subscribe/verify',          ...mAuth, validate(V.verifySubscriptionPayment), subCtrl.verifySubscription);
saasRouter.post('/cancel',                    ...mAuth, validate(V.cancelSubscription), subCtrl.cancelSubscription);
saasRouter.get('/billing-history',            ...mAuth, subCtrl.getBillingHistory);
saasRouter.get('/feature-check/:feature',     ...mAuth, subCtrl.checkFeature);

// Admin only
const aAuth = [restrictToAdminIPs, authenticate, authorize('admin')];
saasRouter.get('/admin/revenue',              ...aAuth, subCtrl.getRevenueStats);
saasRouter.post('/admin/grant',               ...aAuth, validate(V.adminGrantPlan), subCtrl.adminGrantPlan);
saasRouter.post('/admin/expire',              ...aAuth, subCtrl.triggerExpiry);

module.exports = saasRouter;


// ═══════════════════════════════════════════════════════════════
// 2. AI RECOMMENDATION ROUTES — /api/v1/ai
// ═══════════════════════════════════════════════════════════════
const aiRouter = express.Router();
const aiCtrl   = require('../controllers/ai/recommendation.controller');

// Optional auth (personalised if logged in, popular if not)
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next();
  const { authenticate: auth } = require('../middlewares/auth.middleware');
  auth(req, res, (err) => next()); // ignore auth errors
};

aiRouter.get('/recommendations',              optionalAuth, aiCtrl.getRecommendations);
aiRouter.get('/recommendations/trending',     optionalAuth, aiCtrl.getTrending);
aiRouter.get('/recommendations/similar/:productId', aiCtrl.getSimilar);
aiRouter.post('/recommendations/invalidate',  authenticate, aiCtrl.invalidateCache);

module.exports.aiRouter = aiRouter;


// ═══════════════════════════════════════════════════════════════
// 3. FRANCHISE ROUTES — /api/v1/franchise
// ═══════════════════════════════════════════════════════════════
const franchiseRouter = express.Router();
const { franchiseController: fCtrl } = require('../controllers/ai/recommendation.controller');

// Public
franchiseRouter.post('/apply',                validate(V.franchiseApply), fCtrl.apply);
franchiseRouter.get('/territories',           fCtrl.getTerritories);
franchiseRouter.get('/:id/earnings',          ...aAuth, fCtrl.getEarnings);

// Admin only
franchiseRouter.get('/admin/applications',    ...aAuth, fCtrl.listApplications);
franchiseRouter.post('/admin/onboard/:id',    ...aAuth, validate(V.franchiseOnboard), fCtrl.onboard);
franchiseRouter.post('/admin/reject/:id',     ...aAuth, (req, res, next) => {
  if (!req.body.reason) return res.status(422).json({ success: false, message: 'reason is required' });
  next();
}, fCtrl.reject);

module.exports.franchiseRouter = franchiseRouter;


// ═══════════════════════════════════════════════════════════════
// 4. CRM ROUTES — /api/v1/admin/crm
// ═══════════════════════════════════════════════════════════════
const crmRouter = express.Router();
const { crmController: crmCtrl } = require('../controllers/ai/recommendation.controller');

crmRouter.use(...aAuth);
crmRouter.get('/summary',         crmCtrl.getSummary);
crmRouter.get('/segments',        validate(V.segmentQuery, 'query'), crmCtrl.getSegment);
crmRouter.get('/cohort',          crmCtrl.getCohort);
crmRouter.get('/re-engagement',   crmCtrl.getReEngagement);
crmRouter.get('/health',          crmCtrl.getPlatformHealth);

module.exports.crmRouter = crmRouter;


// ═══════════════════════════════════════════════════════════════
// 5. MULTI-CITY ROUTES — /api/v1/cities
// ═══════════════════════════════════════════════════════════════
const cityRouter = express.Router();
const { cityController: cityCtrl } = require('../controllers/ai/recommendation.controller');

// Public
cityRouter.get('/',                           cityCtrl.listCities);

// Admin only
cityRouter.post('/',                          ...aAuth, validate(V.onboardCity), cityCtrl.onboardCity);
cityRouter.get('/:id/stats',                  ...aAuth, cityCtrl.getCityStats);
cityRouter.patch('/:id/toggle',               ...aAuth, cityCtrl.toggleCity);

module.exports.cityRouter = cityRouter;


// ─────────────────────────────────────────────────────────────
// Re-export all routers for index.js
// ─────────────────────────────────────────────────────────────
const { aiRouter: ai } = module.exports;
const { franchiseRouter: fr } = module.exports;
const { crmRouter: crm } = module.exports;
const { cityRouter: city } = module.exports;

module.exports.default = saasRouter;
