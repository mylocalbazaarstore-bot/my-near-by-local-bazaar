// src/routes/area.routes.js
// ─────────────────────────────────────────────────────────────
// Area / Hyperlocal Routes — MyLocalBazaar.store
// Base: /api/v1/areas  and  /api/v1/merchants
// PUBLIC — no auth required
// ─────────────────────────────────────────────────────────────

const express     = require('express');
const router      = express.Router();
const areaCtrl    = require('../controllers/public/area.controller');
const productCtrl = require('../controllers/public/product.controller');
const { validate } = require('../middlewares/validate.middleware');
const V        = require('../validators/product.validator');

// ── Area discovery ─────────────────────────────────────────────
router.get('/cities',              areaCtrl.getCities);
router.get('/pincode/:pincode',    areaCtrl.getByPincode);
router.get('/search',              areaCtrl.searchAreas);         // ?q=Kharghar
router.get('/nearby',              areaCtrl.getNearby);           // ?lat=&lng=&radius_km=
router.get('/:id',                 areaCtrl.getAreaById);
router.get('/:id/merchants',
  validate(V.merchantsByArea, 'query'),
  areaCtrl.getMerchantsByArea
);
router.post('/verify-delivery',    areaCtrl.verifyDelivery);

module.exports = router;


// ─────────────────────────────────────────────────────────────
// src/routes/merchant.public.routes.js
// Merchant discovery routes (public, no auth)
// Base: /api/v1/merchants
// ─────────────────────────────────────────────────────────────
const merchantPubRouter = express.Router();

merchantPubRouter.get(
  '/by-pincode/:pincode',
  validate(V.merchantsByArea, 'query'),
  areaCtrl.getMerchantsByPincode
);

merchantPubRouter.get(
  '/by-coords',
  validate(V.merchantsByArea, 'query'),
  areaCtrl.getMerchantsByCoords
);

// Merchant-scoped product listing (storefront) — registered BEFORE
// the /:slug catch-all so "/:id/products" isn't shadowed by it.
merchantPubRouter.get(
  '/:id/products',
  validate(V.merchantProducts, 'query'),
  productCtrl.getMerchantProducts
);

// Single merchant storefront detail — catch-all (single segment),
// MUST be registered LAST so it doesn't shadow /by-pincode, /by-coords etc.
merchantPubRouter.get('/:slug', areaCtrl.getMerchantBySlug);

// ─────────────────────────────────────────────────────────────
// src/routes/product.public.routes.js
// Public product detail route
// Base: /api/v1/products
// ─────────────────────────────────────────────────────────────
const productPubRouter = express.Router();

productPubRouter.get('/:id', productCtrl.getProductById);

// Export all routers so index.js can mount them separately
module.exports = { areaRouter: router, merchantPubRouter, productPubRouter };
