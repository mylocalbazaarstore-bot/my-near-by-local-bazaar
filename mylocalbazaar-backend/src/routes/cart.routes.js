// src/routes/cart.routes.js
// ─────────────────────────────────────────────────────────────
// Cart Routes — MyLocalBazaar.store
// Base: /api/v1/cart
// All routes: authenticate + authorize('customer')
// ─────────────────────────────────────────────────────────────

const express  = require('express');
const router   = express.Router();
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { validate }                = require('../middlewares/validate.middleware');
const cartCtrl = require('../controllers/customer/cart.controller');
const V        = require('../validators/cart.validator');

router.use(authenticate, authorize('customer'));

router.get('/',                                              cartCtrl.getCart);
router.post('/items',  validate(V.addToCart),               cartCtrl.addItem);
router.put('/items/:id', validate(V.updateCartItem),        cartCtrl.updateItem);
router.delete('/items/:id',                                 cartCtrl.removeItem);
router.delete('/',                                          cartCtrl.clearCart);

// coupon BEFORE /:id shadow
router.post('/coupon',  validate(V.applyCoupon),            cartCtrl.previewCoupon);
router.delete('/coupon',                                    cartCtrl.removeCoupon);

router.get('/delivery-charge',                              cartCtrl.estimateDelivery);

module.exports = router;
