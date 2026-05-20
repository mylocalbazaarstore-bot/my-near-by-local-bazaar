// src/services/crm.service.js
// ─────────────────────────────────────────────────────────────
// Advanced CRM & Analytics Service — MyLocalBazaar.store
//
// RFM Model:
//   R = Recency   → How recently did customer buy?
//   F = Frequency → How often do they buy?
//   M = Monetary  → How much do they spend?
//
// Customer Segments:
//   Champions     → High R, High F, High M  (best customers)
//   Loyal         → Medium R, High F, High M
//   At Risk       → Low R, High F, High M   (about to churn)
//   New           → High R, Low F, Any M    (just joined)
//   Inactive      → Low R, Low F, Low M     (need re-engagement)
// ─────────────────────────────────────────────────────────────

const { query, queryPaginated } = require('../config/db');
const { redis }  = require('../config/redis');
const logger     = require('../config/logger');

// ─────────────────────────────────────────────────────────────
// RFM SEGMENTATION
// ─────────────────────────────────────────────────────────────
const CRMService = {

  // Compute RFM scores for all customers
  computeRFM: async () => {
    const cacheKey = 'mlb:crm:rfm_segments';
    const cached   = await redis.get(cacheKey);
    if (cached) return cached;

    const { rows } = await query(
      `WITH customer_stats AS (
         SELECT
           u.id AS user_id,
           u.full_name,
           u.phone,
           u.email,
           u.created_at AS registered_at,
           COUNT(o.id)::int                    AS order_count,
           COALESCE(SUM(o.total_amount), 0)    AS total_spent,
           MAX(o.created_at)                   AS last_order_at,
           EXTRACT(EPOCH FROM (NOW() - MAX(o.created_at))) / 86400 AS days_since_last_order
         FROM users u
         LEFT JOIN orders o ON o.user_id = u.id AND o.order_status = 'delivered'
         WHERE u.is_active = true AND u.is_blocked = false
         GROUP BY u.id
       ),
       rfm_scored AS (
         SELECT *,
           -- R Score: Lower days = better (1-5)
           CASE
             WHEN days_since_last_order <= 7   THEN 5
             WHEN days_since_last_order <= 30  THEN 4
             WHEN days_since_last_order <= 60  THEN 3
             WHEN days_since_last_order <= 120 THEN 2
             ELSE 1
           END AS r_score,
           -- F Score: More orders = better (1-5)
           CASE
             WHEN order_count >= 20 THEN 5
             WHEN order_count >= 10 THEN 4
             WHEN order_count >= 5  THEN 3
             WHEN order_count >= 2  THEN 2
             ELSE 1
           END AS f_score,
           -- M Score: More spent = better (1-5)
           CASE
             WHEN total_spent >= 10000 THEN 5
             WHEN total_spent >= 5000  THEN 4
             WHEN total_spent >= 2000  THEN 3
             WHEN total_spent >= 500   THEN 2
             ELSE 1
           END AS m_score
         FROM customer_stats
       )
       SELECT *,
         (r_score + f_score + m_score) AS rfm_total,
         CASE
           WHEN r_score >= 4 AND f_score >= 4 AND m_score >= 4 THEN 'champions'
           WHEN f_score >= 4 AND m_score >= 4                   THEN 'loyal'
           WHEN r_score <= 2 AND f_score >= 3 AND m_score >= 3  THEN 'at_risk'
           WHEN r_score >= 4 AND order_count <= 2               THEN 'new'
           ELSE 'inactive'
         END AS segment
       FROM rfm_scored
       ORDER BY rfm_total DESC`
    );

    // Cache for 1 hour
    await redis.set(cacheKey, rows, 3600);
    return rows;
  },

  // Get customers by segment (paginated)
  getSegment: async (segment, areaId, pagination = {}) => {
    const { page = 1, limit = 20 } = pagination;

    const rfmData = await CRMService.computeRFM();

    let filtered = rfmData;
    if (segment && segment !== 'all') {
      filtered = rfmData.filter((r) => r.segment === segment);
    }

    // Paginate in memory (since RFM is cached)
    const total      = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const start      = (page - 1) * limit;
    const rows       = filtered.slice(start, start + limit);

    return {
      rows,
      total,
      page:       parseInt(page),
      limit:      parseInt(limit),
      totalPages,
      hasNext:    page < totalPages,
      hasPrev:    page > 1,
    };
  },

  // Segment summary (counts per segment)
  getSegmentSummary: async () => {
    const rfmData = await CRMService.computeRFM();

    const summary = {
      champions: 0, loyal: 0, at_risk: 0, new: 0, inactive: 0,
      total: rfmData.length,
    };
    rfmData.forEach((r) => { summary[r.segment]++; });

    // Add revenue per segment
    const revenueBySegment = {};
    rfmData.forEach((r) => {
      revenueBySegment[r.segment] = (revenueBySegment[r.segment] || 0) + parseFloat(r.total_spent);
    });

    return {
      counts:  summary,
      revenue: revenueBySegment,
      insights: {
        at_risk_revenue:  parseFloat(revenueBySegment.at_risk || 0).toFixed(2),
        champion_revenue: parseFloat(revenueBySegment.champions || 0).toFixed(2),
        churn_risk_pct:   ((summary.at_risk + summary.inactive) / summary.total * 100).toFixed(1),
      },
    };
  },

  // Cohort analysis: retention by registration month
  getCohortAnalysis: async () => {
    const cacheKey = 'mlb:crm:cohort';
    const cached   = await redis.get(cacheKey);
    if (cached) return cached;

    const { rows } = await query(
      `WITH cohorts AS (
         SELECT
           u.id,
           DATE_TRUNC('month', u.created_at) AS cohort_month,
           DATE_TRUNC('month', o.created_at) AS order_month
         FROM users u
         LEFT JOIN orders o ON o.user_id = u.id AND o.order_status = 'delivered'
         WHERE u.created_at >= NOW() - INTERVAL '6 months'
       )
       SELECT
         cohort_month,
         COUNT(DISTINCT id)::int                              AS cohort_size,
         COUNT(DISTINCT id) FILTER (WHERE order_month = cohort_month)::int AS m0,
         COUNT(DISTINCT id) FILTER (WHERE order_month = cohort_month + INTERVAL '1 month')::int AS m1,
         COUNT(DISTINCT id) FILTER (WHERE order_month = cohort_month + INTERVAL '2 months')::int AS m2,
         COUNT(DISTINCT id) FILTER (WHERE order_month = cohort_month + INTERVAL '3 months')::int AS m3
       FROM cohorts
       GROUP BY cohort_month
       ORDER BY cohort_month DESC`
    );

    await redis.set(cacheKey, rows, 3600);
    return rows;
  },

  // Re-engagement targets: at-risk customers who haven't ordered in 30+ days
  getReEngagementTargets: async (limit = 500) => {
    const rfmData = await CRMService.computeRFM();
    return rfmData
      .filter((r) => r.segment === 'at_risk' && parseFloat(r.days_since_last_order) > 30)
      .slice(0, limit)
      .map((r) => ({
        user_id:         r.user_id,
        full_name:       r.full_name,
        phone:           r.phone,
        email:           r.email,
        days_inactive:   Math.floor(parseFloat(r.days_since_last_order)),
        total_spent:     parseFloat(r.total_spent),
        order_count:     r.order_count,
        reengagement_msg: `Hi ${r.full_name?.split(' ')[0] || 'there'}! We miss you. Get 10% off your next order with code COMEBACK10`,
      }));
  },

  // Platform health dashboard (admin)
  getPlatformHealth: async () => {
    const [gmvData, userGrowth, merchantGrowth, orderData] = await Promise.all([
      query(`
        SELECT
          COALESCE(SUM(total_amount) FILTER (WHERE order_status='delivered'), 0) AS total_gmv,
          COALESCE(SUM(total_amount) FILTER (WHERE order_status='delivered' AND created_at >= NOW() - INTERVAL '30 days'), 0) AS month_gmv,
          COALESCE(SUM(total_amount) FILTER (WHERE order_status='delivered' AND created_at >= NOW() - INTERVAL '7 days'), 0)  AS week_gmv,
          COUNT(*) FILTER (WHERE order_status='delivered')::int AS total_orders,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS month_orders,
          ROUND(AVG(total_amount) FILTER (WHERE order_status='delivered')::numeric, 2) AS avg_order_value
        FROM orders
      `),
      query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS new_month,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int  AS new_week
        FROM users WHERE is_active = true
      `),
      query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE merchant_status = 'active')::int AS active,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS new_month
        FROM merchants
      `),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE order_status = 'payment_processed')::int AS pending_approvals,
          COUNT(*) FILTER (WHERE order_status = 'out_for_delivery')::int  AS in_delivery,
          COUNT(*) FILTER (WHERE order_status = 'return_requested')::int  AS pending_returns,
          COUNT(*) FILTER (WHERE order_status IN ('merchant_rejected','cancelled') AND created_at >= NOW() - INTERVAL '7 days')::int AS recent_cancellations
        FROM orders
      `),
    ]);

    return {
      generated_at: new Date().toISOString(),
      gmv:          gmvData.rows[0],
      users:        userGrowth.rows[0],
      merchants:    merchantGrowth.rows[0],
      orders:       orderData.rows[0],
    };
  },
};

module.exports = CRMService;
