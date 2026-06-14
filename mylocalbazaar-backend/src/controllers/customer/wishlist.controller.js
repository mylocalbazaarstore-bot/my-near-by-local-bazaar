// src/controllers/customer/wishlist.controller.js
// ─────────────────────────────────────────────────────────────
// Customer Wishlist Controller — MyLocalBazaar.store
//
// ENDPOINTS:
//   GET    /wishlist             → list saved products
//   POST   /wishlist             → save a product { product_id }
//   DELETE /wishlist/:productId  → remove a saved product
// ─────────────────────────────────────────────────────────────

const { query } = require('../../config/db');
const { success, created, badRequest, notFound } = require('../../utils/response');

// ── GET /wishlist ──────────────────────────────────────────────
const getWishlist = async (req, res) => {
  const { rows } = await query(
    `SELECT p.id, p.name, p.slug, p.mrp, p.retail_price, p.stock_quantity, p.moq,
            (SELECT image_url FROM product_images pi
             WHERE pi.product_id = p.id AND pi.is_primary = true LIMIT 1) AS primary_image,
            json_build_object('id', m.id, 'store_name', m.store_name, 'store_slug', m.store_slug) AS merchant
     FROM wishlists w
     JOIN products p  ON p.id = w.product_id
     JOIN merchants m ON m.id = p.merchant_id
     WHERE w.user_id = $1
     ORDER BY w.created_at DESC`,
    [req.user.id]
  );
  return success(res, { products: rows });
};

// ── POST /wishlist ─────────────────────────────────────────────
// Body: { product_id }
const addToWishlist = async (req, res) => {
  const { product_id } = req.body;
  if (!product_id) return badRequest(res, 'product_id is required');

  const { rows } = await query('SELECT id FROM products WHERE id = $1', [product_id]);
  if (!rows[0]) return notFound(res, 'Product not found');

  await query(
    `INSERT INTO wishlists (user_id, product_id) VALUES ($1, $2)
     ON CONFLICT (user_id, product_id) DO NOTHING`,
    [req.user.id, product_id]
  );
  return created(res, null, 'Added to wishlist');
};

// ── DELETE /wishlist/:productId ────────────────────────────────
const removeFromWishlist = async (req, res) => {
  const { rowCount } = await query(
    'DELETE FROM wishlists WHERE user_id = $1 AND product_id = $2',
    [req.user.id, req.params.productId]
  );
  if (!rowCount) return notFound(res, 'Item not found in wishlist');
  return success(res, null, 'Removed from wishlist');
};

module.exports = { getWishlist, addToWishlist, removeFromWishlist };
