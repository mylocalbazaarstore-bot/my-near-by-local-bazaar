// src/services/product.service.js
// ─────────────────────────────────────────────────────────────
// Product Service — MyLocalBazaar.store
// Handles: CRUD | Bulk upload | Image management |
//          Full-text search | Stock control | Admin approval flow
// ─────────────────────────────────────────────────────────────

const { query, withTransaction, queryPaginated } = require('../config/db');
const { redis }   = require('../config/redis');
const { generateSlug } = require('../utils/generators');
const logger      = require('../config/logger');

const PRODUCT_CACHE_TTL = 60; // 60s cache for individual products

// ── Invalidate all product caches for a merchant ──────────────
const invalidateMerchantProductCache = async (merchantId) => {
  try {
    const keys = await redis.keys(`mlb:products:${merchantId}:*`);
    if (keys.length) {
      await Promise.all(keys.map((k) => redis.del(k)));
    }
    logger.debug('Product cache invalidated', { merchantId, count: keys.length });
  } catch (err) {
    logger.warn('Cache invalidation failed:', { message: err.message });
  }
};

const ProductService = {

  // ═════════════════════════════════════════════════════════════
  // CREATE
  // ═════════════════════════════════════════════════════════════
  create: async (merchantId, data) => {
    return withTransaction(async (client) => {
      // Build a unique slug: product-name-merchantfirstword
      const baseSlug = generateSlug(data.name);
      let slug = baseSlug;
      let counter = 1;

      while (true) {
        const { rows: exists } = await client.query(
          'SELECT id FROM products WHERE merchant_id = $1 AND slug = $2',
          [merchantId, slug]
        );
        if (!exists[0]) break;
        slug = `${baseSlug}-${counter++}`;
      }

      // Validate category belongs to a matching store_category (integrity check)
      const { rows: catCheck } = await client.query(
        `SELECT c.id, c.name, c.store_category
         FROM categories c
         JOIN merchants m ON m.id = $2
         WHERE c.id = $1 AND c.is_active = true`,
        [data.category_id, merchantId]
      );
      if (!catCheck[0]) {
        throw Object.assign(new Error('Category not found or inactive'), { statusCode: 404 });
      }

      // Insert product
      const { rows } = await client.query(
        `INSERT INTO products (
           merchant_id, category_id, subcategory_id,
           name, slug, description, short_description,
           sku, barcode, brand, unit,
           mrp, retail_price, wholesale_price, moq,
           stock_quantity, low_stock_threshold, track_inventory,
           gst_percentage, hsn_code, weight_grams,
           tags, is_returnable, return_window_days,
           product_status
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
           $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,
           'pending_approval'
         )
         RETURNING *`,
        [
          merchantId,
          data.category_id,
          data.subcategory_id     || null,
          data.name,
          slug,
          data.description        || null,
          data.short_description  || null,
          data.sku                || null,
          data.barcode            || null,
          data.brand              || null,
          data.unit               || 'piece',
          data.mrp,
          data.retail_price,
          data.wholesale_price    || null,
          data.moq                || 1,
          data.stock_quantity     || 0,
          data.low_stock_threshold || 5,
          data.track_inventory !== false,
          data.gst_percentage     || 0,
          data.hsn_code           || null,
          data.weight_grams       || null,
          data.tags               || [],
          data.is_returnable !== false,
          data.return_window_days || 7,
        ]
      );

      const product = rows[0];

      // Insert variants if provided
      if (data.variants?.length) {
        for (const v of data.variants) {
          await client.query(
            `INSERT INTO product_variants
               (product_id, variant_name, variant_type, mrp, retail_price,
                wholesale_price, stock_quantity, sku, is_active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              product.id, v.variant_name, v.variant_type,
              v.mrp, v.retail_price,
              v.wholesale_price || null,
              v.stock_quantity || 0,
              v.sku || null,
              v.is_active !== false,
            ]
          );
        }
      }

      await invalidateMerchantProductCache(merchantId);
      logger.info('Product created', { productId: product.id, merchantId, name: product.name });

      return product;
    });
  },

  // ═════════════════════════════════════════════════════════════
  // READ — Single product (with images + variants)
  // ═════════════════════════════════════════════════════════════
  findById: async (productId, merchantId = null) => {
    const cacheKey = `mlb:product:${productId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const params = [productId];
    let merchantFilter = '';
    if (merchantId) {
      params.push(merchantId);
      merchantFilter = `AND p.merchant_id = $${params.length}`;
    }

    const { rows } = await query(
      `SELECT p.*,
              c.name AS category_name, c.slug AS category_slug,
              sc.name AS subcategory_name,
              m.store_name, m.store_slug, m.store_category
       FROM products p
       LEFT JOIN categories c   ON c.id = p.category_id
       LEFT JOIN subcategories sc ON sc.id = p.subcategory_id
       LEFT JOIN merchants m    ON m.id = p.merchant_id
       WHERE p.id = $1 ${merchantFilter}`,
      params
    );

    if (!rows[0]) return null;
    const product = rows[0];

    // Fetch related images
    const { rows: images } = await query(
      `SELECT id, image_url, alt_text, sort_order, is_primary
       FROM product_images WHERE product_id = $1 ORDER BY sort_order ASC`,
      [productId]
    );

    // Fetch variants
    const { rows: variants } = await query(
      `SELECT id, variant_name, variant_type, mrp, retail_price,
              wholesale_price, stock_quantity, sku, is_active
       FROM product_variants WHERE product_id = $1 AND is_active = true`,
      [productId]
    );

    product.images   = images;
    product.variants = variants;

    await redis.set(cacheKey, product, PRODUCT_CACHE_TTL);
    return product;
  },

  // ═════════════════════════════════════════════════════════════
  // READ — Single product by slug (public customer detail page)
  // ═════════════════════════════════════════════════════════════
  findBySlug: async (slug) => {
    const { rows } = await query(
      `SELECT p.id FROM products p WHERE p.slug = $1 LIMIT 1`,
      [slug]
    );
    if (!rows[0]) return null;
    return ProductService.findById(rows[0].id);
  },

  // ═════════════════════════════════════════════════════════════
  // READ — Paginated list for customer storefront (public)
  // ═════════════════════════════════════════════════════════════
  getMerchantProducts: async (merchantId, filters = {}, pagination = {}) => {
    const {
      category_id, subcategory_id, search,
      min_price, max_price, in_stock,
      sort_by = 'created_at', sort_order = 'desc',
    } = filters;

    const params  = [merchantId];
    const clauses = [
      'p.merchant_id = $1',
      "p.product_status = 'active'",
      "m.merchant_status = 'active'",
    ];

    if (category_id) {
      params.push(category_id);
      clauses.push(`p.category_id = $${params.length}`);
    }
    if (subcategory_id) {
      params.push(subcategory_id);
      clauses.push(`p.subcategory_id = $${params.length}`);
    }
    if (search) {
      params.push(search);
      clauses.push(`p.search_vector @@ plainto_tsquery('english', $${params.length})`);
    }
    if (min_price !== undefined) {
      params.push(min_price);
      clauses.push(`p.retail_price >= $${params.length}`);
    }
    if (max_price !== undefined) {
      params.push(max_price);
      clauses.push(`p.retail_price <= $${params.length}`);
    }
    if (in_stock === true) {
      clauses.push('p.stock_quantity > 0');
    }

    const sortCols = {
      created_at:   'p.created_at',
      retail_price: 'p.retail_price',
      name:         'p.name',
      rating:       'p.is_featured',
    };
    const safeSort  = sortCols[sort_by]    || 'p.created_at';
    const safeOrder = sort_order === 'asc' ? 'ASC' : 'DESC';

    return queryPaginated(
      `SELECT
         p.id, p.name, p.slug, p.short_description,
         p.mrp, p.retail_price, p.wholesale_price, p.moq,
         p.stock_quantity, p.unit, p.brand,
         p.gst_percentage, p.is_featured, p.is_returnable,
         p.return_window_days, p.tags,
         m.id AS merchant_id, m.store_name, m.store_slug,
         m.rating AS merchant_rating, m.delivery_radius_km,
         m.min_order_value, m.is_open, m.accepts_cod,
         c.name AS category_name, c.slug AS category_slug,
         (SELECT image_url FROM product_images pi
          WHERE pi.product_id = p.id AND pi.is_primary = true LIMIT 1) AS primary_image,
         (SELECT COUNT(*) FROM product_variants pv
          WHERE pv.product_id = p.id AND pv.is_active = true) AS variant_count
       FROM products p
       JOIN merchants m ON m.id = p.merchant_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY p.is_featured DESC, p.is_sponsored DESC, ${safeSort} ${safeOrder}`,
      params,
      pagination
    );
  },

  // ═════════════════════════════════════════════════════════════
  // READ — Paginated list for merchant dashboard
  // ═════════════════════════════════════════════════════════════
  listForMerchant: async (merchantId, filters = {}, pagination = {}) => {
    const {
      status, category_id, subcategory_id,
      search, is_featured, min_price, max_price,
      in_stock, sort_by = 'created_at', sort_order = 'desc',
    } = filters;

    const params  = [merchantId];
    const clauses = ['p.merchant_id = $1'];

    if (status) {
      params.push(status);
      clauses.push(`p.product_status = $${params.length}`);
    }
    if (category_id) {
      params.push(category_id);
      clauses.push(`p.category_id = $${params.length}`);
    }
    if (subcategory_id) {
      params.push(subcategory_id);
      clauses.push(`p.subcategory_id = $${params.length}`);
    }
    if (search) {
      params.push(search);
      clauses.push(`p.search_vector @@ plainto_tsquery('english', $${params.length})`);
    }
    if (is_featured !== undefined) {
      params.push(is_featured);
      clauses.push(`p.is_featured = $${params.length}`);
    }
    if (min_price !== undefined) {
      params.push(min_price);
      clauses.push(`p.retail_price >= $${params.length}`);
    }
    if (max_price !== undefined) {
      params.push(max_price);
      clauses.push(`p.retail_price <= $${params.length}`);
    }
    if (in_stock === true) {
      clauses.push('p.stock_quantity > 0');
    }

    // Whitelist sort columns to prevent SQL injection
    const sortCols = {
      name: 'p.name', retail_price: 'p.retail_price',
      created_at: 'p.created_at', stock_quantity: 'p.stock_quantity',
    };
    const safeSortCol = sortCols[sort_by] || 'p.created_at';
    const safeOrder   = sort_order === 'asc' ? 'ASC' : 'DESC';

    return queryPaginated(
      `SELECT p.id, p.name, p.slug, p.sku, p.brand, p.unit,
              p.mrp, p.retail_price, p.wholesale_price, p.moq,
              p.stock_quantity, p.low_stock_threshold, p.track_inventory,
              p.gst_percentage, p.product_status, p.is_featured,
              p.is_sponsored, p.is_returnable,
              p.tags, p.created_at, p.updated_at,
              c.name AS category_name,
              (SELECT image_url FROM product_images pi
               WHERE pi.product_id = p.id AND pi.is_primary = true LIMIT 1) AS primary_image,
              (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.id) AS variant_count
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY ${safeSortCol} ${safeOrder}`,
      params,
      pagination
    );
  },

  // ═════════════════════════════════════════════════════════════
  // UPDATE
  // ═════════════════════════════════════════════════════════════
  update: async (productId, merchantId, data) => {
    // Build dynamic SET clause — only update fields that are provided
    const allowedFields = [
      'name','description','short_description','sku','barcode',
      'brand','unit','category_id','subcategory_id',
      'mrp','retail_price','wholesale_price','moq',
      'stock_quantity','low_stock_threshold','track_inventory',
      'gst_percentage','hsn_code','weight_grams',
      'tags','is_returnable','return_window_days',
    ];

    const setClauses = [];
    const params     = [];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        params.push(data[field]);
        setClauses.push(`${field} = $${params.length}`);
      }
    }

    // Regenerate slug if name changed
    if (data.name) {
      const newSlug = generateSlug(data.name);
      params.push(newSlug);
      setClauses.push(`slug = $${params.length}`);
    }

    // When merchant re-edits a rejected product, reset to pending_approval
    const { rows: current } = await query(
      'SELECT product_status FROM products WHERE id = $1 AND merchant_id = $2',
      [productId, merchantId]
    );

    if (!current[0]) {
      throw Object.assign(new Error('Product not found'), { statusCode: 404 });
    }

    if (current[0].product_status === 'rejected') {
      params.push('pending_approval');
      setClauses.push(`product_status = $${params.length}`);
    }

    if (!setClauses.length) {
      throw Object.assign(new Error('No valid fields to update'), { statusCode: 400 });
    }

    params.push(productId, merchantId);
    const { rows } = await query(
      `UPDATE products
       SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length - 1} AND merchant_id = $${params.length}
       RETURNING id, name, slug, product_status, updated_at`,
      params
    );

    await redis.del(`mlb:product:${productId}`);
    await invalidateMerchantProductCache(merchantId);

    logger.info('Product updated', { productId, merchantId });
    return rows[0];
  },

  // ═════════════════════════════════════════════════════════════
  // DELETE (soft archive — not physical delete)
  // ═════════════════════════════════════════════════════════════
  archive: async (productId, merchantId) => {
    const { rowCount } = await query(
      `UPDATE products
       SET product_status = 'archived', updated_at = NOW()
       WHERE id = $1 AND merchant_id = $2
         AND product_status != 'archived'`,
      [productId, merchantId]
    );

    if (!rowCount) {
      throw Object.assign(
        new Error('Product not found or already archived'),
        { statusCode: 404 }
      );
    }

    await redis.del(`mlb:product:${productId}`);
    await invalidateMerchantProductCache(merchantId);
    logger.info('Product archived', { productId, merchantId });
    return { archived: true };
  },

  // ═════════════════════════════════════════════════════════════
  // BULK UPLOAD
  // ═════════════════════════════════════════════════════════════
  bulkCreate: async (merchantId, products) => {
    const results = { success: [], failed: [], total: products.length };

    for (let i = 0; i < products.length; i++) {
      try {
        const product = await ProductService.create(merchantId, products[i]);
        results.success.push({ index: i, product_id: product.id, name: product.name });
      } catch (err) {
        results.failed.push({
          index: i,
          name:  products[i].name || `Row ${i + 1}`,
          error: err.message,
        });
        logger.warn('Bulk upload row failed', { index: i, merchantId, error: err.message });
      }
    }

    logger.info('Bulk upload completed', {
      merchantId,
      total:   results.total,
      success: results.success.length,
      failed:  results.failed.length,
    });

    return results;
  },

  // ═════════════════════════════════════════════════════════════
  // STOCK UPDATE (quick inventory control)
  // ═════════════════════════════════════════════════════════════
  updateStock: async (productId, merchantId, stockData) => {
    const params = [stockData.stock_quantity];
    const sets   = ['stock_quantity = $1'];

    if (stockData.low_stock_threshold !== undefined) {
      params.push(stockData.low_stock_threshold);
      sets.push(`low_stock_threshold = $${params.length}`);
    }

    // Auto-update status based on stock level
    if (stockData.stock_quantity === 0) {
      sets.push("product_status = CASE WHEN product_status = 'active' THEN 'out_of_stock' ELSE product_status END");
    } else {
      sets.push("product_status = CASE WHEN product_status = 'out_of_stock' THEN 'active' ELSE product_status END");
    }

    params.push(productId, merchantId);
    const { rows } = await query(
      `UPDATE products
       SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length - 1} AND merchant_id = $${params.length}
       RETURNING id, name, stock_quantity, low_stock_threshold, product_status`,
      params
    );

    if (!rows[0]) throw Object.assign(new Error('Product not found'), { statusCode: 404 });

    await redis.del(`mlb:product:${productId}`);
    return rows[0];
  },

  // ═════════════════════════════════════════════════════════════
  // IMAGE MANAGEMENT
  // ═════════════════════════════════════════════════════════════

  // Add images after Cloudinary upload (called after upload middleware)
  addImages: async (productId, merchantId, imageFiles) => {
    // Verify ownership
    const { rows: check } = await query(
      'SELECT id FROM products WHERE id = $1 AND merchant_id = $2', [productId, merchantId]
    );
    if (!check[0]) throw Object.assign(new Error('Product not found'), { statusCode: 404 });

    // Hard backstop cap (per-plan limit is enforced earlier by FeatureGate).
    // Service stores (e.g. Banquet Halls) allow a larger venue gallery.
    const { rows: mrow } = await query(
      'SELECT store_category FROM merchants WHERE id = $1', [merchantId]
    );
    const maxImages = mrow[0]?.store_category === 'service' ? 15 : 8;

    // Check how many images already exist
    const { rows: existing } = await query(
      'SELECT COUNT(*) AS cnt FROM product_images WHERE product_id = $1', [productId]
    );
    const existingCount = parseInt(existing[0].cnt);
    if (existingCount + imageFiles.length > maxImages) {
      throw Object.assign(
        new Error(`Maximum ${maxImages} images per product. Currently have ${existingCount}.`),
        { statusCode: 400 }
      );
    }

    const hasPrimary = existingCount === 0; // First image is primary
    const inserted   = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const { rows } = await query(
        `INSERT INTO product_images (product_id, image_url, alt_text, sort_order, is_primary)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, image_url, sort_order, is_primary`,
        [
          productId,
          file.path,            // Cloudinary URL
          file.originalname || null,
          existingCount + i,
          i === 0 && hasPrimary, // Only first image of first batch is primary
        ]
      );
      inserted.push(rows[0]);
    }

    await redis.del(`mlb:product:${productId}`);
    return inserted;
  },

  // Delete a single image
  deleteImage: async (imageId, productId, merchantId) => {
    // Verify ownership
    const { rows } = await query(
      `SELECT pi.id, pi.image_url, pi.is_primary
       FROM product_images pi
       JOIN products p ON p.id = pi.product_id
       WHERE pi.id = $1 AND pi.product_id = $2 AND p.merchant_id = $3`,
      [imageId, productId, merchantId]
    );

    if (!rows[0]) throw Object.assign(new Error('Image not found'), { statusCode: 404 });

    await query('DELETE FROM product_images WHERE id = $1', [imageId]);

    // If deleted image was primary, promote the next one
    if (rows[0].is_primary) {
      await query(
        `UPDATE product_images SET is_primary = true
         WHERE product_id = $1
         ORDER BY sort_order ASC LIMIT 1`,
        [productId]
      );
    }

    await redis.del(`mlb:product:${productId}`);

    // Return Cloudinary public_id so caller can delete from cloud
    return { deleted: true, cloudinary_url: rows[0].image_url };
  },

  // Reorder images
  reorderImages: async (productId, merchantId, imageOrders) => {
    const { rows: check } = await query(
      'SELECT id FROM products WHERE id = $1 AND merchant_id = $2', [productId, merchantId]
    );
    if (!check[0]) throw Object.assign(new Error('Product not found'), { statusCode: 404 });

    await withTransaction(async (client) => {
      for (const { image_id, sort_order } of imageOrders) {
        await client.query(
          `UPDATE product_images SET sort_order = $1 WHERE id = $2 AND product_id = $3`,
          [sort_order, image_id, productId]
        );
      }
    });

    await redis.del(`mlb:product:${productId}`);
  },

  // Set primary image
  setPrimaryImage: async (imageId, productId, merchantId) => {
    const { rows: check } = await query(
      `SELECT pi.id FROM product_images pi
       JOIN products p ON p.id = pi.product_id
       WHERE pi.id = $1 AND pi.product_id = $2 AND p.merchant_id = $3`,
      [imageId, productId, merchantId]
    );
    if (!check[0]) throw Object.assign(new Error('Image not found'), { statusCode: 404 });

    await withTransaction(async (client) => {
      await client.query(
        'UPDATE product_images SET is_primary = false WHERE product_id = $1', [productId]
      );
      await client.query(
        'UPDATE product_images SET is_primary = true WHERE id = $1', [imageId]
      );
    });

    await redis.del(`mlb:product:${productId}`);
    return { primary_set: true };
  },

  // ═════════════════════════════════════════════════════════════
  // VARIANT MANAGEMENT
  // ═════════════════════════════════════════════════════════════

  addVariant: async (productId, merchantId, variantData) => {
    const { rows: check } = await query(
      'SELECT id FROM products WHERE id = $1 AND merchant_id = $2', [productId, merchantId]
    );
    if (!check[0]) throw Object.assign(new Error('Product not found'), { statusCode: 404 });

    const { rows } = await query(
      `INSERT INTO product_variants
         (product_id, variant_name, variant_type, mrp, retail_price,
          wholesale_price, stock_quantity, sku, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        productId,
        variantData.variant_name, variantData.variant_type,
        variantData.mrp, variantData.retail_price,
        variantData.wholesale_price || null,
        variantData.stock_quantity  || 0,
        variantData.sku             || null,
        variantData.is_active !== false,
      ]
    );

    await redis.del(`mlb:product:${productId}`);
    return rows[0];
  },

  updateVariant: async (variantId, productId, merchantId, data) => {
    const allowedVariantFields = [
      'variant_name','variant_type','mrp','retail_price',
      'wholesale_price','stock_quantity','sku','is_active',
    ];
    const setClauses = [];
    const params     = [];

    for (const field of allowedVariantFields) {
      if (data[field] !== undefined) {
        params.push(data[field]);
        setClauses.push(`${field} = $${params.length}`);
      }
    }

    if (!setClauses.length) throw Object.assign(new Error('No fields to update'), { statusCode: 400 });

    params.push(variantId, productId);
    const { rows } = await query(
      `UPDATE product_variants
       SET ${setClauses.join(', ')}
       WHERE id = $${params.length - 1}
         AND product_id = $${params.length}
         AND product_id IN (SELECT id FROM products WHERE merchant_id = $${params.length + 1})
       RETURNING *`,
      [...params, merchantId]
    );

    if (!rows[0]) throw Object.assign(new Error('Variant not found'), { statusCode: 404 });
    await redis.del(`mlb:product:${productId}`);
    return rows[0];
  },

  deleteVariant: async (variantId, productId, merchantId) => {
    const { rowCount } = await query(
      `DELETE FROM product_variants
       WHERE id = $1
         AND product_id = $2
         AND product_id IN (SELECT id FROM products WHERE merchant_id = $3)`,
      [variantId, productId, merchantId]
    );
    if (!rowCount) throw Object.assign(new Error('Variant not found'), { statusCode: 404 });
    await redis.del(`mlb:product:${productId}`);
    return { deleted: true };
  },

  // ═════════════════════════════════════════════════════════════
  // LOW STOCK ALERTS (for merchant dashboard widget)
  // ═════════════════════════════════════════════════════════════
  getLowStockProducts: async (merchantId, limit = 10) => {
    const { rows } = await query(
      `SELECT p.id, p.name, p.sku, p.stock_quantity, p.low_stock_threshold,
              p.product_status,
              (SELECT image_url FROM product_images pi
               WHERE pi.product_id = p.id AND pi.is_primary = true LIMIT 1) AS image
       FROM products p
       WHERE p.merchant_id = $1
         AND p.track_inventory = true
         AND p.stock_quantity <= p.low_stock_threshold
         AND p.product_status NOT IN ('archived','rejected')
       ORDER BY p.stock_quantity ASC
       LIMIT $2`,
      [merchantId, limit]
    );
    return rows;
  },
};

module.exports = ProductService;
