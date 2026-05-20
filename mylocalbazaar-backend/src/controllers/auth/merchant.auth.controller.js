// src/controllers/auth/merchant.auth.controller.js
// ─────────────────────────────────────────────────────────────
// Merchant Authentication Controller — MyLocalBazaar.store
//
// FLOW:
//   POST /auth/merchant/send-otp          → OTP to verify phone
//   POST /auth/merchant/verify-otp        → Confirm phone, get temp token
//   POST /auth/merchant/register          → Full registration with store details
//   POST /auth/merchant/login             → Password-based login
//   GET  /auth/merchant/me                → Own store profile
//   PUT  /auth/merchant/hours             → Set operating hours
//   POST /auth/merchant/kyc              → Submit KYC documents
//   GET  /auth/merchant/kyc/status       → Check KYC status
//   POST /auth/merchant/refresh           → Rotate tokens
//   POST /auth/merchant/logout            → Revoke tokens
//   PATCH /auth/merchant/toggle-open     → Open/close store toggle
// ─────────────────────────────────────────────────────────────

const { sendOTP, verifyOTP }               = require('../../utils/otp');
const { MerchantAuthService, TokenService } = require('../../services/auth.service');
const { NotificationService }              = require('../../services/notification.service');
const { query }                            = require('../../config/db');
const { redis }                            = require('../../config/redis');
const {
  success, created, badRequest, unauthorized, notFound, conflict,
} = require('../../utils/response');
const logger = require('../../config/logger');

// ── POST /auth/merchant/send-otp ──────────────────────────────
// Sends OTP to verify phone number before registration or login
const sendOTPHandler = async (req, res) => {
  const { phone, purpose = 'login' } = req.body;

  if (purpose === 'register') {
    const exists = await MerchantAuthService.phoneExists(phone);
    if (exists) {
      return conflict(res, 'A merchant account with this phone number already exists. Please login.');
    }
  }

  if (purpose === 'login') {
    const merchant = await MerchantAuthService.findByPhone(phone);
    if (!merchant) {
      return notFound(res, 'No merchant account found with this phone number. Please register first.');
    }
  }

  await sendOTP(phone, `merchant_${purpose}`);
  logger.info('Merchant OTP sent', { phone, purpose });

  return success(res, { sent: true }, `OTP sent to ${phone.slice(0, 5)}XXXXX`);
};

// ── POST /auth/merchant/verify-otp ───────────────────────────
// For 'register' purpose: returns a short-lived phone_verified_token
// For 'login' purpose: OTP-based login (alternative to password)
const verifyOTPHandler = async (req, res) => {
  const { phone, otp, purpose = 'login' } = req.body;

  const otpResult = await verifyOTP(phone, otp, `merchant_${purpose}`);
  if (!otpResult.valid) return badRequest(res, otpResult.reason);

  if (purpose === 'register') {
    // Issue a short-lived token proving phone was verified
    // Frontend includes this token in the /register request
    const jwt = require('jsonwebtoken');
    const phoneToken = jwt.sign(
      { phone, verified: true, purpose: 'merchant_register' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    // Store in Redis to prevent replay
    await redis.set(`mlb:phone_verified:${phone}`, phoneToken, 900); // 15 min

    return success(res, {
      phone_verified_token: phoneToken,
      message: 'Phone verified. Complete your registration.',
    }, 'Phone number verified');
  }

  // OTP login flow (no password needed for existing merchants)
  const merchant = await MerchantAuthService.findByPhone(phone);
  if (!merchant) return notFound(res, 'Merchant not found');

  if (['disabled', 'rejected'].includes(merchant.merchant_status)) {
    return badRequest(res, 'Your account has been disabled. Contact support@mylocalbazaar.store');
  }

  await query('UPDATE merchants SET last_login_at = NOW() WHERE id = $1', [merchant.id]);
  const tokens = await require('../../services/auth.service').TokenService.refresh ||
    (await (async () => {
      const { createAccessToken, createRefreshToken } = require('../../utils/generators');
      const { token: access }  = createAccessToken(merchant.id, 'merchant');
      const { token: refresh } = createRefreshToken(merchant.id, 'merchant');
      return { access_token: access, refresh_token: refresh, token_type: 'Bearer' };
    })());

  const { password_hash, ...safeProfile } = merchant;
  return success(res, { merchant: safeProfile, tokens }, 'Login successful');
};

// ── POST /auth/merchant/register ─────────────────────────────
// Full merchant registration — requires phone_verified_token
const register = async (req, res) => {
  const { phone_verified_token, ...registrationData } = req.body;

  // Validate phone_verified_token
  let verifiedPhone;
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(phone_verified_token, process.env.JWT_SECRET);
    if (decoded.purpose !== 'merchant_register' || !decoded.verified) {
      return badRequest(res, 'Invalid phone verification token');
    }
    verifiedPhone = decoded.phone;
  } catch {
    return badRequest(res, 'Phone verification token expired. Please verify your phone again.');
  }

  // Confirm token still in Redis (prevents replay after use)
  const storedToken = await redis.get(`mlb:phone_verified:${verifiedPhone}`);
  if (!storedToken || storedToken !== phone_verified_token) {
    return badRequest(res, 'Phone verification token already used or expired');
  }

  // Check merchant doesn't already exist
  const existing = await MerchantAuthService.phoneExists(verifiedPhone);
  if (existing) {
    return conflict(res, 'Merchant account already exists for this phone number');
  }

  // Register merchant
  const merchant = await MerchantAuthService.register(verifiedPhone, registrationData);

  // Invalidate phone_verified_token (one-time use)
  await redis.del(`mlb:phone_verified:${verifiedPhone}`);

  // Send acknowledgment notifications (non-blocking)
  NotificationService.sendMerchantRegistrationAck({
    email:     registrationData.email,
    phone:     verifiedPhone,
    ownerName: registrationData.owner_name,
    storeName: registrationData.store_name,
  }).catch((err) => logger.warn('Merchant registration notification failed:', { message: err.message }));

  logger.info('Merchant registered', { merchantId: merchant.id, store: merchant.store_name });

  return created(res, {
    merchant: {
      id:              merchant.id,
      store_name:      merchant.store_name,
      store_slug:      merchant.store_slug,
      store_category:  merchant.store_category,
      kyc_status:      merchant.kyc_status,
      merchant_status: merchant.merchant_status,
    },
    message: 'Your store application is under review. We will notify you within 1–2 business days.',
  }, 'Merchant registered successfully');
};

// ── POST /auth/merchant/login ─────────────────────────────────
// Password-based login (standard flow for returning merchants)
const login = async (req, res) => {
  const { phone, password } = req.body;
  const { merchant, tokens } = await MerchantAuthService.login(phone, password, req);

  return success(res, {
    merchant: {
      id:               merchant.id,
      owner_name:       merchant.owner_name,
      store_name:       merchant.store_name,
      store_slug:       merchant.store_slug,
      store_category:   merchant.store_category,
      kyc_status:       merchant.kyc_status,
      merchant_status:  merchant.merchant_status,
      subscription_plan: merchant.subscription_plan,
      is_open:          merchant.is_open,
    },
    tokens,
    alerts: buildMerchantAlerts(merchant),
  }, 'Login successful');
};

// Build alert messages for merchant dashboard (missing KYC etc.)
const buildMerchantAlerts = (merchant) => {
  const alerts = [];
  if (merchant.kyc_status === 'pending') {
    alerts.push({ type: 'warning', message: 'Complete your KYC to go live on MyLocalBazaar' });
  }
  if (merchant.merchant_status === 'pending') {
    alerts.push({ type: 'info', message: 'Your account is under review by our team' });
  }
  if (!merchant.gstin) {
    alerts.push({ type: 'info', message: 'Add your GST number to unlock GST invoicing' });
  }
  return alerts;
};

// ── GET /auth/merchant/me ─────────────────────────────────────
const getProfile = async (req, res) => {
  const merchant = await MerchantAuthService.findById(req.user.id);
  if (!merchant) return notFound(res, 'Merchant not found');

  // Fetch operating hours
  const { rows: hours } = await query(
    `SELECT day_of_week, open_time, close_time, is_closed
     FROM merchant_operating_hours WHERE merchant_id = $1 ORDER BY day_of_week`,
    [req.user.id]
  );

  return success(res, { merchant: { ...merchant, operating_hours: hours } });
};

// ── PUT /auth/merchant/hours ──────────────────────────────────
const updateOperatingHours = async (req, res) => {
  await MerchantAuthService.updateOperatingHours(req.user.id, req.body.hours);
  return success(res, null, 'Operating hours updated successfully');
};

// ── POST /auth/merchant/kyc ───────────────────────────────────
// KYC document text fields — files handled by Cloudinary middleware in route
const submitKYC = async (req, res) => {
  const merchantId = req.user.id;
  const files = req.files || {};

  // Build file URL fields from Cloudinary upload results
  const fileFields = {};
  const cloudinaryFieldMap = {
    gst_certificate: 'gst_certificate_url',
    pan_card:        'pan_card_url',
    aadhaar_front:   'aadhaar_front_url',
    aadhaar_back:    'aadhaar_back_url',
    shop_license:    'shop_license_url',
    food_license:    'food_license_url',
  };

  Object.entries(cloudinaryFieldMap).forEach(([fileKey, dbKey]) => {
    if (files[fileKey]?.[0]?.path) {
      fileFields[dbKey] = files[fileKey][0].path;
    }
  });

  // Update KYC record
  const setClauses = Object.keys(fileFields)
    .map((key, i) => `${key} = $${i + 2}`)
    .join(', ');
  const values = [merchantId, ...Object.values(fileFields)];

  if (setClauses) {
    await query(
      `UPDATE merchant_kyc
       SET ${setClauses}, submitted_at = NOW()
       WHERE merchant_id = $1`,
      values
    );
  }

  // Update text KYC fields on merchant record
  if (req.body.gstin || req.body.pan_number) {
    await query(
      `UPDATE merchants
       SET gstin      = COALESCE($1, gstin),
           pan_number = COALESCE($2, pan_number),
           kyc_status = 'submitted',
           updated_at = NOW()
       WHERE id = $3`,
      [req.body.gstin || null, req.body.pan_number || null, merchantId]
    );
  }

  logger.info('Merchant KYC submitted', { merchantId, fields: Object.keys(fileFields) });

  return success(res, {
    kyc_status: 'submitted',
    documents_uploaded: Object.keys(fileFields),
    message: 'Documents submitted. Admin will verify within 1–2 business days.',
  }, 'KYC documents submitted');
};

// ── GET /auth/merchant/kyc/status ────────────────────────────
const getKYCStatus = async (req, res) => {
  const { rows } = await query(
    `SELECT m.kyc_status, m.merchant_status,
            k.gst_certificate_url, k.pan_card_url,
            k.aadhaar_front_url, k.aadhaar_back_url,
            k.shop_license_url, k.food_license_url,
            k.submitted_at, k.verified_at, k.rejection_reason
     FROM merchants m
     LEFT JOIN merchant_kyc k ON k.merchant_id = m.id
     WHERE m.id = $1`,
    [req.user.id]
  );
  if (!rows[0]) return notFound(res, 'Merchant not found');

  return success(res, { kyc: rows[0] });
};

// ── PATCH /auth/merchant/toggle-open ─────────────────────────
const toggleOpen = async (req, res) => {
  const { rows } = await query(
    'UPDATE merchants SET is_open = NOT is_open, updated_at = NOW() WHERE id = $1 RETURNING is_open',
    [req.user.id]
  );
  const status = rows[0].is_open ? 'open' : 'closed';
  return success(res, { is_open: rows[0].is_open }, `Store is now ${status}`);
};

// ── POST /auth/merchant/refresh ───────────────────────────────
const refreshToken = async (req, res) => {
  const tokens = await TokenService.refresh(req.body.refresh_token);
  return success(res, { tokens }, 'Tokens refreshed');
};

// ── PATCH /auth/merchant/settings ────────────────────────────
// Update store operational settings (description, min order, delivery radius, COD, WhatsApp)
const updateSettings = async (req, res) => {
  const allowed = ['store_description', 'min_order_value', 'delivery_radius_km', 'accepts_cod', 'whatsapp_catalog_link'];
  const fields  = [];
  const values  = [];
  let   idx     = 1;

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(req.body[key]);
    }
  }

  if (fields.length === 0) return badRequest(res, 'No fields to update');

  fields.push('updated_at = NOW()');
  values.push(req.user.id);

  const { rows } = await query(
    `UPDATE merchants
     SET ${fields.join(', ')}
     WHERE id = $${idx}
     RETURNING id, store_description, min_order_value, delivery_radius_km,
               accepts_cod, whatsapp_catalog_link, is_open`,
    values
  );

  return success(res, { merchant: rows[0] }, 'Settings updated');
};

// ── POST /auth/merchant/logo ──────────────────────────────────
// Cloudinary upload handled by uploadMerchantLogo middleware before this
const uploadLogo = async (req, res) => {
  if (!req.file) return badRequest(res, 'No file uploaded');
  const logoUrl = req.file.path;
  await query(
    'UPDATE merchants SET store_logo_url = $1, updated_at = NOW() WHERE id = $2',
    [logoUrl, req.user.id]
  );
  return success(res, { logo_url: logoUrl }, 'Logo updated');
};

// ── GET /auth/merchant/bank ───────────────────────────────────
const getBankDetails = async (req, res) => {
  const { rows } = await query(
    `SELECT id, account_holder_name, account_number, ifsc_code,
            bank_name, branch_name, upi_id, is_verified, created_at
     FROM merchant_bank_details WHERE merchant_id = $1 LIMIT 1`,
    [req.user.id]
  );
  return success(res, { bank: rows[0] || null });
};

// ── POST /auth/merchant/bank ──────────────────────────────────
const saveBankDetails = async (req, res) => {
  const { account_holder_name, account_number, ifsc_code, bank_name, branch_name, upi_id } = req.body;

  if (!account_holder_name || !account_number || !ifsc_code) {
    return badRequest(res, 'Account holder name, account number and IFSC code are required');
  }

  const { rows } = await query(
    `INSERT INTO merchant_bank_details
       (merchant_id, account_holder_name, account_number, ifsc_code, bank_name, branch_name, upi_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (merchant_id) DO UPDATE
       SET account_holder_name = EXCLUDED.account_holder_name,
           account_number      = EXCLUDED.account_number,
           ifsc_code           = EXCLUDED.ifsc_code,
           bank_name           = EXCLUDED.bank_name,
           branch_name         = EXCLUDED.branch_name,
           upi_id              = EXCLUDED.upi_id,
           updated_at          = NOW()
     RETURNING id, account_holder_name, account_number, ifsc_code, bank_name, upi_id`,
    [req.user.id, account_holder_name, account_number, ifsc_code, bank_name || null, branch_name || null, upi_id || null]
  );

  return success(res, { bank: rows[0] }, 'Bank details saved');
};

// ── POST /auth/merchant/logout ────────────────────────────────
const logout = async (req, res) => {
  const { id, role, jti } = req.user;
  const jwt     = require('jsonwebtoken');
  const decoded = jwt.decode(req.headers.authorization.split(' ')[1]);
  await TokenService.logout(id, role, jti, decoded.exp);
  return success(res, null, 'Logged out successfully');
};

module.exports = {
  sendOTPHandler,
  verifyOTPHandler,
  register,
  login,
  getProfile,
  updateOperatingHours,
  submitKYC,
  getKYCStatus,
  toggleOpen,
  updateSettings,
  uploadLogo,
  getBankDetails,
  saveBankDetails,
  refreshToken,
  logout,
};
