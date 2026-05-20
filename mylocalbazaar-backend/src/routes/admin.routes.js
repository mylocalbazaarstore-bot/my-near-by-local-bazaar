// src/routes/admin.routes.js
// ─────────────────────────────────────────────────────────────
// Admin Panel Routes — MyLocalBazaar.store
// Base: /api/v1/admin
//
// SECURITY CHAIN on every request:
//   restrictToAdminIPs → authenticate → authorize('admin') → controller
//
// Sub-groups:
//   /admin/merchants   → Merchant management + KYC + settlements
//   /admin/products    → Product approvals + featured management
//   /admin/customers   → Customer management + wallet adjustments
//   /admin/orders      → Order governance + overrides + refunds
//   /admin/complaints  → Ticket management + resolution
//   /admin/analytics   → Platform KPIs + charts + fraud signals
//   /admin/marketing   → Coupons + banners
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();

const { authenticate, authorize, restrictToAdminIPs } = require('../middlewares/auth.middleware');
const { adminLimiter }  = require('../middlewares/rateLimiter.middleware');
const { validate }      = require('../middlewares/validate.middleware');
const V = require('../validators/admin.validator');

// Import controllers
const merchantAdminCtrl  = require('../controllers/admin/merchant.admin.controller');
const productAdminCtrl   = require('../controllers/admin/product.admin.controller');
const customerAdminCtrl  = require('../controllers/admin/customer.admin.controller');
const orderAdminCtrl     = require('../controllers/admin/order.admin.controller');

const analyticsModule    = require('../controllers/admin/analytics.admin.controller');
const analyticsCtrl      = analyticsModule;
const { complaintController: complaintCtrl } = analyticsModule;
const { marketingController: marketingCtrl } = analyticsModule;

// ── Apply global admin security middleware ─────────────────────
router.use(restrictToAdminIPs, adminLimiter, authenticate, authorize('admin'));

// ═══════════════════════════════════════════════════════════════
// MERCHANT MANAGEMENT  /admin/merchants
// ═══════════════════════════════════════════════════════════════
router.get('/merchants',
  validate(V.merchantListQuery, 'query'),
  merchantAdminCtrl.listMerchants
);
router.get('/merchants/:id',                                    merchantAdminCtrl.getMerchant);
router.post('/merchants/:id/approve',
  validate(V.merchantApprove),
  merchantAdminCtrl.approveMerchant
);
router.post('/merchants/:id/reject',
  validate(V.merchantReject),
  merchantAdminCtrl.rejectMerchant
);
router.patch('/merchants/:id/status',
  validate(V.merchantStatusUpdate),
  merchantAdminCtrl.updateMerchantStatus
);
router.get('/merchants/:id/kyc',                                merchantAdminCtrl.getMerchantKYC);
router.post('/merchants/:id/kyc/verify',
  validate(V.kycDecision),
  merchantAdminCtrl.verifyKYC
);
router.get('/merchants/:id/orders',                             merchantAdminCtrl.getMerchantOrders);
router.post('/merchants/:id/settlement',
  validate(V.processSettlement),
  merchantAdminCtrl.processSettlement
);

// ═══════════════════════════════════════════════════════════════
// PRODUCT MANAGEMENT  /admin/products
// ═══════════════════════════════════════════════════════════════
router.get('/products',
  validate(V.productListQuery, 'query'),
  productAdminCtrl.listProducts
);
router.get('/products/:id',                                     productAdminCtrl.getProduct);
router.post('/products/:id/approve',
  validate(V.productApprove),
  productAdminCtrl.approveProduct
);
router.post('/products/:id/reject',
  validate(V.productReject),
  productAdminCtrl.rejectProduct
);
router.patch('/products/:id/feature',
  validate(V.productFeatureToggle),
  productAdminCtrl.toggleFeature
);

// ═══════════════════════════════════════════════════════════════
// CUSTOMER MANAGEMENT  /admin/customers
// ═══════════════════════════════════════════════════════════════
router.get('/customers',
  validate(V.customerListQuery, 'query'),
  customerAdminCtrl.listCustomers
);
router.get('/customers/:id',                                    customerAdminCtrl.getCustomer);
router.post('/customers/:id/block',
  validate(V.customerBlock),
  customerAdminCtrl.blockCustomer
);
router.post('/customers/:id/unblock',                           customerAdminCtrl.unblockCustomer);
router.get('/customers/:id/orders',                             customerAdminCtrl.getCustomerOrders);
router.patch('/customers/:id/wallet', (req, res, next) => {
  // inline validate
  const { amount, type } = req.body;
  if (!amount || !type) return res.status(422).json({ success: false, message: 'amount and type are required' });
  next();
}, customerAdminCtrl.adjustWallet);

// ═══════════════════════════════════════════════════════════════
// ORDER GOVERNANCE  /admin/orders
// ═══════════════════════════════════════════════════════════════
// 'returns' BEFORE '/:id' to prevent route shadowing
router.get('/orders/returns',                                   orderAdminCtrl.getReturnRequests);
router.patch('/orders/returns/:rid',                            orderAdminCtrl.resolveReturn);
router.get('/orders',
  validate(V.adminOrderListQuery, 'query'),
  orderAdminCtrl.listOrders
);
router.get('/orders/:id',                                       orderAdminCtrl.getOrder);
router.post('/orders/:id/override',
  validate(V.adminOrderOverride),
  orderAdminCtrl.overrideOrder
);
router.post('/orders/:id/refund',
  validate(V.adminRefundInitiate),
  orderAdminCtrl.initiateManualRefund
);

// ═══════════════════════════════════════════════════════════════
// COMPLAINT MANAGEMENT  /admin/complaints
// ═══════════════════════════════════════════════════════════════
router.get('/complaints',
  validate(V.complaintListQuery, 'query'),
  complaintCtrl.listComplaints
);
router.get('/complaints/:id',                                   complaintCtrl.getComplaint);
router.post('/complaints/:id/assign',
  validate(V.complaintAssign),
  complaintCtrl.assignComplaint
);
router.post('/complaints/:id/reply',   (req, res, next) => {
  if (!req.body.message) return res.status(422).json({ success: false, message: 'message is required' });
  next();
}, complaintCtrl.replyToComplaint);
router.patch('/complaints/:id/resolve',
  validate(V.complaintResolve),
  complaintCtrl.resolveComplaint
);

// ═══════════════════════════════════════════════════════════════
// ANALYTICS  /admin/analytics
// ═══════════════════════════════════════════════════════════════
router.get('/analytics/overview',       validate(V.analyticsQuery, 'query'), analyticsCtrl.getOverview);
router.get('/analytics/revenue-trend',  validate(V.analyticsQuery, 'query'), analyticsCtrl.getRevenueTrend);
router.get('/analytics/geographic',     validate(V.analyticsQuery, 'query'), analyticsCtrl.getGeographic);
router.get('/analytics/top-merchants',  validate(V.analyticsQuery, 'query'), analyticsCtrl.getTopMerchants);
router.get('/analytics/fraud-signals',                                        analyticsCtrl.getFraudSignals);
router.get('/analytics/categories',     validate(V.analyticsQuery, 'query'), analyticsCtrl.getCategoryPerf);
router.get('/analytics/user-growth',    validate(V.analyticsQuery, 'query'), analyticsCtrl.getUserGrowth);
router.get('/analytics/settlements',                                          analyticsCtrl.getSettlementSummary);

// ═══════════════════════════════════════════════════════════════
// MARKETING  /admin/marketing
// ═══════════════════════════════════════════════════════════════
router.get('/marketing/coupons',                                marketingCtrl.listCoupons);
router.post('/marketing/coupons',
  validate(V.createCoupon),
  marketingCtrl.createCoupon
);
router.patch('/marketing/coupons/:id/toggle',                   marketingCtrl.toggleCoupon);

router.get('/marketing/banners',                                marketingCtrl.listBanners);
router.post('/marketing/banners',
  validate(V.createBanner),
  marketingCtrl.createBanner
);
router.patch('/marketing/banners/:id/toggle',                   marketingCtrl.toggleBanner);

module.exports = router;
