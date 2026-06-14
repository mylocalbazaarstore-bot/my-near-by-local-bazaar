// src/services/area.service.js
// ─────────────────────────────────────────────────────────────
// Area & Hyperlocal Discovery Service — MyLocalBazaar.store
// Uses PostGIS ST_Distance/ST_DWithin (geography columns) +
// merchant_area_availability VIEW for delivery zone matching
// ─────────────────────────────────────────────────────────────

const { query, queryPaginated } = require('../config/db');
const { redis }                 = require('../config/redis');
const logger                    = require('../config/logger');

const CACHE_TTL = 300; // 5 minutes for area data

// ═══════════════════════════════════════════════════════════════
// AREA DISCOVERY
// ═══════════════════════════════════════════════════════════════

const AreaService = {

  // ── Get all cities ────────────────────────────────────────────
  getCities: async () => {
    const cacheKey = 'mlb:cities';
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const { rows } = await query(
      `SELECT id, name, state, country
       FROM cities WHERE is_active = true
       ORDER BY name ASC`
    );

    await redis.set(cacheKey, rows, CACHE_TTL);
    return rows;
  },

  // ── Get areas by pincode ───────────────────────────────────────
  getByPincode: async (pincode) => {
    const cacheKey = `mlb:area:${pincode}`;
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const { rows } = await query(
      `SELECT a.id, a.name, a.pincode, a.latitude, a.longitude,
              c.id AS city_id, c.name AS city_name, c.state
       FROM areas a
       JOIN cities c ON c.id = a.city_id
       WHERE a.pincode = $1 AND a.is_active = true
       ORDER BY a.name ASC`,
      [pincode]
    );

    if (rows.length) await redis.set(cacheKey, rows, CACHE_TTL);
    return rows;
  },

  // ── Text search on area name or pincode ─────────────────────
  search: async (searchTerm, { page = 1, limit = 20 } = {}) => {
    const term = `%${searchTerm.toLowerCase()}%`;
    return queryPaginated(
      `SELECT a.id, a.name, a.pincode, a.latitude, a.longitude,
              c.id AS city_id, c.name AS city_name, c.state
       FROM areas a
       JOIN cities c ON c.id = a.city_id
       WHERE a.is_active = true
         AND (LOWER(a.name) LIKE $1 OR a.pincode LIKE $1 OR LOWER(c.name) LIKE $1)
       ORDER BY a.name ASC`,
      [term],
      { page, limit }
    );
  },

  // ── Find nearby areas by lat/lng (PostGIS radius) ─────────────
  getNearby: async (lat, lng, radiusKm = 5) => {
    const cacheKey = `mlb:nearby:${lat.toFixed(3)}:${lng.toFixed(3)}:${radiusKm}`;
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const { rows } = await query(
      `SELECT a.id, a.name, a.pincode, a.latitude, a.longitude,
              c.name AS city_name, c.state,
              ROUND((ST_Distance(a.geom, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) / 1000)::numeric, 2) AS distance_km
       FROM areas a
       JOIN cities c ON c.id = a.city_id
       WHERE a.is_active = true
         AND a.geom IS NOT NULL
         AND ST_DWithin(a.geom, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3::float8 * 1000)
       ORDER BY distance_km ASC
       LIMIT 20`,
      [lat, lng, radiusKm]
    );

    await redis.set(cacheKey, rows, CACHE_TTL);
    return rows;
  },

  // ── Get area by ID ────────────────────────────────────────────
  getById: async (areaId) => {
    const cacheKey = `mlb:area_id:${areaId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const { rows } = await query(
      `SELECT a.id, a.name, a.pincode, a.latitude, a.longitude,
              c.id AS city_id, c.name AS city_name, c.state
       FROM areas a
       JOIN cities c ON c.id = a.city_id
       WHERE a.id = $1 AND a.is_active = true`,
      [areaId]
    );

    if (rows[0]) await redis.set(cacheKey, rows[0], CACHE_TTL);
    return rows[0] || null;
  },
};

// ═══════════════════════════════════════════════════════════════
// MERCHANT DISCOVERY (PostGIS delivery zone check)
// ═══════════════════════════════════════════════════════════════

const MerchantDiscoveryService = {

  // ── Merchants available in a specific area (uses VIEW) ────────
  // This is the core hyperlocal logic: checks if the merchant's
  // delivery_radius_km covers the customer's area centroid
  getByArea: async (areaId, filters = {}, pagination = {}) => {
    const {
      store_category, is_open, sort_by = 'distance',
    } = filters;
    const { page = 1, limit = 20 } = pagination;

    const params  = [areaId];
    const clauses = [];

    if (store_category) {
      params.push(store_category);
      clauses.push(`m.store_category = $${params.length}`);
    }
    if (is_open !== undefined) {
      params.push(is_open);
      clauses.push(`m.is_open = $${params.length}`);
    }

    const whereExtra = clauses.length ? `AND ${clauses.join(' AND ')}` : '';

    const sortMap = {
      distance: 'maa.distance_km ASC',
      rating:   'm.rating DESC',
      name:     'm.store_name ASC',
    };
    const orderBy = sortMap[sort_by] || 'maa.distance_km ASC';

    return queryPaginated(
      `SELECT
         m.id, m.store_name, m.store_slug, m.store_category,
         m.store_logo_url, m.store_banner_url, m.store_description,
         m.delivery_radius_km, m.min_order_value, m.is_open,
         m.rating, m.total_reviews, m.is_featured,
         m.accepts_cod, m.emergency_booking,
         m.pincode, m.latitude, m.longitude,
         maa.distance_km,
         maa.area_name AS delivery_area,
         (SELECT COUNT(*) FROM products p
          WHERE p.merchant_id = m.id AND p.product_status = 'active') AS active_products
       FROM merchant_area_availability maa
       JOIN merchants m ON m.id = maa.merchant_id
       WHERE maa.area_id = $1
         AND maa.is_within_zone = true
         AND m.merchant_status = 'active'
         ${whereExtra}
       ORDER BY m.is_featured DESC, ${orderBy}`,
      params,
      { page, limit }
    );
  },

  // ── Merchants within radius of lat/lng (PostGIS radius) ──────
  getByCoords: async (lat, lng, radiusKm = 5, filters = {}, pagination = {}) => {
    const { store_category, is_open, sort_by = 'distance' } = filters;
    const { page = 1, limit = 20 } = pagination;

    const params  = [lat, lng, radiusKm];
    const clauses = [
      'm.merchant_status = $4', 'm.is_active = true',
      'm.geom IS NOT NULL',
      'ST_DWithin(m.geom, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3::float8 * 1000)',
    ];
    params.push('active'); // $4

    if (store_category) {
      params.push(store_category);
      clauses.push(`m.store_category = $${params.length}`);
    }
    if (is_open !== undefined) {
      params.push(is_open);
      clauses.push(`m.is_open = $${params.length}`);
    }

    const sortMap = {
      distance: 'distance_km ASC',
      rating:   'rating DESC',
      name:     'store_name ASC',
    };

    return queryPaginated(
      `SELECT id, store_name, store_slug, store_category,
              store_logo_url, store_banner_url,
              delivery_radius_km, min_order_value, is_open,
              rating, total_reviews, is_featured,
              accepts_cod, emergency_booking, pincode,
              ROUND(distance_km::numeric, 2) AS distance_km
       FROM (
         SELECT m.id, m.store_name, m.store_slug, m.store_category,
                m.store_logo_url, m.store_banner_url,
                m.delivery_radius_km, m.min_order_value, m.is_open,
                m.rating, m.total_reviews, m.is_featured,
                m.accepts_cod, m.emergency_booking, m.pincode,
                ST_Distance(m.geom, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) / 1000 AS distance_km
         FROM merchants m
         WHERE ${clauses.join(' AND ')}
       ) sub
       ORDER BY is_featured DESC, ${sortMap[sort_by] || 'distance_km ASC'}`,
      params,
      { page, limit }
    );
  },

  // ── Merchants by pincode (joins via areas table) ───────────────
  getByPincode: async (pincode, filters = {}, pagination = {}) => {
    // Resolve pincode → area centroid → use radius
    const { rows: areas } = await query(
      'SELECT id, latitude, longitude FROM areas WHERE pincode = $1 AND is_active = true LIMIT 1',
      [pincode]
    );

    if (!areas[0] || !areas[0].latitude) {
      // Fallback: simple pincode match without PostGIS
      return MerchantDiscoveryService._getByPincodeFallback(pincode, filters, pagination);
    }

    return MerchantDiscoveryService.getByArea(areas[0].id, filters, pagination);
  },

  // Fallback: pincode text match (when geom not available)
  _getByPincodeFallback: async (pincode, filters, pagination) => {
    const { store_category, is_open } = filters;
    const { page = 1, limit = 20 } = pagination;
    const params = [pincode, 'active'];
    const clauses = [];

    if (store_category) { params.push(store_category); clauses.push(`m.store_category = $${params.length}`); }
    if (is_open !== undefined) { params.push(is_open); clauses.push(`m.is_open = $${params.length}`); }

    return queryPaginated(
      `SELECT m.id, m.store_name, m.store_slug, m.store_category,
              m.store_logo_url, m.delivery_radius_km, m.min_order_value,
              m.is_open, m.rating, m.total_reviews, m.is_featured
       FROM merchants m
       WHERE m.pincode = $1 AND m.merchant_status = $2
         ${clauses.length ? 'AND ' + clauses.join(' AND ') : ''}
       ORDER BY m.is_featured DESC, m.rating DESC`,
      params,
      { page, limit }
    );
  },

  // ── Verify customer address is in merchant's delivery zone ────
  // Critical for order placement validation
  isAddressInDeliveryZone: async (merchantId, customerAddressId) => {
    const { rows } = await query(
      `SELECT
         m.id AS merchant_id,
         m.delivery_radius_km,
         6371 * acos(
           LEAST(1.0, cos(radians(m.latitude)) * cos(radians(ua.latitude)) *
           cos(radians(ua.longitude) - radians(m.longitude)) +
           sin(radians(m.latitude)) * sin(radians(ua.latitude)))
         ) AS distance_km
       FROM merchants m
       JOIN user_addresses ua ON ua.id = $2
       WHERE m.id = $1
         AND m.latitude  IS NOT NULL
         AND m.longitude IS NOT NULL
         AND ua.latitude  IS NOT NULL
         AND ua.longitude IS NOT NULL`,
      [merchantId, customerAddressId]
    );

    if (!rows[0]) {
      // Cannot verify without coordinates — allow and check at fulfillment
      return { verified: false, reason: 'Coordinates not available', withinZone: true };
    }

    const { distance_km, delivery_radius_km } = rows[0];
    const withinZone = parseFloat(distance_km) <= parseFloat(delivery_radius_km);

    return {
      verified: true,
      withinZone,
      distance_km:       parseFloat(distance_km).toFixed(2),
      delivery_radius_km: parseFloat(delivery_radius_km),
    };
  },
};

module.exports = { AreaService, MerchantDiscoveryService };
