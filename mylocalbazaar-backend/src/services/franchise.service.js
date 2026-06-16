// src/services/franchise.service.js
// ─────────────────────────────────────────────────────────────
// Franchise System Service — MyLocalBazaar.store
//
// MyLocalBazaar Franchise Model:
//   • Franchisee applies for a city territory
//   • Admin reviews + assigns territory
//   • Franchisee onboards local merchants in their city
//   • Revenue sharing: Franchisee earns X% of city GMV
//   • White-label config per city (logo, colors, domain)
//
// DB tables used:
//   franchise_applications (new — created below via migration)
//   cities (existing)
//   merchants (existing — city_id added)
// ─────────────────────────────────────────────────────────────

const { query, withTransaction, queryPaginated } = require('../config/db');
const { redis }  = require('../config/redis');
const logger     = require('../config/logger');

// ── Franchise application statuses ───────────────────────────
const APP_STATUS = {
  PENDING:   'pending',
  REVIEWING: 'reviewing',
  APPROVED:  'approved',
  REJECTED:  'rejected',
  ACTIVE:    'active',
};

const FranchiseService = {

  // ── Submit franchise application ──────────────────────────
  apply: async (data) => {
    // Check if city is already taken
    const { rows: existing } = await query(
      `SELECT id FROM franchise_applications
       WHERE LOWER(territory_city) = LOWER($1)
         AND status IN ('approved', 'active')`,
      [data.city]
    );

    if (existing[0]) {
      throw Object.assign(
        new Error(`${data.city} territory is already assigned. Contact us for other cities.`),
        { statusCode: 409 }
      );
    }

    const { rows } = await query(
      `INSERT INTO franchise_applications
         (applicant_name, email, phone, territory_city, territory_state,
          investment_capacity, business_experience, message, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
       RETURNING id, applicant_name, territory_city, status, created_at`,
      [
        data.applicant_name, data.email, data.phone,
        data.city, data.state,
        data.investment_capacity,
        data.business_experience || null,
        data.message || null,
      ]
    );

    logger.info('Franchise application submitted', {
      applicationId: rows[0].id,
      city:          data.city,
    });

    return rows[0];
  },

  // ── Admin: List all applications ──────────────────────────
  listApplications: async (status, pagination = {}) => {
    const { page = 1, limit = 20 } = pagination;
    const params  = [];
    const clauses = [];

    if (status) {
      params.push(status);
      clauses.push(`status = $${params.length}`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    return queryPaginated(
      `SELECT id, applicant_name, email, phone,
              territory_city, territory_state,
              investment_capacity, status, created_at,
              revenue_share_pct, contract_months, approved_at
       FROM franchise_applications
       ${where}
       ORDER BY
         CASE status WHEN 'pending' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END,
         created_at DESC`,
      params,
      { page, limit }
    );
  },

  // ── Admin: Approve + Onboard franchisee ───────────────────
  onboard: async (adminId, applicationId, onboardData) => {
    return withTransaction(async (client) => {
      // Get application
      const { rows: appRows } = await client.query(
        'SELECT * FROM franchise_applications WHERE id = $1',
        [applicationId]
      );
      const app = appRows[0];
      if (!app) {
        throw Object.assign(new Error('Application not found'), { statusCode: 404 });
      }
      if (app.status !== 'pending' && app.status !== 'reviewing') {
        throw Object.assign(
          new Error(`Application is already ${app.status}`),
          { statusCode: 400 }
        );
      }

      // Create city record if doesn't exist
      const { rows: cityRows } = await client.query(
        `INSERT INTO cities (name, state, country)
         VALUES ($1, $2, 'India')
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [onboardData.territory_city || app.territory_city, onboardData.territory_state || app.territory_state]
      );
      const cityId = cityRows[0].id;

      // Update application to approved + active
      await client.query(
        `UPDATE franchise_applications
         SET status            = 'active',
             territory_city    = $1,
             territory_state   = $2,
             revenue_share_pct = $3,
             contract_months   = $4,
             city_id           = $5,
             approved_by       = $6,
             approved_at       = NOW()
         WHERE id = $7`,
        [
          onboardData.territory_city || app.territory_city,
          onboardData.territory_state || app.territory_state,
          onboardData.revenue_share_pct,
          onboardData.contract_months || 12,
          cityId,
          adminId,
          applicationId,
        ]
      );

      // Audit log
      await client.query(
        `INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, new_values)
         VALUES ($1, 'franchise_onboarded', 'franchise_applications', $2, $3)`,
        [adminId, applicationId, JSON.stringify(onboardData)]
      );

      logger.info('Franchise onboarded', { adminId, applicationId, city: app.territory_city });

      return {
        application_id:   applicationId,
        franchisee_name:  app.applicant_name,
        territory_city:   onboardData.territory_city || app.territory_city,
        city_id:          cityId,
        revenue_share_pct: onboardData.revenue_share_pct,
        contract_months:  onboardData.contract_months || 12,
        status:           'active',
      };
    });
  },

  // ── Admin: Reject application ─────────────────────────────
  reject: async (adminId, applicationId, reason) => {
    const { rowCount } = await query(
      `UPDATE franchise_applications
       SET status = 'rejected', rejection_reason = $1, approved_by = $2, approved_at = NOW()
       WHERE id = $3`,
      [reason, adminId, applicationId]
    );

    if (!rowCount) throw Object.assign(new Error('Application not found'), { statusCode: 404 });
    logger.info('Franchise application rejected', { adminId, applicationId });
    return { rejected: true };
  },

  // ── Get franchise territories overview ────────────────────
  getTerritories: async () => {
    const { rows } = await query(
      `SELECT
         fa.id AS franchise_id,
         fa.applicant_name AS franchisee_name,
         fa.territory_city AS city,
         fa.territory_state AS state,
         fa.revenue_share_pct,
         fa.contract_months,
         fa.approved_at,
         fa.status,
         c.id AS city_id,
         COUNT(DISTINCT m.id)::int AS merchant_count,
         COUNT(DISTINCT o.id)::int AS total_orders,
         COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_status = 'delivered'), 0) AS gmv
       FROM franchise_applications fa
       LEFT JOIN cities   c ON c.id = fa.city_id
       LEFT JOIN areas     a ON a.city_id = c.id
       LEFT JOIN merchants m ON m.area_id = a.id
       LEFT JOIN orders   o ON o.merchant_id = m.id
       WHERE fa.status = 'active'
       GROUP BY fa.id, c.id, fa.territory_city, fa.territory_state, fa.revenue_share_pct,
                fa.contract_months, fa.approved_at, fa.status, fa.applicant_name
       ORDER BY gmv DESC`
    );

    return rows.map((r) => ({
      ...r,
      gmv:                parseFloat(r.gmv),
      franchisee_earnings: parseFloat(r.gmv) * (parseFloat(r.revenue_share_pct) / 100),
    }));
  },

  // ── Get franchisee earnings for a territory ───────────────
  getEarnings: async (franchiseId, period = 'month') => {
    const INTERVAL = { today: '1 day', week: '7 days', month: '30 days', year: '365 days' }[period] || '30 days';

    const { rows: fa } = await query(
      'SELECT * FROM franchise_applications WHERE id = $1 AND status = $2',
      [franchiseId, 'active']
    );

    if (!fa[0]) throw Object.assign(new Error('Franchise territory not found'), { statusCode: 404 });

    const { rows } = await query(
      `SELECT
         COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_status = 'delivered'), 0) AS total_gmv,
         COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_status = 'delivered'
           AND o.created_at >= NOW() - INTERVAL '${INTERVAL}'), 0) AS period_gmv,
         COUNT(DISTINCT o.id) FILTER (WHERE o.order_status = 'delivered')::int AS total_orders,
         COUNT(DISTINCT o.user_id)::int AS unique_customers
       FROM franchise_applications fa
       LEFT JOIN cities   c ON c.id = fa.city_id
       LEFT JOIN areas    a ON a.city_id = c.id
       LEFT JOIN merchants m ON m.area_id = a.id
       LEFT JOIN orders   o ON o.merchant_id = m.id
       WHERE fa.id = $1`,
      [franchiseId]
    );

    const totalGmv  = parseFloat(rows[0].total_gmv);
    const periodGmv = parseFloat(rows[0].period_gmv);
    const shareRate = parseFloat(fa[0].revenue_share_pct) / 100;

    return {
      franchise_id:      franchiseId,
      territory_city:    fa[0].territory_city,
      revenue_share_pct: fa[0].revenue_share_pct,
      period,
      total_gmv:    totalGmv,
      period_gmv:   periodGmv,
      total_earnings:  parseFloat((totalGmv  * shareRate).toFixed(2)),
      period_earnings: parseFloat((periodGmv * shareRate).toFixed(2)),
      total_orders:  rows[0].total_orders,
      unique_customers: rows[0].unique_customers,
    };
  },
};

module.exports = { FranchiseService, APP_STATUS };
