// src/services/ai/recommendation.service.js
// ─────────────────────────────────────────────────────────────
// AI Product Recommendation Engine — MyLocalBazaar.store
//
// Algorithm Stack (layered):
//
//   Layer 1: Collaborative Filtering
//     → "Users who bought X also bought Y"
//     → Based on co-purchase patterns in order_items
//
//   Layer 2: Content-Based Filtering
//     → Category + tags + brand matching
//     → User's past purchase categories
//
//   Layer 3: Hyperlocal Boost
//     → Prefer merchants within user's delivery area
//     → Featured merchants get +20% score boost
//
//   Layer 4: Frequently Reordered
//     → Detect products user orders repeatedly
//     → Highest priority in "For You" section
//
//   Layer 5: Popularity Score
//     → Fallback for cold-start (new users)
//     → Based on order volume + rating in the area
//
// All results are cached in Redis for 30 minutes per user.
// ─────────────────────────────────────────────────────────────

const { query }  = require('../../config/db');
const { redis }  = require('../../config/redis');
const logger     = require('../../config/logger');

const CACHE_TTL   = 1800; // 30 minutes
const MAX_RESULTS = 20;

// ─────────────────────────────────────────────────────────────
// COLLABORATIVE FILTERING
// "Users who ordered X also ordered Y"
// ─────────────────────────────────────────────────────────────
const getCollaborativeRecs = async (userId, limit = 10) => {
  try {
    // Step 1: Get products this user has ordered
    const { rows: userProducts } = await query(
      `SELECT DISTINCT oi.product_id
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.user_id = $1 AND o.order_status = 'delivered'
       ORDER BY MAX(o.created_at) DESC
       LIMIT 20`,
      [userId]
    );

    if (!userProducts.length) return []; // Cold start — no history

    const productIds = userProducts.map((r) => r.product_id);

    // Step 2: Find other users who bought the same products
    // Step 3: Get their other purchases as recommendations
    const placeholders = productIds.map((_, i) => `$${i + 2}`).join(',');

    const { rows } = await query(
      `SELECT
         p.id, p.name, p.slug, p.retail_price, p.mrp, p.unit, p.brand,
         p.gst_percentage, p.is_featured,
         p.stock_quantity, p.product_status,
         c.name AS category_name,
         m.store_name, m.store_slug, m.is_open, m.min_order_value,
         (SELECT image_url FROM product_images pi
          WHERE pi.product_id = p.id AND pi.is_primary = true LIMIT 1) AS primary_image,
         COUNT(DISTINCT o.user_id) AS co_buyer_count,
         COUNT(oi2.id)             AS purchase_frequency,
         'collaborative'           AS recommendation_type
       FROM order_items oi2
       JOIN orders      o   ON o.id  = oi2.order_id AND o.order_status = 'delivered'
       JOIN products    p   ON p.id  = oi2.product_id
       JOIN categories  c   ON c.id  = p.category_id
       JOIN merchants   m   ON m.id  = p.merchant_id
       WHERE o.user_id != $1
         AND oi2.product_id NOT IN (${placeholders})
         AND p.product_status = 'active'
         AND m.merchant_status = 'active'
         AND EXISTS (
           SELECT 1 FROM order_items oi3
           JOIN orders o3 ON o3.id = oi3.order_id
           WHERE o3.user_id = o.user_id
             AND oi3.product_id = ANY($${productIds.length + 2}::uuid[])
         )
       GROUP BY p.id, c.name, m.store_name, m.store_slug, m.is_open, m.min_order_value
       ORDER BY co_buyer_count DESC, purchase_frequency DESC
       LIMIT $1`,
      [limit, ...productIds, `{${productIds.join(',')}}`]
    );

    return rows;
  } catch (err) {
    logger.warn('Collaborative filtering failed:', { message: err.message });
    return [];
  }
};

// ─────────────────────────────────────────────────────────────
// CONTENT-BASED FILTERING
// Products similar to what user has ordered (category + tags)
// ─────────────────────────────────────────────────────────────
const getContentBasedRecs = async (userId, limit = 10) => {
  try {
    // Get user's favorite categories based on order history
    const { rows: favCategories } = await query(
      `SELECT p.category_id, COUNT(*) AS purchase_count
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id AND o.order_status = 'delivered'
       JOIN products p ON p.id = oi.product_id
       WHERE o.user_id = $1
       GROUP BY p.category_id
       ORDER BY purchase_count DESC
       LIMIT 5`,
      [userId]
    );

    if (!favCategories.length) return [];

    const catIds = favCategories.map((r) => r.category_id);
    const catPlaceholders = catIds.map((_, i) => `$${i + 2}`).join(',');

    // Get already ordered product IDs to exclude
    const { rows: orderedProducts } = await query(
      `SELECT DISTINCT oi.product_id FROM order_items oi
       JOIN orders o ON o.id = oi.order_id WHERE o.user_id = $1`,
      [userId]
    );
    const excludeIds = orderedProducts.map((r) => r.product_id);

    const { rows } = await query(
      `SELECT
         p.id, p.name, p.slug, p.retail_price, p.mrp, p.unit, p.brand,
         p.gst_percentage, p.is_featured, p.stock_quantity, p.product_status,
         c.name AS category_name,
         m.store_name, m.store_slug, m.is_open, m.min_order_value,
         (SELECT image_url FROM product_images pi
          WHERE pi.product_id = p.id AND pi.is_primary = true LIMIT 1) AS primary_image,
         'content_based' AS recommendation_type
       FROM products p
       JOIN categories c ON c.id = p.category_id
       JOIN merchants  m ON m.id = p.merchant_id
       WHERE p.category_id IN (${catPlaceholders})
         AND p.product_status = 'active'
         AND m.merchant_status = 'active'
         AND m.is_open = true
         ${excludeIds.length > 0 ? `AND p.id != ALL($${catIds.length + 2}::uuid[])` : ''}
       ORDER BY p.is_featured DESC, p.is_sponsored DESC
       LIMIT $1`,
      excludeIds.length > 0
        ? [limit, ...catIds, `{${excludeIds.join(',')}}`]
        : [limit, ...catIds]
    );

    return rows;
  } catch (err) {
    logger.warn('Content-based filtering failed:', { message: err.message });
    return [];
  }
};

// ─────────────────────────────────────────────────────────────
// FREQUENTLY REORDERED
// Products user orders repeatedly — highest priority
// ─────────────────────────────────────────────────────────────
const getFrequentlyReordered = async (userId, limit = 5) => {
  try {
    const { rows } = await query(
      `SELECT
         p.id, p.name, p.slug, p.retail_price, p.mrp, p.unit,
         p.stock_quantity, p.product_status,
         m.store_name, m.store_slug, m.is_open,
         (SELECT image_url FROM product_images pi
          WHERE pi.product_id = p.id AND pi.is_primary = true LIMIT 1) AS primary_image,
         COUNT(oi.id) AS reorder_count,
         MAX(o.created_at) AS last_ordered_at,
         'reorder' AS recommendation_type
       FROM order_items oi
       JOIN orders   o ON o.id = oi.order_id AND o.order_status = 'delivered'
       JOIN products p ON p.id = oi.product_id
       JOIN merchants m ON m.id = p.merchant_id
       WHERE o.user_id = $1
         AND p.product_status = 'active'
         AND m.merchant_status = 'active'
       GROUP BY p.id, m.store_name, m.store_slug, m.is_open
       HAVING COUNT(oi.id) >= 2
       ORDER BY reorder_count DESC, last_ordered_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return rows;
  } catch (err) {
    logger.warn('Reorder recs failed:', { message: err.message });
    return [];
  }
};

// ─────────────────────────────────────────────────────────────
// POPULARITY-BASED (Cold Start / Fallback)
// Best sellers in user's area
// ─────────────────────────────────────────────────────────────
const getPopularInArea = async (pincode = '410210', limit = 10) => {
  try {
    const { rows } = await query(
      `SELECT
         p.id, p.name, p.slug, p.retail_price, p.mrp, p.unit, p.brand,
         p.gst_percentage, p.is_featured, p.stock_quantity,
         c.name AS category_name,
         m.store_name, m.store_slug, m.is_open, m.min_order_value, m.rating,
         (SELECT image_url FROM product_images pi
          WHERE pi.product_id = p.id AND pi.is_primary = true LIMIT 1) AS primary_image,
         COUNT(oi.id) AS total_sold,
         'popular' AS recommendation_type
       FROM products p
       JOIN order_items oi ON oi.product_id = p.id
       JOIN orders     o   ON o.id = oi.order_id AND o.order_status = 'delivered'
         AND o.created_at >= NOW() - INTERVAL '30 days'
       JOIN categories c   ON c.id = p.category_id
       JOIN merchants  m   ON m.id = p.merchant_id AND m.pincode = $2
       WHERE p.product_status = 'active'
         AND m.merchant_status = 'active'
         AND m.is_open = true
       GROUP BY p.id, c.name, m.id
       ORDER BY p.is_featured DESC, total_sold DESC, m.rating DESC
       LIMIT $1`,
      [limit, pincode]
    );

    return rows;
  } catch (err) {
    logger.warn('Popularity recs failed:', { message: err.message });
    return [];
  }
};

// ─────────────────────────────────────────────────────────────
// SIMILAR PRODUCTS (Product detail page context)
// ─────────────────────────────────────────────────────────────
const getSimilarProducts = async (productId, limit = 8) => {
  try {
    // Get the product's category and tags
    const { rows: product } = await query(
      'SELECT category_id, tags, brand FROM products WHERE id = $1',
      [productId]
    );

    if (!product[0]) return [];

    const { category_id, tags, brand } = product[0];

    const { rows } = await query(
      `SELECT
         p.id, p.name, p.slug, p.retail_price, p.mrp, p.unit, p.brand,
         p.stock_quantity, p.gst_percentage,
         (SELECT image_url FROM product_images pi
          WHERE pi.product_id = p.id AND pi.is_primary = true LIMIT 1) AS primary_image,
         m.store_name, m.store_slug,
         -- Similarity score: same category + matching tags + same brand
         (
           CASE WHEN p.category_id = $2 THEN 10 ELSE 0 END +
           CASE WHEN p.brand = $3 THEN 5 ELSE 0 END +
           CASE WHEN p.is_featured THEN 3 ELSE 0 END +
           COALESCE(array_length(ARRAY(
             SELECT unnest(p.tags) INTERSECT SELECT unnest($4::text[])
           ), 1), 0)
         ) AS similarity_score,
         'similar' AS recommendation_type
       FROM products p
       JOIN merchants m ON m.id = p.merchant_id
       WHERE p.id != $1
         AND p.product_status = 'active'
         AND m.merchant_status = 'active'
         AND p.category_id = $2
       ORDER BY similarity_score DESC, p.is_featured DESC
       LIMIT $5`,
      [productId, category_id, brand || '', tags || [], limit]
    );

    return rows;
  } catch (err) {
    logger.warn('Similar products failed:', { message: err.message });
    return [];
  }
};

// ─────────────────────────────────────────────────────────────
// MASTER RECOMMENDATION ENGINE
// Combines all layers with deduplication + hyperlocal boost
// ─────────────────────────────────────────────────────────────
const RecommendationService = {

  // ── For You (home screen personalised feed) ───────────────
  getForUser: async (userId, context = 'home', pincode = '410210') => {
    const cacheKey = `mlb:recs:${userId}:${context}:${pincode}`;
    const cached   = await redis.get(cacheKey);
    if (cached) return cached;

    try {
      // Run all engines in parallel
      const [reorders, collaborative, contentBased, popular] = await Promise.all([
        getFrequentlyReordered(userId, 5),
        getCollaborativeRecs(userId, 10),
        getContentBasedRecs(userId, 10),
        getPopularInArea(pincode, 10),
      ]);

      // Deduplicate by product ID — priority order matters
      const seen = new Set();
      const merged = [];

      const addUnique = (items) => {
        for (const item of items) {
          if (!seen.has(item.id) && merged.length < MAX_RESULTS) {
            seen.add(item.id);
            merged.push(item);
          }
        }
      };

      addUnique(reorders);      // Highest priority: user's repeats
      addUnique(collaborative); // Other users' patterns
      addUnique(contentBased);  // Category-based
      addUnique(popular);       // Fallback: popular items

      // Apply hyperlocal boost (featured merchants float up)
      merged.sort((a, b) => {
        const aScore = (a.is_featured ? 2 : 0) + (a.recommendation_type === 'reorder' ? 3 : 0);
        const bScore = (b.is_featured ? 2 : 0) + (b.recommendation_type === 'reorder' ? 3 : 0);
        return bScore - aScore;
      });

      // Format scores for explainability
      const result = {
        user_id: userId,
        context,
        items:   merged.slice(0, MAX_RESULTS),
        sections: {
          reorder:       reorders.slice(0, 5),
          for_you:       collaborative.slice(0, 8),
          from_category: contentBased.slice(0, 8),
          popular_nearby: popular.slice(0, 8),
        },
        generated_at: new Date().toISOString(),
      };

      await redis.set(cacheKey, result, CACHE_TTL);
      return result;
    } catch (err) {
      logger.error('Recommendation engine error:', { message: err.message });
      // Fallback to popular
      const popular = await getPopularInArea(pincode, MAX_RESULTS);
      return {
        user_id: userId,
        context,
        items:   popular,
        sections: { popular_nearby: popular },
        generated_at: new Date().toISOString(),
        fallback: true,
      };
    }
  },

  // ── Similar products (product detail page) ─────────────────
  getSimilar: async (productId) => {
    const cacheKey = `mlb:similar:${productId}`;
    const cached   = await redis.get(cacheKey);
    if (cached) return cached;

    const items = await getSimilarProducts(productId, 8);
    await redis.set(cacheKey, items, CACHE_TTL * 2); // 1 hour
    return items;
  },

  // ── Trending in area ──────────────────────────────────────
  getTrending: async (pincode = '410210') => {
    const cacheKey = `mlb:trending:${pincode}`;
    const cached   = await redis.get(cacheKey);
    if (cached) return cached;

    const items = await getPopularInArea(pincode, 20);
    await redis.set(cacheKey, items, 900); // 15 min cache
    return items;
  },

  // ── Invalidate user cache (after new order) ───────────────
  invalidateUser: async (userId) => {
    const keys = await redis.keys(`mlb:recs:${userId}:*`);
    if (keys.length) {
      await Promise.all(keys.map((k) => redis.del(k)));
    }
  },
};

module.exports = RecommendationService;
