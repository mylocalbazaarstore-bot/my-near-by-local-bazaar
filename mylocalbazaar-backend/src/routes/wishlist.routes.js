// src/routes/wishlist.routes.js
// ─────────────────────────────────────────────────────────────
// Wishlist Routes — MyLocalBazaar.store
// Base: /api/v1/wishlist
// All routes: authenticate + authorize('customer')
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();

const { authenticate, authorize } = require('../middlewares/auth.middleware');
const wishlistCtrl = require('../controllers/customer/wishlist.controller');

router.use(authenticate, authorize('customer'));

router.get('/',              wishlistCtrl.getWishlist);
router.post('/',             wishlistCtrl.addToWishlist);
router.delete('/:productId', wishlistCtrl.removeFromWishlist);

module.exports = router;
