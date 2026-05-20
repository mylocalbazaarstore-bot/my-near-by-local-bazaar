// src/middlewares/auth.middleware.js
// ─────────────────────────────────────────────────────────────
// JWT Authentication Middleware — MyLocalBazaar.store
// Protects routes for: customer | merchant | admin | delivery
// ─────────────────────────────────────────────────────────────

const jwt  = require('jsonwebtoken');
const { redis } = require('../config/redis');
const { query } = require('../config/db');
const { unauthorized, forbidden } = require('../utils/response');
const logger = require('../config/logger');

// ── Decode & validate JWT ──────────────────────────────────────
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return unauthorized(res, 'Access token required');
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') return unauthorized(res, 'Token expired');
      return unauthorized(res, 'Invalid token');
    }

    // Check token revocation (logout blacklist)
    const isRevoked = await redis.isTokenRevoked(decoded.jti);
    if (isRevoked) return unauthorized(res, 'Token has been revoked');

    // Attach user info to request
    req.user = {
      id:   decoded.sub,
      role: decoded.role,
      jti:  decoded.jti,
    };
    next();
  } catch (err) {
    logger.error('Auth middleware error:', { message: err.message });
    return unauthorized(res, 'Authentication failed');
  }
};

// ── Role-based access control ──────────────────────────────────
const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) return unauthorized(res);
  if (!allowedRoles.includes(req.user.role)) {
    return forbidden(res, `Access denied for role: ${req.user.role}`);
  }
  next();
};

// ── Admin IP restriction ───────────────────────────────────────
const restrictToAdminIPs = (req, res, next) => {
  const allowedIPs = (process.env.ADMIN_ALLOWED_IPS || '').split(',').map(ip => ip.trim());
  const clientIP   = req.ip || req.connection.remoteAddress;

  if (process.env.NODE_ENV === 'development') return next(); // skip in dev

  if (!allowedIPs.includes(clientIP)) {
    logger.warn('Admin access blocked for IP:', { ip: clientIP });
    return forbidden(res, 'Access denied from this IP address');
  }
  next();
};

// ── Optional auth (attach user if token present, don't fail) ──
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return next();

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const isRevoked = await redis.isTokenRevoked(decoded.jti);

    if (!isRevoked) {
      req.user = { id: decoded.sub, role: decoded.role, jti: decoded.jti };
    }
  } catch { /* ignore */ }
  next();
};

module.exports = { authenticate, authorize, restrictToAdminIPs, optionalAuth };
