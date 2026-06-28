// src/middlewares/rateLimiter.middleware.js
// ─────────────────────────────────────────────────────────────
// Rate Limiting — MyLocalBazaar.store
// Different limits for: general | auth | OTP | admin | uploads
//
// Counters are stored in REDIS (rate-limit-redis) so the limits are
// shared across all instances and survive deploys/restarts. Without a
// shared store, express-rate-limit keeps counters in per-process memory,
// which on Railway (multiple instances + frequent deploys) effectively
// weakens every limit.
// ─────────────────────────────────────────────────────────────

const rateLimit = require('express-rate-limit');
const logger    = require('../config/logger');
const { getClient } = require('../config/redis');

// rate-limit-redis ships as ESM; support named/default/object export shapes.
const RedisStoreImport = require('rate-limit-redis');
const RedisStore = RedisStoreImport.RedisStore || RedisStoreImport.default || RedisStoreImport;

// Build a Redis-backed store with a per-limiter key prefix.
// sendCommand lazily resolves the shared node-redis v4 client.
const makeStore = (label) => new RedisStore({
  prefix: `mlb:rl:${label}:`,
  sendCommand: async (...args) => {
    const client = await getClient();
    return client.sendCommand(args);
  },
});

const makeHandler = (label) => (req, res) => {
  logger.warn(`Rate limit hit: ${label}`, { ip: req.ip, path: req.path });
  res.status(429).json({
    success: false,
    message: 'Too many requests. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: res.getHeader('Retry-After'),
  });
};

// ── General API rate limit (100 req / 15 min per IP) ──────────
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders:   false,
  store:    makeStore('general'),
  handler:  makeHandler('general'),
});

// ── Auth endpoints (login/register) — stricter ────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders:   false,
  skipSuccessfulRequests: true,  // Only count failed attempts
  store:    makeStore('auth'),
  handler:  makeHandler('auth'),
});

// ── OTP requests — very strict ────────────────────────────────
const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,    // 1 hour window
  max:      parseInt(process.env.OTP_RATE_LIMIT_MAX) || 5,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator: (req) => req.body?.phone || req.ip,
  store:    makeStore('otp'),
  handler:  makeHandler('otp'),
});

// ── Admin panel — strictest ───────────────────────────────────
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      30,
  standardHeaders: true,
  legacyHeaders:   false,
  store:    makeStore('admin'),
  handler:  makeHandler('admin'),
});

// ── File upload limiter ───────────────────────────────────────
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,    // 1 minute
  max:      20,
  store:    makeStore('upload'),
  handler:  makeHandler('upload'),
});

module.exports = { generalLimiter, authLimiter, otpLimiter, adminLimiter, uploadLimiter };
