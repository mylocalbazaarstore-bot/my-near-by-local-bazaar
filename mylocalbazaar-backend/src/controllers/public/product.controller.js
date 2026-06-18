// src/controllers/public/product.controller.js
// ─────────────────────────────────────────────────────────────
// Public Product Controller — MyLocalBazaar.store
// PUBLIC endpoints — no auth required
//
// ENDPOINTS:
//   GET /merchants/:id/products → Products from a specific store (storefront)
//   GET /products/:id           → Single product detail
// ─────────────────────────────────────────────────────────────

const { query }       = require('../../config/db');
const ProductService  = require('../../services/product.service');
const { success, notFound, paginated } = require('../../utils/response');

// ── GET /merchants/:id/products ────────────────────────────────
const getMerchantProducts = async (req, res) => {
  const { id: merchantId } = req.params;
  const {
    page = 1, limit = 20,
    category_id, subcategory_id, search,
    min_price, max_price, in_stock,
    sort_by = 'created_at', sort_order = 'desc',
  } = req.query;

  const { rows: merchantRows } = await query(
    `SELECT id, store_name FROM merchants
     WHERE id = $1 AND merchant_status = 'active'`,
    [merchantId]
  );
  if (!merchantRows[0]) return notFound(res, 'Store not found');

  const result = await ProductService.getMerchantProducts(
    merchantId,
    { category_id, subcategory_id, search, min_price, max_price, in_stock, sort_by, sort_order },
    { page, limit }
  );

  return paginated(res, result, `Products from ${merchantRows[0].store_name}`);
};

// ── GET /products/:id ───────────────────────────────────────────
const getProductById = async (req, res) => {
  const product = await ProductService.findById(req.params.id);

  if (!product || product.product_status !== 'active') {
    return notFound(res, 'Product not found');
  }

  return success(res, { product }, 'Product details fetched');
};

// ── GET /products/slug/:slug ────────────────────────────────────
// Customer-facing product detail page resolves by slug (SEO-friendly URL).
const getProductBySlug = async (req, res) => {
  const product = await ProductService.findBySlug(req.params.slug);

  if (!product || product.product_status !== 'active') {
    return notFound(res, 'Product not found');
  }

  return success(res, { product }, 'Product details fetched');
};

module.exports = { getMerchantProducts, getProductById, getProductBySlug };
