// src/config/db.js
// ─────────────────────────────────────────────────────────────
// PostgreSQL Connection Pool — MyLocalBazaar.store
// Uses pg-pool for connection management + query helpers
// ─────────────────────────────────────────────────────────────

const { Pool } = require('pg');
const logger = require('./logger');

// ── Build pool config ──────────────────────────────────────────
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }   // Railway / Supabase SSL
        : false,
    }
  : {
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME     || 'mylocalbazaar_db',
      user:     process.env.DB_USER     || 'mlb_user',
      password: process.env.DB_PASSWORD,
      ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    };

const pool = new Pool({
  ...poolConfig,
  min:             parseInt(process.env.DB_POOL_MIN)                || 2,
  max:             parseInt(process.env.DB_POOL_MAX)                || 10,
  idleTimeoutMillis:    parseInt(process.env.DB_POOL_IDLE_TIMEOUT)  || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT) || 2000,
});

// ── Pool event listeners ───────────────────────────────────────
pool.on('connect', () => {
  logger.debug('PostgreSQL: new client connected to pool');
});

pool.on('error', (err) => {
  logger.error('PostgreSQL pool error:', { message: err.message, stack: err.stack });
  // Don't crash — let the pool recover
});

// ── Query helper — logs slow queries automatically ─────────────
const SLOW_QUERY_THRESHOLD_MS = 1000;

const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      logger.warn('Slow PostgreSQL query detected', {
        duration_ms: duration,
        query: text.substring(0, 200),
      });
    } else {
      logger.debug('PostgreSQL query executed', { duration_ms: duration, rows: result.rowCount });
    }

    return result;
  } catch (err) {
    logger.error('PostgreSQL query error', {
      message: err.message,
      query: text.substring(0, 200),
      params: params ? JSON.stringify(params).substring(0, 200) : null,
    });
    throw err;
  }
};

// ── Transaction helper ─────────────────────────────────────────
// Usage: await withTransaction(async (client) => { await client.query(...) })
const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Transaction rolled back:', { message: err.message });
    throw err;
  } finally {
    client.release();
  }
};

// ── Paginated query helper ─────────────────────────────────────
// Automatically adds LIMIT / OFFSET and returns { rows, total, page, totalPages }
const queryPaginated = async (text, params = [], { page = 1, limit = 20 } = {}) => {
  const safeLimit = Math.min(parseInt(limit), parseInt(process.env.MAX_PAGE_SIZE) || 100);
  const offset    = (parseInt(page) - 1) * safeLimit;

  // Wrap query to get count + paginated result in one round trip
  const countQuery = `SELECT COUNT(*) FROM (${text}) AS _count_query`;
  const pageQuery  = `${text} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

  const [countResult, rowsResult] = await Promise.all([
    pool.query(countQuery, params),
    pool.query(pageQuery, [...params, safeLimit, offset]),
  ]);

  const total      = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(total / safeLimit);

  return {
    rows:       rowsResult.rows,
    total,
    page:       parseInt(page),
    limit:      safeLimit,
    totalPages,
    hasNext:    parseInt(page) < totalPages,
    hasPrev:    parseInt(page) > 1,
  };
};

// ── Health check ───────────────────────────────────────────────
const healthCheck = async () => {
  try {
    const result = await pool.query('SELECT NOW() AS now, version() AS pg_version');
    return {
      status:    'healthy',
      timestamp: result.rows[0].now,
      version:   result.rows[0].pg_version,
      pool: {
        total:   pool.totalCount,
        idle:    pool.idleCount,
        waiting: pool.waitingCount,
      },
    };
  } catch (err) {
    return { status: 'unhealthy', error: err.message };
  }
};

module.exports = { pool, query, withTransaction, queryPaginated, healthCheck };
