// src/routes/category.routes.js
// ─────────────────────────────────────────────────────────────
// Category Routes — MyLocalBazaar.store
// Base: /api/v1/categories
// PUBLIC — no auth required
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const { validate } = require('../middlewares/validate.middleware');
const catCtrl = require('../controllers/public/category.controller');
const V       = require('../validators/product.validator');

router.get('/',               validate(V.categoryList, 'query'), catCtrl.listCategories);
router.get('/:slug',                                             catCtrl.getCategoryBySlug);
router.get('/:slug/products', validate(V.listProducts, 'query'), catCtrl.getCategoryProducts);
router.get('/:slug/merchants',                                   catCtrl.getCategoryMerchants);

module.exports = router;
