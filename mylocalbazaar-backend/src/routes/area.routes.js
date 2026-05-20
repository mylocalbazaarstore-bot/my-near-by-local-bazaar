// src/routes/area.routes.js
// ─────────────────────────────────────────────────────────────
// Area / Hyperlocal Routes — MyLocalBazaar.store
// Base: /api/v1/areas  and  /api/v1/merchants
// PUBLIC — no auth required
// ─────────────────────────────────────────────────────────────

const express  = require('express');
const router   = express.Router();
const areaCtrl = require('../controllers/public/area.controller');
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

// Export both routers so index.js can mount them separately
module.exports = { areaRouter: router, merchantPubRouter };
