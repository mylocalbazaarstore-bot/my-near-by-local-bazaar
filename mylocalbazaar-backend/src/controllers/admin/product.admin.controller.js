// src/controllers/admin/product.admin.controller.js
// ─────────────────────────────────────────────────────────────
// Admin Product Management Controller — MyLocalBazaar.store
// ENDPOINTS:
//   GET   /admin/products              → List all products (pending approvals first)
//   GET   /admin/products/:id          → Full product detail
//   POST  /admin/products/:id/approve  → Approve product listing
//   POST  /admin/products/:id/reject   → Reject with reason
//   PATCH /admin/products/:id/feature  → Toggle featured flag
// ─────────────────────────────────────────────────────────────

const { query, queryPaginated } = require('../../config/db');
const { success, created, notFound, badRequest, paginated } = require('../../utils/response');
const logger = require('../../config/logger');

// ── GET /admin/products ───────────────────────────────────────
const listProducts = async (req, res) => {
  const {
    page = 1, limit = 20,
    status, merchant_id, category_id, search,
    sort_by = 'created_at', sort_order = 'desc',
  } = req.query;

  const params = [];
  const clauses = [];

  if (status) {
    params.push(status);
    clauses.push(`p.product_status = $${params.length}`);
  }
  if (merchant_id) {
    params.push(merchant_id);
    clauses.push(`p.merchant_id = $${params.length}`);
  }
  if (category_id) {
    params.push(category_id);
    clauses.push(`p.category_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    clauses.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.brand ILIKE $${params.length})`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const validSort = ['created_at', 'name', 'retail_price', 'stock_quantity'].includes(sort_by) ? sort_by : 'created_at';
  const dir = sort_order === 'asc' ? 'ASC' : 'DESC';

  const sql = `
    SELECT
      p.id, p.name, p.slug, p.sku, p.brand, p.retail_price, p.mrp,
      p.stock_quantity, p.product_status, p.is_featured, p.created_at,
      m.store_name AS merchant_name, m.id AS merchant_id,
      c.name AS category_name
    FROM products p
    JOIN merchants m ON m.id = p.merchant_id
    LEFT JOIN categories c ON c.id = p.category_id
    ${where}
    ORDER BY
      CASE WHEN p.product_status = 'pending_approval' THEN 0 ELSE 1 END,
      p.${validSort} ${dir}
  `;

  const result = await queryPaginated(sql, params, { page, limit });
  return paginated(res, result, 'Products list');
};

// ── GET /admin/products/:id ───────────────────────────────────
const getProduct = async (req, res) => {
  const { rows } = await query(
    `SELECT
       p.*,
       m.store_name AS merchant_name, m.phone AS merchant_phone,
       c.name AS category_name,
       json_agg(DISTINCT pi.*) FILTER (WHERE pi.id IS NOT NULL) AS images,
       json_agg(DISTINCT pv.*) FILTER (WHERE pv.id IS NOT NULL) AS variants
     FROM products p
     JOIN merchants m ON m.id = p.merchant_id
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN product_images pi ON pi.product_id = p.id
     LEFT JOIN product_variants pv ON pv.product_id = p.id
     WHERE p.id = $1
     GROUP BY p.id, m.store_name, m.phone, c.name`,
    [req.params.id]
  );

  if (!rows[0]) return notFound(res, 'Product not found');
  return success(res, { product: rows[0] });
};

// ── POST /admin/products/:id/approve ─────────────────────────
const approveProduct = async (req, res) => {
  const { rowCount, rows } = await query(
    `UPDATE products
     SET product_status = 'active', approved_by = $1, approved_at = NOW(), updated_at = NOW()
     WHERE id = $2 AND product_status = 'pending_approval'
     RETURNING id, name, merchant_id`,
    [req.user.id, req.params.id]
  );

  if (!rowCount) return notFound(res, 'Product not found or not pending approval');

  // Audit log
  await query(
    `INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, new_values)
     VALUES ($1, 'product_approved', 'products', $2, $3)`,
    [req.user.id, req.params.id, JSON.stringify({ product_name: rows[0].name })]
  );

  logger.info('Product approved', { adminId: req.user.id, productId: req.params.id });
  return success(res, { product: rows[0] }, `Product "${rows[0].name}" approved and is now live.`);
};

// ── POST /admin/products/:id/reject ──────────────────────────
const rejectProduct = async (req, res) => {
  const { reason } = req.body;
  if (!reason) return badRequest(res, 'Rejection reason is required');

  const { rowCount, rows } = await query(
    `UPDATE products
     SET product_status = 'rejected', rejection_reason = $1, approved_by = $2, updated_at = NOW()
     WHERE id = $3 AND product_status = 'pending_approval'
     RETURNING id, name, merchant_id`,
    [reason, req.user.id, req.params.id]
  );

  if (!rowCount) return notFound(res, 'Product not found or not pending approval');

  await query(
    `INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, new_values)
     VALUES ($1, 'product_rejected', 'products', $2, $3)`,
    [req.user.id, req.params.id, JSON.stringify({ reason, product_name: rows[0].name })]
  );

  logger.info('Product rejected', { adminId: req.user.id, productId: req.params.id, reason });
  return success(res, { product: rows[0] }, `Product rejected. Merchant will be notified.`);
};

// ── PATCH /admin/products/:id/feature ────────────────────────
const toggleFeature = async (req, res) => {
  const { rows } = await query(
    `UPDATE products
     SET is_featured = NOT is_featured, updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, is_featured`,
    [req.params.id]
  );

  if (!rows[0]) return notFound(res, 'Product not found');

  logger.info('Product feature toggled', { adminId: req.user.id, productId: req.params.id, isFeatured: rows[0].is_featured });
  return success(res, { product: rows[0] },
    `"${rows[0].name}" is now ${rows[0].is_featured ? 'featured' : 'unfeatured'}.`
  );
};

module.exports = { listProducts, getProduct, approveProduct, rejectProduct, toggleFeature };
