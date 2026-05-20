// src/utils/generators.js
// ─────────────────────────────────────────────────────────────
// Utility Generators — MyLocalBazaar.store
// Order numbers, ticket numbers, JWT token creation/refresh
// ─────────────────────────────────────────────────────────────

const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto  = require('crypto');
const dayjs   = require('dayjs');

// ── Sequential-style unique order number ──────────────────────
// Format: MLB-ORD-2026-XXXXXX  (where X = 6 random alphanumeric)
const generateOrderNumber = () => {
  const year = dayjs().format('YYYY');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 chars
  return `MLB-ORD-${year}-${rand}`;
};

const generateBookingNumber = () => {
  const year = dayjs().format('YYYY');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `MLB-BK-${year}-${rand}`;
};

const generateTicketNumber = () => {
  const year = dayjs().format('YYYY');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `MLB-TKT-${year}-${rand}`;
};

// ── Referral code generator ───────────────────────────────────
const generateReferralCode = (name = '') => {
  const prefix = name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
  const rand   = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}${rand}`;
};

// ── Delivery OTP (4-digit, numeric only) ──────────────────────
const generateDeliveryOTP = () => String(crypto.randomInt(1000, 9999));

// ── JWT Creation ──────────────────────────────────────────────
const createAccessToken = (userId, role) => {
  const jti = uuidv4();  // unique ID per token (for revocation)
  const token = jwt.sign(
    { sub: userId, role, jti },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
  return { token, jti };
};

const createRefreshToken = (userId, role) => {
  const jti = uuidv4();
  const token = jwt.sign(
    { sub: userId, role, jti, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );
  return { token, jti };
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

// ── Slug generator ────────────────────────────────────────────
const generateSlug = (text) => {
  const slugify = require('slugify');
  return slugify(text, { lower: true, strict: true, trim: true });
};

module.exports = {
  generateOrderNumber,
  generateBookingNumber,
  generateTicketNumber,
  generateReferralCode,
  generateDeliveryOTP,
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  generateSlug,
};
