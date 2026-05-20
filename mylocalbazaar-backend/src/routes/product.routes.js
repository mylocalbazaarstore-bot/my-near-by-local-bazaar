// src/routes/product.routes.js
// ─────────────────────────────────────────────────────────────
// Merchant Product Routes — MyLocalBazaar.store
// Base: /api/v1/merchant/products
// All routes: authenticate + authorize('merchant') enforced
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();

const { authenticate, authorize }    = require('../middlewares/auth.middleware');
const { validate }                   = require('../middlewares/validate.middleware');
const { uploadLimiter }              = require('../middlewares/rateLimiter.middleware');
const { uploadProductImage }         = require('../config/cloudinary');
const productCtrl                    = require('../controllers/merchant/product.controller');
const V                              = require('../validators/product.validator');

// All merchant product routes require auth
router.use(authenticate, authorize('merchant'));

// ── Collection routes (no :id) ─────────────────────────────────
router.post('/',      validate(V.createProduct),      productCtrl.createProduct);
router.get('/',       validate(V.listProducts, 'query'), productCtrl.listProducts);

// bulk & low-stock — BEFORE /:id to prevent route shadowing
router.post('/bulk',       validate(V.bulkUploadProducts), productCtrl.bulkUpload);
router.get('/low-stock',                                   productCtrl.getLowStock);

// ── Single product routes (:id) ────────────────────────────────
router.get('/:id',    productCtrl.getProduct);
router.put('/:id',    validate(V.updateProduct),           productCtrl.updateProduct);
router.delete('/:id',                                      productCtrl.archiveProduct);

// ── Stock ─────────────────────────────────────────────────────
router.patch('/:id/stock', validate(V.updateStock), productCtrl.updateStock);

// ── Images ────────────────────────────────────────────────────
router.post('/:id/images',
  uploadLimiter,
  (req, res, next) => {                          // wrap Cloudinary multer for error handling
    uploadProductImage(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message });
      next();
    });
  },
  productCtrl.addImages
);

// reorder BEFORE /:imageId to prevent shadow
router.patch('/:id/images/reorder',           validate(V.reorderImages), productCtrl.reorderImages);
router.patch('/:id/images/:imageId/primary',                             productCtrl.setPrimaryImage);
router.delete('/:id/images/:imageId',                                    productCtrl.deleteImage);

// ── Variants ──────────────────────────────────────────────────
router.post('/:id/variants',        productCtrl.addVariant);
router.put('/:id/variants/:vid',    validate(V.updateVariant), productCtrl.updateVariant);
router.delete('/:id/variants/:vid',                            productCtrl.deleteVariant);

module.exports = router;
