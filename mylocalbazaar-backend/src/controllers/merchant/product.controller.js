// src/controllers/merchant/product.controller.js
// ─────────────────────────────────────────────────────────────
// Merchant Product Controller — MyLocalBazaar.store
//
// All routes protected by: authenticate + authorize('merchant')
// Merchants can ONLY manage their own products (merchantId from JWT)
//
// ENDPOINTS:
//   POST   /merchant/products              → Create product
//   GET    /merchant/products              → List with filters/search
//   GET    /merchant/products/:id          → Single product details
//   PUT    /merchant/products/:id          → Update product
//   DELETE /merchant/products/:id          → Archive (soft delete)
//   POST   /merchant/products/bulk         → Bulk upload (max 50)
//   PATCH  /merchant/products/:id/stock    → Quick stock update
//   POST   /merchant/products/:id/images   → Upload images
//   DELETE /merchant/products/:id/images/:imageId → Delete image
//   PATCH  /merchant/products/:id/images/reorder  → Reorder images
//   PATCH  /merchant/products/:id/images/:imageId/primary → Set primary
//   POST   /merchant/products/:id/variants         → Add variant
//   PUT    /merchant/products/:id/variants/:vid    → Update variant
//   DELETE /merchant/products/:id/variants/:vid    → Delete variant
//   GET    /merchant/products/low-stock            → Low stock alerts
// ─────────────────────────────────────────────────────────────

const ProductService = require('../../services/product.service');
const { FeatureGate, PlanService } = require('../../services/saas.service');
const { deleteMedia } = require('../../config/cloudinary');
const {
  success, created, badRequest, forbidden, notFound, paginated,
} = require('../../utils/response');
const logger = require('../../config/logger');

const getPlanName = async (merchantId) => {
  const plan = await PlanService.getCurrentPlan(merchantId);
  return plan?.plan || 'current';
};

const productLimitMessage = (plan, current, limit) =>
  `Product limit reached for your ${plan} plan (${current}/${limit}). Upgrade your plan to add more products.`;

const imageLimitMessage = (plan, limit) =>
  `Image limit reached for your ${plan} plan (max ${limit} images per product). Upgrade your plan to add more images.`;

// ── POST /merchant/products ────────────────────────────────────
const createProduct = async (req, res) => {
  const merchantId = req.user.id;
  const gate = await FeatureGate.canAddProduct(merchantId);

  if (!gate.allowed) {
    const plan = await getPlanName(merchantId);
    return forbidden(
      res,
      productLimitMessage(plan, gate.current_count, gate.max_allowed),
      'PLAN_LIMIT_EXCEEDED'
    );
  }

  const product    = await ProductService.create(merchantId, req.body);
  return created(res, { product }, 'Product submitted for admin approval');
};

// ── GET /merchant/products ─────────────────────────────────────
const listProducts = async (req, res) => {
  const merchantId = req.user.id;
  const {
    page, limit, status, category_id, subcategory_id,
    search, is_featured, min_price, max_price,
    in_stock, sort_by, sort_order,
  } = req.query;

  const result = await ProductService.listForMerchant(
    merchantId,
    { status, category_id, subcategory_id, search,
      is_featured: is_featured !== undefined ? is_featured === 'true' : undefined,
      min_price, max_price,
      in_stock: in_stock !== undefined ? in_stock === 'true' : undefined,
      sort_by, sort_order,
    },
    { page, limit }
  );

  return paginated(res, result, 'Products fetched');
};

// ── GET /merchant/products/low-stock ──────────────────────────
// IMPORTANT: this route must be registered BEFORE /:id routes
const getLowStock = async (req, res) => {
  const items = await ProductService.getLowStockProducts(req.user.id, 20);
  return success(res, { items, count: items.length }, 'Low stock products');
};

// ── GET /merchant/products/:id ────────────────────────────────
const getProduct = async (req, res) => {
  const product = await ProductService.findById(req.params.id, req.user.id);
  if (!product) return notFound(res, 'Product not found');
  return success(res, { product });
};

// ── PUT /merchant/products/:id ────────────────────────────────
const updateProduct = async (req, res) => {
  const product = await ProductService.update(req.params.id, req.user.id, req.body);
  return success(res, { product }, 'Product updated. Admin re-approval may be required for active products.');
};

// ── DELETE /merchant/products/:id ────────────────────────────
const archiveProduct = async (req, res) => {
  await ProductService.archive(req.params.id, req.user.id);
  return success(res, null, 'Product archived successfully');
};

// ── POST /merchant/products/bulk ──────────────────────────────
const bulkUpload = async (req, res) => {
  const merchantId = req.user.id;
  const incomingProducts = req.body.products || [];
  const gate = await FeatureGate.canAddProduct(merchantId);
  const current = gate.current_count || 0;
  const limit = gate.max_allowed;

  if (limit !== undefined && current + incomingProducts.length > limit) {
    const plan = await getPlanName(merchantId);
    return forbidden(
      res,
      `Adding ${incomingProducts.length} products would exceed your ${plan} plan limit (${current}/${limit} used, ${Math.max(limit - current, 0)} remaining). Upgrade your plan or reduce the batch size.`,
      'PLAN_LIMIT_EXCEEDED'
    );
  }

  if (!gate.allowed) {
    const plan = await getPlanName(merchantId);
    return forbidden(
      res,
      productLimitMessage(plan, current, limit),
      'PLAN_LIMIT_EXCEEDED'
    );
  }

  const results = await ProductService.bulkCreate(merchantId, incomingProducts);
  const statusCode = results.failed.length === 0 ? 201
    : results.success.length === 0 ? 422
    : 207; // 207 Multi-Status: partial success

  return res.status(statusCode).json({
    success: results.failed.length === 0 || results.success.length > 0,
    message: `Bulk upload: ${results.success.length}/${results.total} products processed`,
    data: {
      total:   results.total,
      success: results.success,
      failed:  results.failed,
    },
  });
};

// ── PATCH /merchant/products/:id/stock ────────────────────────
const updateStock = async (req, res) => {
  const product = await ProductService.updateStock(req.params.id, req.user.id, req.body);
  return success(res, { product }, 'Stock updated');
};

// ═════════════════════════════════════════════════════════════
// IMAGE MANAGEMENT
// ═════════════════════════════════════════════════════════════

// ── POST /merchant/products/:id/images ───────────────────────
// Cloudinary upload middleware runs BEFORE this controller
const addImages = async (req, res) => {
  const files = req.files;
  if (!files?.length) return badRequest(res, 'No image files uploaded');

  const merchantId = req.user.id;
  const productId = req.params.id;
  const gate = await FeatureGate.canUploadImages(merchantId, productId);
  const exceedsBatchLimit = gate.max !== undefined && gate.current + files.length > gate.max;

  if (!gate.allowed || exceedsBatchLimit) {
    const currentPlan = await PlanService.getCurrentPlan(merchantId);
    const plan = currentPlan?.plan || 'current';
    const maxImages = gate.max || currentPlan?.limits?.max_images_per_product || 'allowed';
    return forbidden(
      res,
      imageLimitMessage(plan, maxImages),
      'IMAGE_LIMIT_EXCEEDED'
    );
  }

  const images = await ProductService.addImages(productId, merchantId, files);
  return created(res, { images }, `${images.length} image(s) uploaded`);
};

// ── DELETE /merchant/products/:id/images/:imageId ─────────────
const deleteImage = async (req, res) => {
  const result = await ProductService.deleteImage(
    req.params.imageId,
    req.params.id,
    req.user.id
  );

  // Best-effort delete from Cloudinary (non-blocking)
  if (result.cloudinary_url) {
    const publicId = extractCloudinaryPublicId(result.cloudinary_url);
    if (publicId) {
      deleteMedia(publicId).catch((err) =>
        logger.warn('Cloudinary delete failed:', { url: result.cloudinary_url, error: err.message })
      );
    }
  }

  return success(res, null, 'Image deleted');
};

// ── PATCH /merchant/products/:id/images/reorder ───────────────
const reorderImages = async (req, res) => {
  await ProductService.reorderImages(req.params.id, req.user.id, req.body.image_orders);
  return success(res, null, 'Image order updated');
};

// ── PATCH /merchant/products/:id/images/:imageId/primary ──────
const setPrimaryImage = async (req, res) => {
  await ProductService.setPrimaryImage(req.params.imageId, req.params.id, req.user.id);
  return success(res, null, 'Primary image set');
};

// ── Helper: extract Cloudinary public_id from URL ─────────────
const extractCloudinaryPublicId = (url) => {
  try {
    const parts  = url.split('/');
    const upload = parts.indexOf('upload');
    if (upload === -1) return null;
    // Skip version segment (v1234567890) if present
    const pathParts  = parts.slice(upload + 1);
    const withoutVer = pathParts[0].startsWith('v') ? pathParts.slice(1) : pathParts;
    const filename   = withoutVer.join('/');
    return filename.replace(/\.[^/.]+$/, ''); // remove extension
  } catch { return null; }
};

// ═════════════════════════════════════════════════════════════
// VARIANT MANAGEMENT
// ═════════════════════════════════════════════════════════════

// ── POST /merchant/products/:id/variants ─────────────────────
const addVariant = async (req, res) => {
  const variant = await ProductService.addVariant(req.params.id, req.user.id, req.body);
  return created(res, { variant }, 'Variant added');
};

// ── PUT /merchant/products/:id/variants/:vid ─────────────────
const updateVariant = async (req, res) => {
  const variant = await ProductService.updateVariant(
    req.params.vid, req.params.id, req.user.id, req.body
  );
  return success(res, { variant }, 'Variant updated');
};

// ── DELETE /merchant/products/:id/variants/:vid ──────────────
const deleteVariant = async (req, res) => {
  await ProductService.deleteVariant(req.params.vid, req.params.id, req.user.id);
  return success(res, null, 'Variant deleted');
};

module.exports = {
  createProduct, listProducts, getLowStock, getProduct,
  updateProduct, archiveProduct, bulkUpload, updateStock,
  addImages, deleteImage, reorderImages, setPrimaryImage,
  addVariant, updateVariant, deleteVariant,
};
