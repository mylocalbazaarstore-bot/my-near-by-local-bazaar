// src/routes/review.routes.js
// ─────────────────────────────────────────────────────────────
// Reviews | Wallet | Coupons Routes — MyLocalBazaar.store
// Phase 2 — Goal 2.3
// ─────────────────────────────────────────────────────────────

const express    = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const {
  submitReview, getProductReviews, getMerchantReviews, getMyReviews, deleteReview,
  walletController,
  couponController,
} = require('../controllers/reviews.controller');

// ═══════════════════════════════════════════════════════════════
// REVIEW ROUTER — /api/v1/reviews
// ═══════════════════════════════════════════════════════════════
const reviewRouter = express.Router();

reviewRouter.get('/product/:productId',   getProductReviews);
reviewRouter.get('/merchant/:merchantId', getMerchantReviews);
reviewRouter.use(authenticate);
reviewRouter.get('/my',                   getMyReviews);
reviewRouter.post('/',                    authorize('customer'), submitReview);
reviewRouter.delete('/:id',               authorize('customer'), deleteReview);

// ═══════════════════════════════════════════════════════════════
// WALLET ROUTER — /api/v1/wallet
// ═══════════════════════════════════════════════════════════════
const walletRouter = express.Router();
walletRouter.use(authenticate, authorize('customer'));

walletRouter.get('/',              walletController.getWallet);
walletRouter.get('/transactions',  walletController.getTransactions);
walletRouter.post('/topup',        walletController.initiateTopup);

// ═══════════════════════════════════════════════════════════════
// COUPON ROUTER — /api/v1/coupons
// ═══════════════════════════════════════════════════════════════
const couponRouter = express.Router();

couponRouter.get('/',          authenticate, authorize('customer'), couponController.list);
couponRouter.post('/validate', authenticate, couponController.validate);

// ─────────────────────────────────────────────────────────────
// Export: reviewRouter is default, sub-routers as properties
// ─────────────────────────────────────────────────────────────
module.exports            = reviewRouter;
module.exports.walletRouter = walletRouter;
module.exports.couponRouter = couponRouter;
