// src/controllers/ai/recommendation.controller.js
// ─────────────────────────────────────────────────────────────
// AI Recommendation Controller — MyLocalBazaar.store
// ENDPOINTS:
//   GET /ai/recommendations           → Personalised home feed
//   GET /ai/recommendations/trending  → Trending in user's area
//   GET /ai/recommendations/similar/:productId → Similar products
//   POST /ai/recommendations/invalidate → Clear cache (after order)
// ─────────────────────────────────────────────────────────────

const RecommendationService = require('../../services/ai/recommendation.service');
const { success } = require('../../utils/response');
const { redis }   = require('../../config/redis');

const getRecommendations = async (req, res) => {
  const userId  = req.user?.id;
  const { context = 'home', limit = 10 } = req.query;

  // Get user's saved area from Redis
  const areaData = userId ? await redis.get(`mlb:selected_area:${userId}`) : null;
  const pincode  = areaData?.pincode || '410210';

  const result = userId
    ? await RecommendationService.getForUser(userId, context, pincode)
    : await RecommendationService.getTrending(pincode);

  return success(res, result, 'Recommendations fetched');
};

const getTrending = async (req, res) => {
  const areaData = req.user ? await redis.get(`mlb:selected_area:${req.user.id}`) : null;
  const pincode  = req.query.pincode || areaData?.pincode || '410210';
  const items    = await RecommendationService.getTrending(pincode);
  return success(res, { items, pincode }, 'Trending products');
};

const getSimilar = async (req, res) => {
  const { productId } = req.params;
  const items = await RecommendationService.getSimilar(productId);
  return success(res, { items, product_id: productId }, 'Similar products');
};

const invalidateCache = async (req, res) => {
  if (req.user?.id) {
    await RecommendationService.invalidateUser(req.user.id);
  }
  return success(res, null, 'Recommendation cache cleared');
};

module.exports = { getRecommendations, getTrending, getSimilar, invalidateCache };


// ─────────────────────────────────────────────────────────────
// FRANCHISE CONTROLLER
// ─────────────────────────────────────────────────────────────

const { FranchiseService } = require('../../services/franchise.service');
const { success: suc, created: cre, notFound: nf, badRequest: br, paginated: pag } = require('../../utils/response');
const { queryPaginated } = require('../../config/db');

const franchiseController = {

  // POST /franchise/apply (public)
  apply: async (req, res) => {
    const result = await FranchiseService.apply(req.body);
    return cre(res, { application: result },
      '🎉 Franchise application submitted! Our team will contact you within 48 hours.');
  },

  // GET /franchise/territories (public)
  getTerritories: async (req, res) => {
    const territories = await FranchiseService.getTerritories();
    return suc(res, { territories }, 'Active franchise territories');
  },

  // GET /franchise/admin/applications (admin)
  listApplications: async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;
    const result = await FranchiseService.listApplications(status, { page, limit });
    return pag(res, result, 'Franchise applications');
  },

  // POST /franchise/admin/onboard (admin)
  onboard: async (req, res) => {
    const result = await FranchiseService.onboard(req.user.id, req.params.id, req.body);
    return suc(res, result, `✅ Franchise territory for ${result.territory_city} activated!`);
  },

  // POST /franchise/admin/reject/:id (admin)
  reject: async (req, res) => {
    await FranchiseService.reject(req.user.id, req.params.id, req.body.reason);
    return suc(res, null, 'Application rejected');
  },

  // GET /franchise/:id/earnings (admin/franchisee)
  getEarnings: async (req, res) => {
    const { period = 'month' } = req.query;
    const earnings = await FranchiseService.getEarnings(req.params.id, period);
    return suc(res, { earnings }, 'Franchise earnings');
  },
};

module.exports.franchiseController = franchiseController;


// ─────────────────────────────────────────────────────────────
// CRM CONTROLLER
// ─────────────────────────────────────────────────────────────

const CRMService = require('../../services/crm.service');

const crmController = {

  // GET /admin/crm/summary (admin)
  getSummary: async (req, res) => {
    const summary = await CRMService.getSegmentSummary();
    return suc(res, { crm: summary }, 'CRM segment summary');
  },

  // GET /admin/crm/segments?segment=at_risk (admin)
  getSegment: async (req, res) => {
    const { segment = 'all', area_id, page = 1, limit = 20 } = req.query;
    const result = await CRMService.getSegment(segment, area_id, { page, limit });
    return pag(res, result, `${segment} customers`);
  },

  // GET /admin/crm/cohort (admin)
  getCohort: async (req, res) => {
    const cohort = await CRMService.getCohortAnalysis();
    return suc(res, { cohort }, 'Cohort retention analysis');
  },

  // GET /admin/crm/re-engagement (admin)
  getReEngagement: async (req, res) => {
    const { limit = 500 } = req.query;
    const targets = await CRMService.getReEngagementTargets(parseInt(limit));
    return suc(res, {
      targets,
      count: targets.length,
      message: `${targets.length} at-risk customers identified for re-engagement`,
    }, 'Re-engagement targets');
  },

  // GET /admin/crm/health (admin)
  getPlatformHealth: async (req, res) => {
    const health = await CRMService.getPlatformHealth();
    return suc(res, { health }, 'Platform health dashboard');
  },
};

module.exports.crmController = crmController;


// ─────────────────────────────────────────────────────────────
// MULTI-CITY CONTROLLER
// ─────────────────────────────────────────────────────────────

const { query } = require('../../config/db');

const cityController = {

  // GET /cities (public)
  listCities: async (req, res) => {
    const { rows } = await query(
      `SELECT
         c.id, c.name, c.state, c.country, c.is_active,
         COUNT(DISTINCT a.id)::int AS area_count,
         COUNT(DISTINCT m.id)::int AS merchant_count,
         COUNT(DISTINCT u.id)::int AS customer_count
       FROM cities c
       LEFT JOIN areas     a ON a.city_id = c.id
       LEFT JOIN merchants m ON m.pincode = ANY(
         SELECT a2.pincode FROM areas a2 WHERE a2.city_id = c.id
       )
       LEFT JOIN users u ON u.id IN (
         SELECT DISTINCT ua.user_id FROM user_addresses ua
         JOIN areas a3 ON a3.id = ua.area_id WHERE a3.city_id = c.id
       )
       WHERE c.is_active = true
       GROUP BY c.id
       ORDER BY merchant_count DESC`
    );

    return suc(res, { cities: rows }, 'Active cities');
  },

  // POST /admin/cities (admin)
  onboardCity: async (req, res) => {
    const { name, state, country = 'India', manager_name, manager_email, manager_phone } = req.body;

    const { rows: existing } = await query(
      'SELECT id FROM cities WHERE LOWER(name) = LOWER($1) LIMIT 1', [name]
    );
    if (existing[0]) {
      return br(res, `${name} is already onboarded`);
    }

    const { rows } = await query(
      `INSERT INTO cities (name, state, country, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id, name, state`,
      [name, state, country]
    );

    // Audit log
    await query(
      `INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, new_values)
       VALUES ($1, 'city_onboarded', 'cities', $2, $3)`,
      [req.user.id, rows[0].id, JSON.stringify({ name, state, manager_name, manager_email })]
    );

    return cre(res, { city: rows[0] }, `🏙️ ${name} successfully onboarded on MyLocalBazaar!`);
  },

  // GET /admin/cities/:id/stats (admin)
  getCityStats: async (req, res) => {
    const { id } = req.params;
    const { rows } = await query(
      `SELECT
         c.id, c.name, c.state,
         COUNT(DISTINCT a.id)::int AS area_count,
         COUNT(DISTINCT m.id)::int AS active_merchants,
         COUNT(DISTINCT o.id)::int AS total_orders,
         COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_status='delivered'), 0) AS gmv,
         COUNT(DISTINCT o.user_id)::int AS unique_buyers,
         COUNT(DISTINCT dp.id)::int AS delivery_partners
       FROM cities c
       LEFT JOIN areas a ON a.city_id = c.id
       LEFT JOIN merchants m ON m.pincode = ANY(
         SELECT a2.pincode FROM areas a2 WHERE a2.city_id = c.id
       ) AND m.merchant_status = 'active'
       LEFT JOIN orders o ON o.area_id = a.id
       LEFT JOIN delivery_partners dp ON dp.area_id = a.id
       WHERE c.id = $1
       GROUP BY c.id`,
      [id]
    );

    if (!rows[0]) return nf(res, 'City not found');
    return suc(res, { stats: { ...rows[0], gmv: parseFloat(rows[0].gmv) } }, 'City statistics');
  },

  // POST /admin/cities/:id/toggle (admin)
  toggleCity: async (req, res) => {
    const { rows } = await query(
      'UPDATE cities SET is_active = NOT is_active WHERE id = $1 RETURNING id, name, is_active',
      [req.params.id]
    );
    if (!rows[0]) return nf(res, 'City not found');
    return suc(res, { city: rows[0] },
      `${rows[0].name} is now ${rows[0].is_active ? 'active' : 'paused'}`
    );
  },
};

module.exports.cityController = cityController;
