// src/routes/review.routes.js
// ─────────────────────────────────────────────────────────────
// Reviews | Wallet | Coupons Routes — MyLocalBazaar.store
// Phase 2 — Goal 2.3
// ─────────────────────────────────────────────────────────────

const express    = require('express');
const Joi        = require('joi');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { validate, fields } = require('../middlewares/validate.middleware');
const {
  submitReview, getProductReviews, getMerchantReviews, getMyReviews, deleteReview,
  walletController,
  couponController,
} = require('../controllers/reviews.controller');

// ═══════════════════════════════════════════════════════════════
// REVIEW ROUTER — /api/v1/reviews
// ═══════════════════════════════════════════════════════════════
const reviewRouter = express.Router();

const submitReviewSchema = Joi.object({
  product_id:  fields.uuid.optional().allow(null),
  merchant_id: fields.uuid.optional().allow(null),
  service_id:  fields.uuid.optional().allow(null),
  order_id:    fields.uuid.optional().allow(null),
  booking_id:  fields.uuid.optional().allow(null),
  rating:      Joi.number().integer().min(1).max(5).required(),
  title:       Joi.string().trim().max(120).optional().allow('', null),
  body:        Joi.string().trim().max(1000).optional().allow('', null),
}).custom((value, helpers) => {
  if (!value.product_id && !value.merchant_id && !value.service_id) {
    return helpers.message('Provide at least one of product_id, merchant_id, or service_id');
  }
  return value;
});

reviewRouter.get('/product/:productId',   getProductReviews);
reviewRouter.get('/merchant/:merchantId', getMerchantReviews);
reviewRouter.use(authenticate);
reviewRouter.get('/my',                   getMyReviews);
reviewRouter.post('/',                    authorize('customer'), validate(submitReviewSchema), submitReview);
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
