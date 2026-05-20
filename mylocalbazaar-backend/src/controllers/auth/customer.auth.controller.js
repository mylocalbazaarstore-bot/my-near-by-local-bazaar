// src/controllers/auth/customer.auth.controller.js
// ─────────────────────────────────────────────────────────────
// Customer Authentication Controller — MyLocalBazaar.store
//
// FLOW:
//   POST /auth/customer/send-otp        → Request OTP
//   POST /auth/customer/verify-otp      → Verify OTP → JWT tokens
//   POST /auth/customer/complete-profile → Fill name/email (new users)
//   GET  /auth/customer/me              → Fetch own profile
//   POST /auth/customer/address         → Add delivery address
//   GET  /auth/customer/addresses       → List addresses
//   PUT  /auth/customer/address/:id     → Update address
//   DELETE /auth/customer/address/:id  → Delete address
//   POST /auth/customer/refresh         → Rotate tokens
//   POST /auth/customer/logout          → Logout + revoke
// ─────────────────────────────────────────────────────────────

const { sendOTP, verifyOTP }             = require('../../utils/otp');
const { CustomerAuthService, TokenService } = require('../../services/auth.service');
const { NotificationService }            = require('../../services/notification.service');
const { query }                          = require('../../config/db');
const { success, created, badRequest, unauthorized, notFound } = require('../../utils/response');
const logger                             = require('../../config/logger');

// ── POST /auth/customer/send-otp ──────────────────────────────
// Request: { phone, purpose? }
// Response: { sent: true }
const sendOTPHandler = async (req, res) => {
  const { phone, purpose = 'login' } = req.body;

  // For 'login' purpose we allow both new and existing users
  // For 'register' purpose, block if phone already exists
  if (purpose === 'register') {
    const existing = await CustomerAuthService.findByPhone(phone);
    if (existing) {
      return badRequest(res, 'Phone number already registered. Please login instead.');
    }
  }

  await sendOTP(phone, purpose);
  logger.info('Customer OTP sent', { phone, purpose });

  return success(res, { sent: true }, `OTP sent to ${phone.slice(0, 5)}XXXXX`);
};

// ── POST /auth/customer/verify-otp ───────────────────────────
// Request: { phone, otp, purpose? }
// Response: { user, tokens, is_new_user }
const verifyOTPHandler = async (req, res) => {
  const { phone, otp, purpose = 'login' } = req.body;

  const otpResult = await verifyOTP(phone, otp, purpose);
  if (!otpResult.valid) {
    return badRequest(res, otpResult.reason);
  }

  const { user, isNewUser, tokens } = await CustomerAuthService.loginOrRegister(phone, req);

  // Fire welcome notification for brand-new users (non-blocking)
  if (isNewUser) {
    NotificationService.sendCustomerWelcome({
      email:        user.email,
      phone:        user.phone,
      name:         user.full_name,
      referralCode: user.referral_code,
    }).catch((err) => logger.warn('Welcome notification failed:', { message: err.message }));
  }

  return success(res, {
    user: {
      id:               user.id,
      full_name:        user.full_name,
      phone:            user.phone,
      email:            user.email,
      referral_code:    user.referral_code,
      wallet_balance:   user.wallet_balance,
      is_phone_verified: true,
      is_new_user:      isNewUser,
    },
    tokens,
  }, isNewUser ? 'Welcome to MyLocalBazaar!' : 'Login successful');
};

// ── POST /auth/customer/complete-profile ──────────────────────
// Called by new users to set name, email, gender etc.
// Requires: Bearer token (from verify-otp)
const completeProfile = async (req, res) => {
  const userId = req.user.id;
  const user   = await CustomerAuthService.completeProfile(userId, req.body);

  return success(res, { user }, 'Profile updated successfully');
};

// ── GET /auth/customer/me ─────────────────────────────────────
const getProfile = async (req, res) => {
  const user = await CustomerAuthService.findById(req.user.id);
  if (!user) return notFound(res, 'User not found');

  return success(res, { user });
};

// ── POST /auth/customer/address ───────────────────────────────
const addAddress = async (req, res) => {
  const userId = req.user.id;
  const d = req.body;

  // If setting as default, clear old default first
  if (d.is_default) {
    await query(
      'UPDATE user_addresses SET is_default = false WHERE user_id = $1',
      [userId]
    );
  }

  // Check if this is the user's first address — auto-set as default
  const { rows: existing } = await query(
    'SELECT COUNT(*) AS cnt FROM user_addresses WHERE user_id = $1', [userId]
  );
  const isFirst = parseInt(existing[0].cnt) === 0;

  const { rows } = await query(
    `INSERT INTO user_addresses
       (user_id, label, full_name, phone, address_line1, address_line2,
        landmark, area_id, pincode, city, state, latitude, longitude, is_default)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      userId, d.label, d.full_name, d.phone,
      d.address_line1, d.address_line2 || null, d.landmark || null,
      d.area_id || null, d.pincode,
      d.city  || 'Navi Mumbai', d.state || 'Maharashtra',
      d.latitude || null, d.longitude || null,
      d.is_default || isFirst,
    ]
  );

  return created(res, { address: rows[0] }, 'Address added successfully');
};

// ── GET /auth/customer/addresses ──────────────────────────────
const getAddresses = async (req, res) => {
  const { rows } = await query(
    `SELECT a.*, ar.name AS area_name
     FROM user_addresses a
     LEFT JOIN areas ar ON ar.id = a.area_id
     WHERE a.user_id = $1
     ORDER BY a.is_default DESC, a.created_at DESC`,
    [req.user.id]
  );
  return success(res, { addresses: rows });
};

// ── PUT /auth/customer/address/:id ───────────────────────────
const updateAddress = async (req, res) => {
  const { id } = req.params;
  const userId  = req.user.id;
  const d = req.body;

  const { rows: existing } = await query(
    'SELECT id FROM user_addresses WHERE id = $1 AND user_id = $2', [id, userId]
  );
  if (!existing[0]) return notFound(res, 'Address not found');

  if (d.is_default) {
    await query('UPDATE user_addresses SET is_default = false WHERE user_id = $1', [userId]);
  }

  const { rows } = await query(
    `UPDATE user_addresses
     SET label=$1, full_name=$2, phone=$3, address_line1=$4, address_line2=$5,
         landmark=$6, area_id=$7, pincode=$8, city=$9, state=$10,
         latitude=$11, longitude=$12, is_default=$13
     WHERE id=$14 AND user_id=$15
     RETURNING *`,
    [
      d.label, d.full_name, d.phone,
      d.address_line1, d.address_line2 || null, d.landmark || null,
      d.area_id || null, d.pincode,
      d.city || 'Navi Mumbai', d.state || 'Maharashtra',
      d.latitude || null, d.longitude || null,
      d.is_default || false,
      id, userId,
    ]
  );

  return success(res, { address: rows[0] }, 'Address updated');
};

// ── DELETE /auth/customer/address/:id ────────────────────────
const deleteAddress = async (req, res) => {
  const { id } = req.params;
  const { rowCount } = await query(
    'DELETE FROM user_addresses WHERE id = $1 AND user_id = $2', [id, req.user.id]
  );
  if (!rowCount) return notFound(res, 'Address not found');
  return success(res, null, 'Address deleted');
};

// ── POST /auth/customer/refresh ───────────────────────────────
const refreshToken = async (req, res) => {
  const { refresh_token } = req.body;
  const tokens = await TokenService.refresh(refresh_token);
  return success(res, { tokens }, 'Tokens refreshed');
};

// ── POST /auth/customer/logout ────────────────────────────────
const logout = async (req, res) => {
  const { id, role, jti } = req.user;
  // Decode exp from token to calculate TTL for blacklist
  const jwt     = require('jsonwebtoken');
  const decoded = jwt.decode(req.headers.authorization.split(' ')[1]);
  await TokenService.logout(id, role, jti, decoded.exp);
  return success(res, null, 'Logged out successfully');
};

module.exports = {
  sendOTPHandler,
  verifyOTPHandler,
  completeProfile,
  getProfile,
  addAddress,
  getAddresses,
  updateAddress,
  deleteAddress,
  refreshToken,
  logout,
};
