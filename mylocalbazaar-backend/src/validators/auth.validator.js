// src/validators/auth.validator.js
// ─────────────────────────────────────────────────────────────
// Auth Validation Schemas — MyLocalBazaar.store
// Covers: Customer | Merchant | Admin
// All schemas use Joi with custom Indian-specific validators
// ─────────────────────────────────────────────────────────────

const Joi = require('joi');

// ── Reusable field definitions ─────────────────────────────────
const phone = Joi.string()
  .pattern(/^[6-9]\d{9}$/)
  .required()
  .messages({
    'string.pattern.base': 'Phone must be a valid 10-digit Indian mobile number starting with 6-9',
    'any.required': 'Phone number is required',
  });

const otp = Joi.string()
  .length(6)
  .pattern(/^\d{6}$/)
  .required()
  .messages({
    'string.length':       'OTP must be exactly 6 digits',
    'string.pattern.base': 'OTP must contain only digits',
    'any.required':        'OTP is required',
  });

const password = Joi.string()
  .min(8)
  .max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()\-_=+])/)
  .required()
  .messages({
    'string.min':          'Password must be at least 8 characters',
    'string.pattern.base': 'Password must include uppercase, lowercase, a number, and a special character',
    'any.required':        'Password is required',
  });

const pincode = Joi.string()
  .pattern(/^\d{6}$/)
  .required()
  .messages({ 'string.pattern.base': 'Pincode must be a valid 6-digit Indian postal code' });

const gstin = Joi.string()
  .pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
  .messages({ 'string.pattern.base': 'GST number is invalid. Format: 22AAAAA0000A1Z5' });

const pan = Joi.string()
  .pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
  .messages({ 'string.pattern.base': 'PAN number is invalid. Format: ABCDE1234F' });

// ═══════════════════════════════════════════════════════════════
// CUSTOMER AUTH SCHEMAS
// ═══════════════════════════════════════════════════════════════

// Step 1: Customer sends phone → request OTP
const customerSendOTP = Joi.object({
  phone,
  purpose: Joi.string()
    .valid('login', 'register', 'reset')
    .default('login'),
});

// Step 2: Customer verifies OTP (login flow — no registration needed yet)
const customerVerifyOTP = Joi.object({
  phone,
  otp,
  purpose: Joi.string().valid('login', 'register', 'reset').default('login'),
});

// Step 2 (Firebase Phone Auth): Customer exchanges a verified Firebase
// ID token for MyLocalBazaar session tokens
const customerFirebaseLogin = Joi.object({
  id_token: Joi.string().required()
    .messages({ 'any.required': 'Firebase ID token is required' }),
});

// Step 3: Customer completes profile after first OTP login
const customerCompleteProfile = Joi.object({
  full_name: Joi.string().min(2).max(200).trim().required()
    .messages({ 'any.required': 'Full name is required' }),
  email: Joi.string().email().lowercase().trim().optional(),
  gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').optional(),
  date_of_birth: Joi.date().max('now').optional()
    .messages({ 'date.max': 'Date of birth cannot be in the future' }),
  referral_code: Joi.string().trim().uppercase().optional(),
});

// Customer updates their profile (all fields optional — PATCH /profile)
const customerUpdateProfile = Joi.object({
  full_name: Joi.string().min(2).max(200).trim().optional(),
  email: Joi.string().email().lowercase().trim().optional(),
  gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').optional(),
  date_of_birth: Joi.date().max('now').optional()
    .messages({ 'date.max': 'Date of birth cannot be in the future' }),
});

// Customer adds a delivery address
const customerAddAddress = Joi.object({
  label:         Joi.string().valid('Home', 'Work', 'Other').default('Home'),
  full_name:     Joi.string().min(2).max(200).trim().required(),
  phone:         Joi.string().pattern(/^[6-9]\d{9}$/).required(),
  address_line1: Joi.string().min(5).max(500).trim().required(),
  address_line2: Joi.string().max(500).trim().optional().allow(''),
  landmark:      Joi.string().max(200).trim().optional().allow(''),
  area_id:       Joi.string().uuid().optional(),
  pincode,
  city:          Joi.string().min(2).max(100).trim().default('Navi Mumbai'),
  state:         Joi.string().min(2).max(100).trim().default('Maharashtra'),
  latitude:      Joi.number().min(-90).max(90).optional(),
  longitude:     Joi.number().min(-180).max(180).optional(),
  is_default:    Joi.boolean().default(false),
});

// Refresh token schema (shared)
const refreshToken = Joi.object({
  refresh_token: Joi.string().required()
    .messages({ 'any.required': 'Refresh token is required' }),
});

// ═══════════════════════════════════════════════════════════════
// MERCHANT AUTH SCHEMAS
// ═══════════════════════════════════════════════════════════════

// Step 1: Merchant requests OTP for phone verification during registration
const merchantSendOTP = Joi.object({
  phone,
  purpose: Joi.string().valid('register', 'login', 'reset').default('login'),
});

// Step 2: Merchant verifies OTP
const merchantVerifyOTP = Joi.object({
  phone,
  otp,
  purpose: Joi.string().valid('register', 'login', 'reset').default('login'),
});

// Step 3: Merchant full registration — called after OTP verified
const merchantRegister = Joi.object({
  // Proof of phone verification from /auth/merchant/verify-otp (purpose=register)
  phone_verified_token: Joi.string().required()
    .messages({ 'any.required': 'Phone verification token is required' }),

  // Owner details
  owner_name: Joi.string().min(2).max(200).trim().required()
    .messages({ 'any.required': 'Owner name is required' }),
  email: Joi.string().email().lowercase().trim().optional(),
  password,
  confirm_password: Joi.string().valid(Joi.ref('password')).required()
    .messages({ 'any.only': 'Passwords do not match', 'any.required': 'Please confirm your password' }),

  // Store details
  store_name: Joi.string().min(2).max(300).trim().required()
    .messages({ 'any.required': 'Store name is required' }),
  store_category: Joi.string()
    .valid(
      'grocery_fmcg', 'wholesale', 'electronics', 'hardware',
      'clothing', 'medical', 'food_tea_stall', 'food_chaat_chinese',
      'specialty', 'service', 'food_restaurant'
    )
    .required()
    .messages({ 'any.required': 'Store category is required' }),
  store_description: Joi.string().max(1000).trim().optional().allow(''),

  // Address
  address_line1: Joi.string().min(5).max(500).trim().required(),
  address_line2: Joi.string().max(500).trim().optional().allow(''),
  landmark:      Joi.string().max(200).trim().optional().allow(''),
  pincode,
  area_id:       Joi.string().uuid().optional(),
  latitude:      Joi.number().min(-90).max(90).optional(),
  longitude:     Joi.number().min(-180).max(180).optional(),

  // Business config
  min_order_value:   Joi.number().min(0).max(10000).default(0),
  delivery_radius_km: Joi.number().min(0.5).max(50).default(5),
  accepts_cod:       Joi.boolean().default(true),

  // Legal (optional at registration, required before going live)
  gstin: gstin.optional().allow(''),
  pan_number: pan.optional().allow(''),
  udyog_aadhaar: Joi.string().pattern(/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/).optional().allow('')
    .messages({ 'string.pattern.base': 'Udyog Aadhaar format: UDYAM-MH-27-0000001' }),
});

// Merchant login with password (after registration)
const merchantLogin = Joi.object({
  phone,
  password: Joi.string().required().messages({ 'any.required': 'Password is required' }),
});

// Merchant submits KYC documents (separate from registration)
const merchantKYCSubmit = Joi.object({
  gstin: gstin.required(),
  pan_number: pan.required(),
  udyog_aadhaar: Joi.string().optional().allow(''),
  // File URLs are handled by Cloudinary middleware before this validator runs
});

// Merchant updates operating hours
const merchantOperatingHours = Joi.object({
  hours: Joi.array().items(
    Joi.object({
      day_of_week: Joi.number().integer().min(0).max(6).required(),
      open_time:   Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).when('is_closed', {
        is: false, then: Joi.required(),
      }),
      close_time:  Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).when('is_closed', {
        is: false, then: Joi.required(),
      }),
      is_closed:   Joi.boolean().default(false),
    })
  ).length(7).required()
    .messages({ 'array.length': 'Please provide hours for all 7 days of the week' }),
});

// ═══════════════════════════════════════════════════════════════
// ADMIN AUTH SCHEMAS
// ═══════════════════════════════════════════════════════════════

// Admin login — email + password + 2FA OTP
const adminLogin = Joi.object({
  email: Joi.string().email().lowercase().trim().required()
    .messages({ 'any.required': 'Email is required', 'string.email': 'Invalid email address' }),
  password: Joi.string().required()
    .messages({ 'any.required': 'Password is required' }),
});

// Step 2: Admin submits 2FA OTP after password verification
const adminVerify2FA = Joi.object({
  temp_token: Joi.string().required()
    .messages({ 'any.required': 'Temporary token from step 1 is required' }),
  otp,
});

// Create a new admin (superadmin only)
const adminCreate = Joi.object({
  full_name: Joi.string().min(2).max(200).trim().required(),
  email:     Joi.string().email().lowercase().trim().required(),
  phone:     phone.optional(),
  password,
  confirm_password: Joi.string().valid(Joi.ref('password')).required()
    .messages({ 'any.only': 'Passwords do not match' }),
  role: Joi.string().valid('admin', 'moderator').default('admin'),
  permissions: Joi.object({
    manage_merchants:  Joi.boolean().default(false),
    manage_customers:  Joi.boolean().default(false),
    manage_orders:     Joi.boolean().default(false),
    manage_products:   Joi.boolean().default(false),
    manage_payments:   Joi.boolean().default(false),
    manage_delivery:   Joi.boolean().default(false),
    manage_marketing:  Joi.boolean().default(false),
    view_analytics:    Joi.boolean().default(false),
  }).default({}),
  allowed_ips: Joi.array().items(Joi.string().ip()).optional(),
});

// Admin changes own password
const adminChangePassword = Joi.object({
  current_password: Joi.string().required(),
  new_password: password,
  confirm_password: Joi.string().valid(Joi.ref('new_password')).required()
    .messages({ 'any.only': 'Passwords do not match' }),
});

// ═══════════════════════════════════════════════════════════════
// SHARED SCHEMAS
// ═══════════════════════════════════════════════════════════════

const pincodeLookup = Joi.object({
  pincode,
});

const changePhone = Joi.object({
  new_phone: phone,
  otp,
});

module.exports = {
  // Customer
  customerSendOTP,
  customerVerifyOTP,
  customerFirebaseLogin,
  customerCompleteProfile,
  customerUpdateProfile,
  customerAddAddress,
  // Merchant
  merchantSendOTP,
  merchantVerifyOTP,
  merchantRegister,
  merchantLogin,
  merchantKYCSubmit,
  merchantOperatingHours,
  // Admin
  adminLogin,
  adminVerify2FA,
  adminCreate,
  adminChangePassword,
  // Shared
  refreshToken,
  pincodeLookup,
  changePhone,
};
