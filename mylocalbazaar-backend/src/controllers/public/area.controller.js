// src/controllers/public/area.controller.js
// ─────────────────────────────────────────────────────────────
// Area & Hyperlocal Discovery Controller — MyLocalBazaar.store
// PUBLIC endpoints — no auth required
//
// ENDPOINTS:
//   GET /areas/cities                  → List all cities
//   GET /areas/pincode/:pincode        → Areas for a pincode
//   GET /areas/search?q=Kharghar      → Area text search
//   GET /areas/nearby?lat=&lng=        → Nearby areas (PostGIS)
//   GET /areas/:id                     → Single area details
//   GET /areas/:id/merchants           → Merchants in this area
//   GET /merchants/by-pincode/:pincode → Merchants by pincode
//   GET /merchants/by-coords           → Merchants by lat/lng
//   GET /merchants/:slug               → Single merchant storefront detail
//   POST /areas/verify-delivery        → Check delivery zone
// ─────────────────────────────────────────────────────────────

const { query } = require('../../config/db');
const { AreaService, MerchantDiscoveryService } = require('../../services/area.service');
const { success, notFound, badRequest, paginated } = require('../../utils/response');

// ── GET /areas/cities ─────────────────────────────────────────
const getCities = async (req, res) => {
  const cities = await AreaService.getCities();
  return success(res, { cities }, 'Cities fetched');
};

// ── GET /areas/pincode/:pincode ───────────────────────────────
const getByPincode = async (req, res) => {
  const { pincode } = req.params;
  const areas = await AreaService.getByPincode(pincode);

  if (!areas.length) {
    return notFound(res, `No service areas found for pincode ${pincode}. We may be expanding there soon!`);
  }

  return success(res, { areas, count: areas.length }, 'Areas fetched');
};

// ── GET /areas/search?q= ──────────────────────────────────────
const searchAreas = async (req, res) => {
  const { q: searchTerm, page = 1, limit = 20 } = req.query;
  if (!searchTerm || searchTerm.trim().length < 2) {
    return badRequest(res, 'Search term must be at least 2 characters');
  }

  const result = await AreaService.search(searchTerm.trim(), { page, limit });
  return paginated(res, result, 'Area search results');
};

// ── GET /areas/nearby?lat=&lng=&radius_km= ────────────────────
const getNearby = async (req, res) => {
  const { lat, lng, radius_km = 5 } = req.query;

  if (!lat || !lng) {
    return badRequest(res, 'latitude (lat) and longitude (lng) are required');
  }

  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);

  if (isNaN(parsedLat) || isNaN(parsedLng)) {
    return badRequest(res, 'lat and lng must be valid numbers');
  }

  const areas = await AreaService.getNearby(parsedLat, parsedLng, parseFloat(radius_km));

  return success(res, {
    areas,
    count:      areas.length,
    searched_at: { lat: parsedLat, lng: parsedLng, radius_km: parseFloat(radius_km) },
  }, 'Nearby areas fetched');
};

// ── GET /areas/:id ────────────────────────────────────────────
const getAreaById = async (req, res) => {
  const area = await AreaService.getById(req.params.id);
  if (!area) return notFound(res, 'Area not found');
  return success(res, { area });
};

// ── GET /areas/:id/merchants ──────────────────────────────────
const getMerchantsByArea = async (req, res) => {
  const { id: areaId } = req.params;
  const {
    store_category, is_open,
    sort_by = 'distance',
    page = 1, limit = 20,
  } = req.query;

  const area = await AreaService.getById(areaId);
  if (!area) return notFound(res, 'Area not found');

  const result = await MerchantDiscoveryService.getByArea(
    areaId,
    {
      store_category,
      is_open: is_open !== undefined ? is_open === 'true' : undefined,
      sort_by,
    },
    { page, limit }
  );

  return paginated(res, result, `Merchants in ${area.name}`);
};

// ── GET /merchants/by-pincode/:pincode ────────────────────────
const getMerchantsByPincode = async (req, res) => {
  const { pincode } = req.params;
  const {
    store_category, is_open,
    sort_by = 'distance',
    page = 1, limit = 20,
  } = req.query;

  const result = await MerchantDiscoveryService.getByPincode(
    pincode,
    {
      store_category,
      is_open: is_open !== undefined ? is_open === 'true' : undefined,
      sort_by,
    },
    { page, limit }
  );

  return paginated(res, result, `Merchants serving pincode ${pincode}`);
};

// ── GET /merchants/by-coords?lat=&lng=&radius_km= ─────────────
const getMerchantsByCoords = async (req, res) => {
  const { lat, lng, radius_km = 5, store_category, is_open, sort_by, page = 1, limit = 20 } = req.query;

  if (!lat || !lng) return badRequest(res, 'lat and lng are required');

  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  if (isNaN(parsedLat) || isNaN(parsedLng)) {
    return badRequest(res, 'lat and lng must be valid numbers');
  }

  const result = await MerchantDiscoveryService.getByCoords(
    parsedLat, parsedLng, parseFloat(radius_km),
    {
      store_category,
      is_open: is_open !== undefined ? is_open === 'true' : undefined,
      sort_by: sort_by || 'distance',
    },
    { page, limit }
  );

  return paginated(res, result, 'Merchants near your location');
};

// ── GET /merchants/:slug ───────────────────────────────────────
// Single merchant storefront detail (header data for /store/[slug])
const getMerchantBySlug = async (req, res) => {
  const { slug } = req.params;

  const { rows } = await query(
    `SELECT
       m.id, m.store_name, m.store_slug, m.store_category, m.store_description,
       m.store_logo_url, m.store_banner_url,
       m.address_line1, m.address_line2, m.landmark,
       a.name AS area_name, m.pincode, c.name AS city_name, c.state,
       m.latitude, m.longitude,
       m.delivery_radius_km, m.min_order_value, m.is_open, m.merchant_status,
       m.accepts_cod, m.emergency_booking, m.is_featured,
       m.rating, m.total_reviews, m.created_at,
       (SELECT COUNT(*) FROM products p
        WHERE p.merchant_id = m.id AND p.product_status = 'active') AS active_products
     FROM merchants m
     LEFT JOIN areas a  ON a.id = m.area_id
     LEFT JOIN cities c ON c.id = a.city_id
     WHERE m.store_slug = $1 AND m.merchant_status = 'active'
     LIMIT 1`,
    [slug]
  );

  if (!rows[0]) return notFound(res, 'Store not found');
  const merchant = rows[0];

  merchant.address = [merchant.address_line1, merchant.address_line2, merchant.landmark]
    .filter(Boolean)
    .join(', ');

  const { rows: opening_hours } = await query(
    `SELECT day_of_week, open_time, close_time, is_closed
     FROM merchant_operating_hours
     WHERE merchant_id = $1
     ORDER BY day_of_week ASC`,
    [merchant.id]
  );
  merchant.opening_hours = opening_hours;

  return success(res, { merchant }, 'Store details fetched');
};

// ── POST /areas/verify-delivery ───────────────────────────────
// Body: { merchant_id, address_id }
// Used at cart checkout to confirm merchant delivers to customer's address
const verifyDelivery = async (req, res) => {
  const { merchant_id, address_id } = req.body;

  if (!merchant_id || !address_id) {
    return badRequest(res, 'merchant_id and address_id are required');
  }

  const result = await MerchantDiscoveryService.isAddressInDeliveryZone(merchant_id, address_id);

  if (!result.withinZone) {
    return success(res, {
      delivers: false,
      distance_km:        result.distance_km,
      delivery_radius_km: result.delivery_radius_km,
      message: `This merchant delivers within ${result.delivery_radius_km}km. Your address is ${result.distance_km}km away.`,
    }, 'Delivery not available for this address');
  }

  return success(res, {
    delivers:           true,
    distance_km:        result.distance_km,
    delivery_radius_km: result.delivery_radius_km,
    message:            'Delivery is available for your address',
  }, 'Delivery available');
};

module.exports = {
  getCities,
  getByPincode,
  searchAreas,
  getNearby,
  getAreaById,
  getMerchantsByArea,
  getMerchantsByPincode,
  getMerchantsByCoords,
  getMerchantBySlug,
  verifyDelivery,
};
