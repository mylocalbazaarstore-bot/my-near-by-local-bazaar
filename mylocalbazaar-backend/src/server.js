// src/server.js
// ─────────────────────────────────────────────────────────────
// HTTP Server Entry Point — MyLocalBazaar.store
// Starts the server, connects DB & Redis, handles graceful shutdown
// Run with: node src/server.js  OR  pm2 start ecosystem.config.js
// ─────────────────────────────────────────────────────────────

require('dotenv').config();
const http   = require('http');
const app    = require('./app');
const logger = require('./config/logger');
const { pool, healthCheck: dbHealthCheck } = require('./config/db');
const { getClient: getRedis, redis }       = require('./config/redis');

const PORT = parseInt(process.env.PORT) || 5000;
const server = http.createServer(app);

// ── Server startup ────────────────────────────────────────────
const startServer = async () => {
  try {
    // 1. Verify PostgreSQL connection
    logger.info('Connecting to PostgreSQL...');
    const dbStatus = await dbHealthCheck();
    if (dbStatus.status !== 'healthy') throw new Error('PostgreSQL connection failed');
    logger.info('PostgreSQL connected', { version: dbStatus.version });

    // 2. Verify Redis connection
    logger.info('Connecting to Redis...');
    await getRedis();
    logger.info('Redis connected');

    // 3. Start HTTP server
    server.listen(PORT, () => {
      logger.info('─────────────────────────────────────────');
      logger.info(`🚀 MyLocalBazaar API running`);
      logger.info(`   Port:        ${PORT}`);
      logger.info(`   Environment: ${process.env.NODE_ENV}`);
      logger.info(`   URL:         http://localhost:${PORT}`);
      logger.info(`   Health:      http://localhost:${PORT}/api/v1/health`);
      logger.info('─────────────────────────────────────────');
    });

  } catch (err) {
    logger.error('Failed to start server:', { message: err.message, stack: err.stack });
    process.exit(1);
  }
};

// ── Graceful shutdown ─────────────────────────────────────────
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received — shutting down gracefully...`);

  server.close(async () => {
    logger.info('HTTP server closed');
    try {
      await pool.end();
      logger.info('PostgreSQL pool closed');
      await redis.disconnect();
      logger.info('Redis disconnected');
    } catch (err) {
      logger.error('Error during shutdown cleanup:', { message: err.message });
    }
    process.exit(0);
  });

  // Force exit after 10s if stuck
  setTimeout(() => {
    logger.error('Forced exit after 10s timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// ── Handle uncaught exceptions ────────────────────────────────
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION:', { message: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('UNHANDLED REJECTION:', { reason: String(reason) });
  process.exit(1);
});

startServer();
