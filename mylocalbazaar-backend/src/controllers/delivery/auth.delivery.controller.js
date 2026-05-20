// src/controllers/delivery/auth.delivery.controller.js
// ─────────────────────────────────────────────────────────────
// Delivery Partner Auth Controller — MyLocalBazaar.store
//
// FLOW:
//   POST /delivery/auth/send-otp      → Request OTP to verify phone
//   POST /delivery/auth/verify-otp    → Verify phone → temp token
//   POST /delivery/auth/register      → Full registration
//   POST /delivery/auth/login         → Password login
//   GET  /delivery/auth/me            → Own profile
//   POST /delivery/auth/refresh       → Rotate tokens
//   POST /delivery/auth/logout        → Revoke tokens
// ─────────────────────────────────────────────────────────────

const { sendOTP, verifyOTP }  = require('../../utils/otp');
const { DeliveryAuthService } = require('../../services/delivery.service');
const { TokenService }        = require('../../services/auth.service');
const { redis }               = require('../../config/redis');
const {
  success, created, badRequest, notFound, conflict,
} = require('../../utils/response');
const logger = require('../../config/logger');

// ── POST /delivery/auth/send-otp ──────────────────────────────
const sendOTPHandler = async (req, res) => {
  const { phone, purpose = 'login' } = req.body;

  if (purpose === 'register') {
    const existing = await DeliveryAuthService.findByPhone(phone);
    if (existing) {
      return conflict(res, 'A delivery partner account already exists for this phone number.');
    }
  }

  await sendOTP(phone, `dp_${purpose}`);
  return success(res, { sent: true }, `OTP sent to ${phone.slice(0, 5)}XXXXX`);
};

// ── POST /delivery/auth/verify-otp ───────────────────────────
const verifyOTPHandler = async (req, res) => {
  const { phone, otp, purpose = 'login' } = req.body;

  const otpResult = await verifyOTP(phone, otp, `dp_${purpose}`);
  if (!otpResult.valid) return badRequest(res, otpResult.reason);

  if (purpose === 'register') {
    // Issue phone-verified token (15 min) for registration step
    const jwt = require('jsonwebtoken');
    const phoneToken = jwt.sign(
      { phone, verified: true, purpose: 'dp_register' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    await redis.set(`mlb:dp_phone_verified:${phone}`, phoneToken, 900);

    return success(res, {
      phone_verified_token: phoneToken,
    }, 'Phone verified. Complete your registration.');
  }

  // OTP login (alternative to password)
  const partner = await DeliveryAuthService.findByPhone(phone);
  if (!partner) return notFound(res, 'No account found. Please register first.');

  const { createAccessToken, createRefreshToken } = require('../../utils/generators');
  const { token: access }  = createAccessToken(partner.id, 'delivery_partner');
  const { token: refresh } = createRefreshToken(partner.id, 'delivery_partner');
  const { password_hash, ...safe } = partner;

  return success(res, {
    partner: safe,
    tokens:  { access_token: access, refresh_token: refresh, token_type: 'Bearer' },
  }, 'Login successful');
};

// ── POST /delivery/auth/register ──────────────────────────────
const register = async (req, res) => {
  const { phone_verified_token, ...data } = req.body;

  // Validate phone verified token
  const jwt = require('jsonwebtoken');
  let verifiedPhone;
  try {
    const decoded = jwt.verify(phone_verified_token, process.env.JWT_SECRET);
    if (decoded.purpose !== 'dp_register') return badRequest(res, 'Invalid verification token');
    verifiedPhone = decoded.phone;
  } catch {
    return badRequest(res, 'Phone verification token expired. Please verify your phone again.');
  }

  const stored = await redis.get(`mlb:dp_phone_verified:${verifiedPhone}`);
  if (!stored || stored !== phone_verified_token) {
    return badRequest(res, 'Verification token already used or expired');
  }

  const partner = await DeliveryAuthService.register(verifiedPhone, data);
  await redis.del(`mlb:dp_phone_verified:${verifiedPhone}`);

  logger.info('Delivery partner registered', { partnerId: partner.id });

  return created(res, {
    partner: {
      id:             partner.id,
      full_name:      partner.full_name,
      phone:          partner.phone,
      vehicle_type:   partner.vehicle_type,
      is_verified:    partner.is_verified,
    },
    message: 'Registration submitted. Admin will verify your documents within 24 hours.',
  }, 'Registration successful');
};

// ── POST /delivery/auth/login ─────────────────────────────────
const login = async (req, res) => {
  const { phone, password } = req.body;
  const { partner, tokens } = await DeliveryAuthService.login(phone, password);

  return success(res, {
    partner: {
      id:               partner.id,
      full_name:        partner.full_name,
      phone:            partner.phone,
      vehicle_type:     partner.vehicle_type,
      is_online:        partner.is_online,
      is_verified:      partner.is_verified,
      wallet_balance:   partner.wallet_balance,
      total_deliveries: partner.total_deliveries,
      rating:           partner.rating,
    },
    tokens,
  }, 'Login successful');
};

// ── GET /delivery/auth/me ─────────────────────────────────────
const getProfile = async (req, res) => {
  const partner = await DeliveryAuthService.findById(req.user.id);
  if (!partner) return notFound(res, 'Partner not found');
  return success(res, { partner });
};

// ── POST /delivery/auth/refresh ───────────────────────────────
const refreshToken = async (req, res) => {
  const tokens = await TokenService.refresh(req.body.refresh_token);
  return success(res, { tokens }, 'Tokens refreshed');
};

// ── POST /delivery/auth/logout ────────────────────────────────
const logout = async (req, res) => {
  const { id, role, jti } = req.user;
  const jwt = require('jsonwebtoken');
  const decoded = jwt.decode(req.headers.authorization.split(' ')[1]);
  await TokenService.logout(id, role, jti, decoded.exp);
  return success(res, null, 'Logged out successfully');
};

module.exports = { sendOTPHandler, verifyOTPHandler, register, login, getProfile, refreshToken, logout };
