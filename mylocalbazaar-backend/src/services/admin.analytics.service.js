// src/services/admin.analytics.service.js
// ─────────────────────────────────────────────────────────────
// Admin Analytics Service — MyLocalBazaar.store
// Platform-wide revenue, traffic, fraud, geographic expansion,
// merchant performance and customer behaviour reports
// ─────────────────────────────────────────────────────────────

const { query, queryPaginated } = require('../config/db');
const { redis }                 = require('../config/redis');
const logger                    = require('../config/logger');

const PERIOD_SQL = {
  today:   "NOW() - INTERVAL '1 day'",
  week:    "NOW() - INTERVAL '7 days'",
  month:   "NOW() - INTERVAL '30 days'",
  quarter: "NOW() - INTERVAL '90 days'",
  year:    "NOW() - INTERVAL '365 days'",
};

const GROUP_TRUNC = { day: 'day', week: 'week', month: 'month' };

const AdminAnalyticsService = {

  // ── 1. Platform KPI Overview ──────────────────────────────
  getPlatformOverview: async (period = 'month') => {
    const cacheKey = `mlb:admin_overview:${period}`;
    const cached   = await redis.get(cacheKey);
    if (cached) return cached;

    const since = PERIOD_SQL[period] || PERIOD_SQL.month;

    const [gmv, users, merchants, orders, products, deliveries] = await Promise.all([

      // GMV (Gross Merchandise Value)
      query(`
        SELECT
          COALESCE(SUM(total_amount) FILTER (WHERE order_status='delivered'), 0)      AS total_gmv,
          COALESCE(SUM(total_amount) FILTER (WHERE order_status='delivered'
            AND created_at >= ${since}), 0)                                            AS period_gmv,
          COALESCE(SUM(total_amount) FILTER (WHERE order_status IN
            ('refund_initiated','refund_completed') AND created_at >= ${since}), 0)    AS period_refunds,
          COUNT(*) FILTER (WHERE created_at >= ${since})                               AS total_orders,
          COUNT(*) FILTER (WHERE order_status='delivered' AND created_at >= ${since})  AS delivered_orders,
          COUNT(*) FILTER (WHERE order_status='cancelled'  AND created_at >= ${since}) AS cancelled_orders,
          COALESCE(AVG(total_amount) FILTER (WHERE order_status='delivered'
            AND created_at >= ${since}), 0)                                            AS avg_order_value,
          COUNT(*) FILTER (WHERE order_status='payment_processed')                     AS pending_merchant_approval
        FROM orders`
      ),

      // User stats
      query(`
        SELECT
          COUNT(*)                                                    AS total_customers,
          COUNT(*) FILTER (WHERE created_at >= ${since})             AS new_customers,
          COUNT(*) FILTER (WHERE last_login_at >= ${since})          AS active_customers,
          COUNT(*) FILTER (WHERE is_blocked = true)                  AS blocked_customers
        FROM users`
      ),

      // Merchant stats
      query(`
        SELECT
          COUNT(*)                                                               AS total_merchants,
          COUNT(*) FILTER (WHERE merchant_status = 'active')                    AS active_merchants,
          COUNT(*) FILTER (WHERE merchant_status = 'pending')                   AS pending_merchants,
          COUNT(*) FILTER (WHERE kyc_status = 'submitted')                      AS kyc_pending,
          COUNT(*) FILTER (WHERE created_at >= ${since})                        AS new_merchants,
          COUNT(*) FILTER (WHERE subscription_plan != 'free')                   AS paid_subscribers
        FROM merchants`
      ),

      // Platform revenue (commission)
      query(`
        SELECT
          COALESCE(
            SUM(total_amount * ${parseFloat(process.env.PLATFORM_COMMISSION_PERCENT || 8) / 100})
            FILTER (WHERE order_status = 'delivered' AND created_at >= ${since}), 0
          ) AS platform_revenue,
          COALESCE(
            SUM(delivery_charge)
            FILTER (WHERE order_status = 'delivered' AND created_at >= ${since}), 0
          ) AS delivery_revenue
        FROM orders`
      ),

      // Product counts
      query(`
        SELECT
          COUNT(*) FILTER (WHERE product_status = 'active')           AS active_products,
          COUNT(*) FILTER (WHERE product_status = 'pending_approval') AS pending_approval,
          COUNT(*) FILTER (WHERE product_status = 'out_of_stock')     AS out_of_stock
        FROM products`
      ),

      // Delivery stats
      query(`
        SELECT
          COUNT(*) FILTER (WHERE is_online = true)   AS online_partners,
          COUNT(*) FILTER (WHERE is_verified = true) AS verified_partners,
          COUNT(*)                                    AS total_partners
        FROM delivery_partners`
      ),
    ]);

    const overview = {
      period,
      gmv: {
        total_gmv:                parseFloat(gmv.rows[0].total_gmv),
        period_gmv:               parseFloat(gmv.rows[0].period_gmv),
        period_refunds:           parseFloat(gmv.rows[0].period_refunds),
        avg_order_value:          parseFloat(parseFloat(gmv.rows[0].avg_order_value).toFixed(2)),
        total_orders:             parseInt(gmv.rows[0].total_orders),
        delivered_orders:         parseInt(gmv.rows[0].delivered_orders),
        cancelled_orders:         parseInt(gmv.rows[0].cancelled_orders),
        pending_merchant_approval: parseInt(gmv.rows[0].pending_merchant_approval),
      },
      platform_revenue: {
        commission:       parseFloat(parseFloat(orders.rows[0].platform_revenue || 0).toFixed(2)),
        delivery:         parseFloat(parseFloat(orders.rows[0].delivery_revenue  || 0).toFixed(2)),
        total:            parseFloat(
          (parseFloat(orders.rows[0].platform_revenue  || 0) +
           parseFloat(orders.rows[0].delivery_revenue  || 0)).toFixed(2)
        ),
      },
      customers: {
        total:    parseInt(users.rows[0].total_customers),
        new:      parseInt(users.rows[0].new_customers),
        active:   parseInt(users.rows[0].active_customers),
        blocked:  parseInt(users.rows[0].blocked_customers),
      },
      merchants: {
        total:           parseInt(merchants.rows[0].total_merchants),
        active:          parseInt(merchants.rows[0].active_merchants),
        pending:         parseInt(merchants.rows[0].pending_merchants),
        kyc_pending:     parseInt(merchants.rows[0].kyc_pending),
        new:             parseInt(merchants.rows[0].new_merchants),
        paid_subscribers: parseInt(merchants.rows[0].paid_subscribers),
      },
      products: {
        active:           parseInt(products.rows[0].active_products),
        pending_approval: parseInt(products.rows[0].pending_approval),
        out_of_stock:     parseInt(products.rows[0].out_of_stock),
      },
      delivery: {
        total:    parseInt(deliveries.rows[0].total_partners),
        online:   parseInt(deliveries.rows[0].online_partners),
        verified: parseInt(deliveries.rows[0].verified_partners),
      },
    };

    await redis.set(cacheKey, overview, 180); // 3 min cache
    return overview;
  },

  // ── 2. Revenue Trend (chart data) ────────────────────────
  getRevenueTrend: async (period = 'month', groupBy = 'day') => {
    const cacheKey = `mlb:admin_trend:${period}:${groupBy}`;
    const cached   = await redis.get(cacheKey);
    if (cached) return cached;

    const since     = PERIOD_SQL[period] || PERIOD_SQL.month;
    const trunc     = GROUP_TRUNC[groupBy] || 'day';
    const commPct   = parseFloat(process.env.PLATFORM_COMMISSION_PERCENT || 8) / 100;

    const { rows } = await query(`
      SELECT
        DATE_TRUNC('${trunc}', created_at)                         AS period_start,
        COUNT(*)::int                                               AS order_count,
        COALESCE(SUM(total_amount) FILTER (WHERE order_status = 'delivered'), 0)          AS gmv,
        COALESCE(SUM(total_amount * ${commPct}) FILTER (WHERE order_status = 'delivered'), 0) AS platform_revenue,
        COALESCE(SUM(delivery_charge) FILTER (WHERE order_status = 'delivered'), 0)       AS delivery_revenue,
        COALESCE(SUM(total_amount) FILTER (WHERE order_status IN
          ('refund_initiated','refund_completed')), 0)              AS refunds,
        COUNT(*) FILTER (WHERE order_status = 'cancelled')::int     AS cancellations
      FROM orders
      WHERE created_at >= ${since}
      GROUP BY period_start
      ORDER BY period_start ASC`
    );

    const trend = rows.map(r => ({
      period:           r.period_start,
      order_count:      r.order_count,
      gmv:              parseFloat(r.gmv),
      platform_revenue: parseFloat(r.platform_revenue),
      delivery_revenue: parseFloat(r.delivery_revenue),
      refunds:          parseFloat(r.refunds),
      cancellations:    r.cancellations,
    }));

    await redis.set(cacheKey, trend, 300);
    return trend;
  },

  // ── 3. Merchant Performance Leaderboard ──────────────────
  getMerchantPerformance: async (period = 'month', limitN = 20) => {
    const since = PERIOD_SQL[period] || PERIOD_SQL.month;

    const { rows } = await query(`
      SELECT
        m.id, m.store_name, m.store_slug, m.store_category, m.pincode,
        m.rating, m.total_reviews, m.merchant_status, m.subscription_plan,
        COUNT(o.id)::int                                                      AS order_count,
        COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_status='delivered'), 0) AS revenue,
        COALESCE(AVG(o.total_amount) FILTER (WHERE o.order_status='delivered'), 0) AS avg_order,
        COUNT(o.id) FILTER (WHERE o.order_status='delivered')::int            AS delivered_count,
        COUNT(o.id) FILTER (WHERE o.order_status='merchant_rejected')::int    AS rejected_count,
        ROUND(
          (COUNT(o.id) FILTER (WHERE o.order_status='delivered')::numeric /
           NULLIF(COUNT(o.id)::numeric, 0)) * 100, 1
        )                                                                     AS fulfillment_rate,
        COUNT(p.id)::int                                                      AS active_products
      FROM merchants m
      LEFT JOIN orders o  ON o.merchant_id = m.id AND o.created_at >= ${since}
      LEFT JOIN products p ON p.merchant_id = m.id AND p.product_status = 'active'
      WHERE m.merchant_status = 'active'
      GROUP BY m.id
      ORDER BY revenue DESC
      LIMIT $1`,
      [limitN]
    );

    return rows.map(r => ({
      ...r,
      revenue:   parseFloat(r.revenue),
      avg_order: parseFloat(parseFloat(r.avg_order).toFixed(2)),
    }));
  },

  // ── 4. Geographic expansion report ───────────────────────
  getGeographicReport: async () => {
    const cacheKey = 'mlb:admin_geo';
    const cached   = await redis.get(cacheKey);
    if (cached) return cached;

    const { rows } = await query(`
      SELECT
        a.id AS area_id, a.name AS area_name, a.pincode,
        c.name AS city_name,
        COUNT(DISTINCT m.id)::int                           AS merchant_count,
        COUNT(DISTINCT CASE WHEN m.merchant_status='active' THEN m.id END)::int AS active_merchants,
        COUNT(DISTINCT o.user_id)::int                      AS unique_customers,
        COUNT(o.id)::int                                    AS total_orders,
        COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_status='delivered'), 0) AS area_gmv
      FROM areas a
      JOIN cities c ON c.id = a.city_id
      LEFT JOIN merchants m ON m.area_id = a.id
      LEFT JOIN orders o    ON o.area_id  = a.id
      WHERE a.is_active = true
      GROUP BY a.id, a.name, a.pincode, c.name
      ORDER BY area_gmv DESC`
    );

    const report = rows.map(r => ({
      ...r,
      area_gmv: parseFloat(r.area_gmv),
      coverage_score: parseInt(r.active_merchants) > 10 ? 'high'
        : parseInt(r.active_merchants) > 3 ? 'medium' : 'low',
    }));

    await redis.set(cacheKey, report, 600); // 10 min
    return report;
  },

  // ── 5. Fraud signals report ───────────────────────────────
  getFraudSignals: async () => {
    const [highValueRefunds, rapidOrders, newUserHighValue] = await Promise.all([

      // Unusual high-value refunds in last 7 days
      query(`
        SELECT u.id, u.full_name, u.phone,
               COUNT(o.id)::int AS refund_count,
               SUM(o.total_amount) AS refund_total
        FROM orders o
        JOIN users u ON u.id = o.user_id
        WHERE o.order_status IN ('refund_initiated','refund_completed')
          AND o.created_at >= NOW() - INTERVAL '7 days'
        GROUP BY u.id, u.full_name, u.phone
        HAVING COUNT(o.id) >= 3
        ORDER BY refund_count DESC LIMIT 20`
      ),

      // Multiple orders from same user in < 5 minutes (possible bot)
      query(`
        SELECT user_id,
               COUNT(*)::int AS order_count,
               MIN(created_at) AS first_order,
               MAX(created_at) AS last_order
        FROM orders
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY user_id, DATE_TRUNC('hour', created_at)
        HAVING COUNT(*) >= 5
        ORDER BY order_count DESC LIMIT 20`
      ),

      // New users with orders > ₹5000 (first hour)
      query(`
        SELECT u.id, u.full_name, u.phone, u.created_at AS registered_at,
               o.order_number, o.total_amount, o.payment_method
        FROM orders o
        JOIN users u ON u.id = o.user_id
        WHERE o.total_amount > 5000
          AND o.created_at <= u.created_at + INTERVAL '1 hour'
          AND o.created_at >= NOW() - INTERVAL '7 days'
        ORDER BY o.total_amount DESC LIMIT 20`
      ),
    ]);

    return {
      high_value_refunds:      highValueRefunds.rows,
      rapid_order_users:       rapidOrders.rows,
      new_user_high_value:     newUserHighValue.rows,
      generated_at:            new Date().toISOString(),
    };
  },

  // ── 6. Top categories by revenue ─────────────────────────
  getCategoryReport: async (period = 'month') => {
    const since = PERIOD_SQL[period] || PERIOD_SQL.month;

    const { rows } = await query(`
      SELECT
        c.id, c.name, c.slug, c.store_category, c.theme_color,
        COUNT(DISTINCT p.id)::int                                              AS product_count,
        COUNT(DISTINCT m.id)::int                                              AS merchant_count,
        COUNT(oi.id)::int                                                      AS items_sold,
        COALESCE(SUM(oi.line_total) FILTER (WHERE o.order_status = 'delivered'), 0) AS revenue
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id AND p.product_status = 'active'
      LEFT JOIN merchants m ON m.store_category = c.store_category AND m.merchant_status = 'active'
      LEFT JOIN order_items oi ON oi.product_id = p.id
      LEFT JOIN orders o       ON o.id = oi.order_id AND o.created_at >= ${since}
      WHERE c.is_active = true
      GROUP BY c.id, c.name, c.slug, c.store_category, c.theme_color
      ORDER BY revenue DESC`
    );

    return rows.map(r => ({ ...r, revenue: parseFloat(r.revenue) }));
  },
};

module.exports = AdminAnalyticsService;
