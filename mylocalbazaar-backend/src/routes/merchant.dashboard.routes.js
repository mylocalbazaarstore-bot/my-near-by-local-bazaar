// src/routes/merchant.dashboard.routes.js
// ─────────────────────────────────────────────────────────────
// Merchant Dashboard Routes — MyLocalBazaar.store
// Base: /api/v1/merchant/dashboard
// All routes: authenticate + authorize('merchant')
// ─────────────────────────────────────────────────────────────

const express    = require('express');
const router     = express.Router();
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { validate }                = require('../middlewares/validate.middleware');
const dashCtrl   = require('../controllers/merchant/dashboard.controller');
const V          = require('../validators/product.validator');

router.use(authenticate, authorize('merchant'));

router.get('/overview',          validate(V.dashboardOverview, 'query'), dashCtrl.getOverview);
router.get('/revenue-trend',     validate(V.dashboardOverview, 'query'), dashCtrl.getRevenueTrend);
router.get('/top-products',      validate(V.dashboardOverview, 'query'), dashCtrl.getTopProducts);
router.get('/recent-orders',     validate(V.recentOrders,     'query'), dashCtrl.getRecentOrders);
router.get('/pending',                                                    dashCtrl.getPendingApprovals);
router.get('/bookings',          validate(V.dashboardOverview, 'query'), dashCtrl.getBookingSummary);
router.get('/low-stock',                                                  dashCtrl.getLowStock);
router.get('/profile-checklist',                                          dashCtrl.getProfileChecklist);

module.exports = router;
