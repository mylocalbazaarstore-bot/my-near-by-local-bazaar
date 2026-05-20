// src/services/dashboard.service.js
// ─────────────────────────────────────────────────────────────
// Merchant Dashboard Service — MyLocalBazaar.store
// Computes: revenue KPIs | order stats | product summaries |
//           recent activity | customer insights
// All queries use period-based filtering (today/week/month/year)
// ─────────────────────────────────────────────────────────────

const { query } = require('../config/db');
const { redis } = require('../config/redis');
const logger    = require('../config/logger');

// Map period strings to PostgreSQL interval / date_trunc values
const PERIOD_MAP = {
  today:   { trunc: 'day',    interval: '1 day' },
  week:    { trunc: 'week',   interval: '7 days' },
  month:   { trunc: 'month',  interval: '30 days' },
  quarter: { trunc: 'quarter',interval: '90 days' },
  year:    { trunc: 'year',   interval: '365 days' },
};

const DashboardService = {

  // ── Master overview: all KPI cards in one call ─────────────────
  getOverview: async (merchantId, period = 'month') => {
    const cacheKey = `mlb:dash:${merchantId}:${period}`;
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const { interval } = PERIOD_MAP[period] || PERIOD_MAP.month;

    // Run all overview queries in parallel
    const [
      revenueData,
      orderCounts,
      productStats,
      customerStats,
      walletData,
      pendingApprovalCount,
    ] = await Promise.all([
      // 1. Revenue KPIs
      query(
        `SELECT
           COALESCE(SUM(CASE WHEN o.order_status = 'delivered' THEN o.total_amount ELSE 0 END), 0) AS total_revenue,
           COALESCE(SUM(CASE WHEN o.order_status = 'delivered'
             AND o.created_at >= NOW() - INTERVAL '${interval}' THEN o.total_amount ELSE 0 END), 0) AS period_revenue,
           COALESCE(AVG(CASE WHEN o.order_status = 'delivered' THEN o.total_amount END), 0) AS avg_order_value,
           COUNT(*) FILTER (WHERE o.order_status = 'delivered'
             AND o.created_at >= NOW() - INTERVAL '${interval}') AS period_delivered_orders,
           COALESCE(SUM(CASE WHEN o.order_status IN ('refund_initiated','refund_completed')
             AND o.created_at >= NOW() - INTERVAL '${interval}' THEN o.total_amount ELSE 0 END), 0) AS period_refunds
         FROM orders o
         WHERE o.merchant_id = $1`,
        [merchantId]
      ),

      // 2. Order status breakdown for the period
      query(
        `SELECT
           COUNT(*) FILTER (WHERE order_status = 'payment_processed') AS awaiting_approval,
           COUNT(*) FILTER (WHERE order_status IN ('accepted','packed','out_for_delivery')) AS in_progress,
           COUNT(*) FILTER (WHERE order_status = 'delivered'
             AND created_at >= NOW() - INTERVAL '${interval}') AS delivered,
           COUNT(*) FILTER (WHERE order_status = 'cancelled'
             AND created_at >= NOW() - INTERVAL '${interval}') AS cancelled,
           COUNT(*) FILTER (WHERE order_status = 'return_requested') AS pending_returns,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '${interval}') AS total_orders
         FROM orders WHERE merchant_id = $1`,
        [merchantId]
      ),

      // 3. Product inventory summary
      query(
        `SELECT
           COUNT(*) FILTER (WHERE product_status = 'active') AS active_products,
           COUNT(*) FILTER (WHERE product_status = 'pending_approval') AS pending_approval,
           COUNT(*) FILTER (WHERE product_status = 'out_of_stock') AS out_of_stock,
           COUNT(*) FILTER (WHERE product_status = 'rejected') AS rejected,
           COUNT(*) FILTER (
             WHERE track_inventory = true AND stock_quantity <= low_stock_threshold
             AND product_status NOT IN ('archived','rejected')
           ) AS low_stock_alerts,
           COUNT(*) AS total_products
         FROM products WHERE merchant_id = $1`,
        [merchantId]
      ),

      // 4. Unique customer count for period
      query(
        `SELECT
           COUNT(DISTINCT user_id) AS unique_customers,
           COUNT(DISTINCT user_id) FILTER (
             WHERE user_id NOT IN (
               SELECT DISTINCT user_id FROM orders
               WHERE merchant_id = $1
               AND created_at < NOW() - INTERVAL '${interval}'
             )
           ) AS new_customers
         FROM orders WHERE merchant_id = $1
           AND created_at >= NOW() - INTERVAL '${interval}'`,
        [merchantId]
      ),

      // 5. Merchant wallet balance
      query(
        `SELECT balance, locked_balance, total_credited, total_debited
         FROM wallets WHERE owner_id = $1 AND owner_type = 'merchant'`,
        [merchantId]
      ),

      // 6. Count awaiting admin approval (KYC etc.)
      query(
        `SELECT kyc_status, merchant_status FROM merchants WHERE id = $1`,
        [merchantId]
      ),
    ]);

    const revenue  = revenueData.rows[0];
    const orders   = orderCounts.rows[0];
    const products = productStats.rows[0];
    const customers = customerStats.rows[0];
    const wallet   = walletData.rows[0];
    const merchant = pendingApprovalCount.rows[0];

    const overview = {
      period,
      revenue: {
        total:             parseFloat(revenue.total_revenue),
        this_period:       parseFloat(revenue.period_revenue),
        avg_order_value:   parseFloat(revenue.avg_order_value).toFixed(2),
        period_refunds:    parseFloat(revenue.period_refunds),
      },
      orders: {
        awaiting_approval: parseInt(orders.awaiting_approval),
        in_progress:       parseInt(orders.in_progress),
        delivered:         parseInt(orders.delivered),
        cancelled:         parseInt(orders.cancelled),
        pending_returns:   parseInt(orders.pending_returns),
        total_this_period: parseInt(orders.total_orders),
      },
      products: {
        active:            parseInt(products.active_products),
        pending_approval:  parseInt(products.pending_approval),
        out_of_stock:      parseInt(products.out_of_stock),
        rejected:          parseInt(products.rejected),
        low_stock_alerts:  parseInt(products.low_stock_alerts),
        total:             parseInt(products.total_products),
      },
      customers: {
        unique_this_period: parseInt(customers.unique_customers),
        new_this_period:    parseInt(customers.new_customers),
      },
      wallet: wallet
        ? {
            balance:        parseFloat(wallet.balance),
            locked_balance: parseFloat(wallet.locked_balance),
            total_credited: parseFloat(wallet.total_credited),
            total_debited:  parseFloat(wallet.total_debited),
          }
        : { balance: 0, locked_balance: 0 },
      account_status: {
        kyc_status:      merchant?.kyc_status,
        merchant_status: merchant?.merchant_status,
      },
    };

    // Cache for 2 minutes (real-time-ish data)
    await redis.set(cacheKey, overview, 120);
    return overview;
  },

  // ── Revenue trend (daily/weekly breakdown for chart) ──────────
  getRevenueTrend: async (merchantId, period = 'month') => {
    const cacheKey = `mlb:dash_trend:${merchantId}:${period}`;
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const { trunc, interval } = PERIOD_MAP[period] || PERIOD_MAP.month;
    // For 'today', group by hour. Otherwise group by day.
    const groupTrunc = period === 'today' ? 'hour' : 'day';

    const { rows } = await query(
      `SELECT
         DATE_TRUNC('${groupTrunc}', o.created_at) AS period_start,
         COUNT(*)::int AS order_count,
         COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_status = 'delivered'), 0) AS revenue,
         COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_status IN ('cancelled','refund_completed')), 0) AS losses
       FROM orders o
       WHERE o.merchant_id = $1
         AND o.created_at >= NOW() - INTERVAL '${interval}'
       GROUP BY period_start
       ORDER BY period_start ASC`,
      [merchantId]
    );

    const trend = rows.map((r) => ({
      period:       r.period_start,
      order_count:  r.order_count,
      revenue:      parseFloat(r.revenue),
      losses:       parseFloat(r.losses),
    }));

    await redis.set(cacheKey, trend, 180); // 3 min cache
    return trend;
  },

  // ── Top selling products for period ───────────────────────────
  getTopProducts: async (merchantId, period = 'month', limitN = 10) => {
    const { interval } = PERIOD_MAP[period] || PERIOD_MAP.month;

    const { rows } = await query(
      `SELECT
         oi.product_id,
         oi.product_name,
         SUM(oi.quantity)::int AS total_units_sold,
         SUM(oi.line_total) AS total_revenue,
         COUNT(DISTINCT o.id)::int AS order_count,
         (SELECT image_url FROM product_images pi
          WHERE pi.product_id = oi.product_id AND pi.is_primary = true LIMIT 1) AS image
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.merchant_id = $1
         AND o.order_status = 'delivered'
         AND o.created_at >= NOW() - INTERVAL '${interval}'
       GROUP BY oi.product_id, oi.product_name
       ORDER BY total_units_sold DESC
       LIMIT $2`,
      [merchantId, limitN]
    );

    return rows.map((r) => ({ ...r, total_revenue: parseFloat(r.total_revenue) }));
  },

  // ── Recent orders (for orders widget) ─────────────────────────
  getRecentOrders: async (merchantId, filters = {}, pagination = {}) => {
    const { status } = filters;
    const { page = 1, limit = 10 } = pagination;

    const params  = [merchantId];
    const clauses = ['o.merchant_id = $1'];

    if (status) {
      params.push(status);
      clauses.push(`o.order_status = $${params.length}`);
    }

    const { queryPaginated: qp } = require('../config/db');
    return qp(
      `SELECT
         o.id, o.order_number, o.order_status, o.payment_status,
         o.total_amount, o.delivery_charge, o.payment_method,
         o.created_at, o.merchant_action_at,
         u.full_name AS customer_name, u.phone AS customer_phone,
         (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id)::int AS item_count,
         o.delivery_address->>'address_line1' AS delivery_address_preview
       FROM orders o
       JOIN users u ON u.id = o.user_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY
         CASE WHEN o.order_status = 'payment_processed' THEN 0 ELSE 1 END,
         o.created_at DESC`,
      params,
      { page, limit }
    );
  },

  // ── Pending approvals (orders needing merchant action) ────────
  getPendingApprovals: async (merchantId) => {
    const { rows } = await query(
      `SELECT
         o.id, o.order_number, o.total_amount, o.payment_method,
         o.created_at, o.payment_processed_at,
         u.full_name AS customer_name, u.phone AS customer_phone,
         EXTRACT(EPOCH FROM (NOW() - o.payment_processed_at)) / 60 AS minutes_waiting,
         json_agg(json_build_object(
           'name',     oi.product_name,
           'qty',      oi.quantity,
           'price',    oi.line_total
         )) AS items
       FROM orders o
       JOIN users u ON u.id = o.user_id
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.merchant_id = $1
         AND o.order_status = 'payment_processed'
       GROUP BY o.id, u.full_name, u.phone
       ORDER BY o.payment_processed_at ASC`,
      [merchantId]
    );

    return rows.map((r) => ({
      ...r,
      minutes_waiting: parseFloat(r.minutes_waiting).toFixed(0),
      total_amount:    parseFloat(r.total_amount),
    }));
  },

  // ── Booking summary (for service merchants) ───────────────────
  getBookingSummary: async (merchantId, period = 'month') => {
    const { interval } = PERIOD_MAP[period] || PERIOD_MAP.month;

    const { rows } = await query(
      `SELECT
         COUNT(*) FILTER (WHERE booking_status = 'pending') AS pending_bookings,
         COUNT(*) FILTER (WHERE booking_status = 'confirmed') AS confirmed_bookings,
         COUNT(*) FILTER (WHERE booking_status = 'completed'
           AND created_at >= NOW() - INTERVAL '${interval}') AS completed_bookings,
         COUNT(*) FILTER (WHERE booking_status = 'cancelled'
           AND created_at >= NOW() - INTERVAL '${interval}') AS cancelled_bookings,
         COALESCE(SUM(final_price) FILTER (WHERE booking_status = 'completed'
           AND created_at >= NOW() - INTERVAL '${interval}'), 0) AS booking_revenue
       FROM bookings WHERE merchant_id = $1`,
      [merchantId]
    );

    return rows[0]
      ? { ...rows[0], booking_revenue: parseFloat(rows[0].booking_revenue) }
      : null;
  },
};

module.exports = DashboardService;
