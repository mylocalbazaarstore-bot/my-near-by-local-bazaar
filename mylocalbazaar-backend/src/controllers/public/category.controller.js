// src/controllers/public/category.controller.js
// ─────────────────────────────────────────────────────────────
// Category Controller — MyLocalBazaar.store
// PUBLIC endpoints — no auth required
//
// ENDPOINTS:
//   GET /categories                    → All 13 categories
//   GET /categories/:slug              → Single category + subcategories
//   GET /categories/:slug/products     → Active products in category (customer view)
//   GET /categories/:slug/merchants    → Merchants offering this category
// ─────────────────────────────────────────────────────────────

const { query, queryPaginated } = require('../../config/db');
const { redis }  = require('../../config/redis');
const { success, notFound, paginated } = require('../../utils/response');

const CACHE_TTL  = 300; // 5 min — categories rarely change
const PRODUCT_TTL = 60;

// ── GET /categories ────────────────────────────────────────────
const listCategories = async (req, res) => {
  const { store_category, with_subcats, is_active = 'true' } = req.query;
  const cacheKey = `mlb:cats:${store_category || 'all'}:${with_subcats}`;
  const cached = await redis.get(cacheKey);
  if (cached) return success(res, { categories: cached });

  const params = [];
  const clauses = ['c.is_active = true'];

  if (store_category) {
    params.push(store_category);
    clauses.push(`c.store_category = $${params.length}`);
  }

  const { rows: categories } = await query(
    `SELECT
       c.id, c.name, c.slug, c.description,
       c.image_url, c.icon_url, c.theme_color,
       c.store_category, c.sort_order,
       (SELECT COUNT(*) FROM products p
        JOIN merchants m ON m.id = p.merchant_id
        WHERE p.category_id = c.id
          AND p.product_status = 'active'
          AND m.merchant_status = 'active') AS active_product_count,
       (SELECT COUNT(*) FROM merchants m
        WHERE m.store_category = c.store_category
          AND m.merchant_status = 'active') AS active_merchant_count
     FROM categories c
     WHERE ${clauses.join(' AND ')}
     ORDER BY c.sort_order ASC, c.name ASC`,
    params
  );

  // Optionally enrich with subcategories
  let result = categories;
  if (with_subcats === 'true' || with_subcats === true) {
    const { rows: subcats } = await query(
      `SELECT id, category_id, name, slug, description, image_url, sort_order
       FROM subcategories
       WHERE is_active = true
       ORDER BY sort_order ASC, name ASC`
    );

    result = categories.map((cat) => ({
      ...cat,
      subcategories: subcats.filter((sc) => sc.category_id === cat.id),
    }));
  }

  await redis.set(cacheKey, result, CACHE_TTL);
  return success(res, { categories: result }, 'Categories fetched');
};

// ── GET /categories/:slug ──────────────────────────────────────
const getCategoryBySlug = async (req, res) => {
  const { slug } = req.params;
  const cacheKey = `mlb:cat:${slug}`;
  const cached = await redis.get(cacheKey);
  if (cached) return success(res, { category: cached });

  const { rows } = await query(
    `SELECT
       c.id, c.name, c.slug, c.description,
       c.image_url, c.icon_url, c.theme_color,
       c.store_category, c.sort_order
     FROM categories c
     WHERE c.slug = $1 AND c.is_active = true
     LIMIT 1`,
    [slug]
  );

  if (!rows[0]) return notFound(res, 'Category not found');
  const category = rows[0];

  // Fetch subcategories
  const { rows: subcats } = await query(
    `SELECT id, name, slug, description, image_url, sort_order
     FROM subcategories
     WHERE category_id = $1 AND is_active = true
     ORDER BY sort_order ASC`,
    [category.id]
  );

  category.subcategories = subcats;

  await redis.set(cacheKey, category, CACHE_TTL);
  return success(res, { category });
};

// ── GET /categories/:slug/products ────────────────────────────
// Public-facing product listing for a category (customer view)
const getCategoryProducts = async (req, res) => {
  const { slug } = req.params;
  const {
    page = 1, limit = 20,
    area_id, pincode,
    sort_by = 'created_at', sort_order = 'desc',
    min_price, max_price, in_stock, search,
    subcategory_id,
  } = req.query;

  // Resolve category
  const { rows: catRows } = await query(
    'SELECT id, name, slug FROM categories WHERE slug = $1 AND is_active = true LIMIT 1',
    [slug]
  );
  if (!catRows[0]) return notFound(res, 'Category not found');
  const catId = catRows[0].id;

  const params  = [catId];
  const clauses = [
    "p.category_id = $1",
    "p.product_status = 'active'",
    "m.merchant_status = 'active'",
    "m.is_active = true",
  ];

  if (subcategory_id) {
    params.push(subcategory_id);
    clauses.push(`p.subcategory_id = $${params.length}`);
  }
  if (search) {
    params.push(search);
    clauses.push(`p.search_vector @@ plainto_tsquery('english', $${params.length})`);
  }
  if (min_price !== undefined) {
    params.push(parseFloat(min_price));
    clauses.push(`p.retail_price >= $${params.length}`);
  }
  if (max_price !== undefined) {
    params.push(parseFloat(max_price));
    clauses.push(`p.retail_price <= $${params.length}`);
  }
  if (in_stock === 'true') {
    clauses.push('p.stock_quantity > 0');
  }

  // Area-based merchant filter (hyperlocal — only show products from merchants that deliver here)
  if (area_id) {
    params.push(area_id);
    clauses.push(`
      EXISTS (
        SELECT 1 FROM merchant_area_availability maa
        WHERE maa.merchant_id = m.id AND maa.area_id = $${params.length} AND maa.is_within_zone = true
      )
    `);
  } else if (pincode) {
    params.push(pincode);
    clauses.push(`m.pincode = $${params.length}`);
  }

  const sortCols = {
    created_at:   'p.created_at',
    retail_price: 'p.retail_price',
    name:         'p.name',
    rating:       'p.is_featured',
  };
  const safeSort  = sortCols[sort_by]    || 'p.created_at';
  const safeOrder = sort_order === 'asc' ? 'ASC' : 'DESC';

  const result = await queryPaginated(
    `SELECT
       p.id, p.name, p.slug, p.short_description,
       p.mrp, p.retail_price, p.wholesale_price, p.moq,
       p.stock_quantity, p.unit, p.brand,
       p.gst_percentage, p.is_featured, p.is_returnable,
       p.return_window_days, p.tags,
       m.id AS merchant_id, m.store_name, m.store_slug,
       m.rating AS merchant_rating, m.delivery_radius_km,
       m.min_order_value, m.is_open, m.accepts_cod,
       (SELECT image_url FROM product_images pi
        WHERE pi.product_id = p.id AND pi.is_primary = true LIMIT 1) AS primary_image,
       (SELECT COUNT(*) FROM product_variants pv
        WHERE pv.product_id = p.id AND pv.is_active = true) AS variant_count
     FROM products p
     JOIN merchants m ON m.id = p.merchant_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY p.is_featured DESC, p.is_sponsored DESC, ${safeSort} ${safeOrder}`,
    params,
    { page, limit }
  );

  return paginated(res, result, `Products in ${catRows[0].name}`);
};

// ── GET /categories/:slug/merchants ────────────────────────────
const getCategoryMerchants = async (req, res) => {
  const { slug } = req.params;
  const { area_id, pincode, page = 1, limit = 20 } = req.query;

  const { rows: catRows } = await query(
    'SELECT id, store_category FROM categories WHERE slug = $1 AND is_active = true LIMIT 1',
    [slug]
  );
  if (!catRows[0]) return notFound(res, 'Category not found');

  const params  = [catRows[0].store_category, 'active'];
  const clauses = ['m.store_category = $1', 'm.merchant_status = $2', 'm.is_active = true'];

  if (area_id) {
    params.push(area_id);
    clauses.push(`
      EXISTS (
        SELECT 1 FROM merchant_area_availability maa
        WHERE maa.merchant_id = m.id AND maa.area_id = $${params.length} AND maa.is_within_zone = true
      )
    `);
  } else if (pincode) {
    params.push(pincode);
    clauses.push(`m.pincode = $${params.length}`);
  }

  const result = await queryPaginated(
    `SELECT
       m.id, m.store_name, m.store_slug, m.store_category,
       m.store_logo_url, m.store_banner_url, m.store_description,
       m.rating, m.total_reviews, m.delivery_radius_km,
       m.min_order_value, m.is_open, m.accepts_cod,
       m.emergency_booking, m.is_featured, m.pincode,
       (SELECT COUNT(*) FROM products p
        WHERE p.merchant_id = m.id AND p.product_status = 'active') AS product_count
     FROM merchants m
     WHERE ${clauses.join(' AND ')}
     ORDER BY m.is_featured DESC, m.rating DESC`,
    params,
    { page, limit }
  );

  return paginated(res, result, 'Merchants in category');
};

module.exports = {
  listCategories,
  getCategoryBySlug,
  getCategoryProducts,
  getCategoryMerchants,
};
