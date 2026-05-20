// src/middlewares/rateLimiter.middleware.js
// ─────────────────────────────────────────────────────────────
// Rate Limiting — MyLocalBazaar.store
// Different limits for: general | auth | OTP | admin | uploads
// ─────────────────────────────────────────────────────────────

const rateLimit = require('express-rate-limit');
const logger    = require('../config/logger');

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
  handler: makeHandler('general'),
});

// ── Auth endpoints (login/register) — stricter ────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders:   false,
  skipSuccessfulRequests: true,  // Only count failed attempts
  handler: makeHandler('auth'),
});

// ── OTP requests — very strict ────────────────────────────────
const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,    // 1 hour window
  max:      parseInt(process.env.OTP_RATE_LIMIT_MAX) || 5,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator: (req) => req.body?.phone || req.ip,
  handler: makeHandler('otp'),
});

// ── Admin panel — strictest ───────────────────────────────────
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      30,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: makeHandler('admin'),
});

// ── File upload limiter ───────────────────────────────────────
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,    // 1 minute
  max:      20,
  handler: makeHandler('upload'),
});

module.exports = { generalLimiter, authLimiter, otpLimiter, adminLimiter, uploadLimiter };
