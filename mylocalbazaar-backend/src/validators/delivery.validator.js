// src/validators/delivery.validator.js
// ─────────────────────────────────────────────────────────────
// Delivery Partner Validators — MyLocalBazaar.store
// Covers: Auth | Location updates | OTP verify | Proof upload
//         Earnings | Route assignment | Failed delivery
// ─────────────────────────────────────────────────────────────

const Joi = require('joi');

const uuid  = Joi.string().uuid({ version: 'uuidv4' });
const page  = Joi.number().integer().min(1).default(1);
const limit = Joi.number().integer().min(1).max(50).default(20);

// ── Auth ──────────────────────────────────────────────────────
const sendOTP = Joi.object({
  phone: Joi.string().pattern(/^[6-9]\d{9}$/).required()
    .messages({ 'string.pattern.base': 'Valid 10-digit Indian mobile number required' }),
});

const verifyOTP = Joi.object({
  phone: Joi.string().pattern(/^[6-9]\d{9}$/).required(),
  otp:   Joi.string().length(6).pattern(/^\d{6}$/).required()
    .messages({ 'string.length': 'OTP must be 6 digits' }),
});

const registerPartner = Joi.object({
  full_name:    Joi.string().min(2).max(200).trim().required(),
  email:        Joi.string().email().lowercase().trim().optional(),
  password:     Joi.string().min(8).required(),
  vehicle_type: Joi.string().valid('bike', 'cycle', 'van', 'scooter').required()
    .messages({ 'any.required': 'Vehicle type is required' }),
  vehicle_number: Joi.string().max(20).trim().required(),
  aadhaar_number: Joi.string().pattern(/^\d{12}$/).required()
    .messages({ 'string.pattern.base': 'Aadhaar must be 12 digits' }),
  dl_number:    Joi.string().max(30).trim().required(),
  area_id:      uuid.optional(),
  pincode:      Joi.string().pattern(/^\d{6}$/).optional(),
});

const loginPartner = Joi.object({
  phone:    Joi.string().pattern(/^[6-9]\d{9}$/).required(),
  password: Joi.string().required(),
});

// ── Location update (called frequently from mobile) ───────────
const updateLocation = Joi.object({
  latitude:  Joi.number().min(-90).max(90).required()
    .messages({ 'any.required': 'Latitude is required' }),
  longitude: Joi.number().min(-180).max(180).required()
    .messages({ 'any.required': 'Longitude is required' }),
  accuracy:  Joi.number().min(0).optional(),  // GPS accuracy in meters
  speed:     Joi.number().min(0).optional(),  // m/s from device GPS
});

// ── Toggle online/offline ─────────────────────────────────────
const toggleOnline = Joi.object({
  is_online: Joi.boolean().required(),
});

// ── Delivery OTP verification ─────────────────────────────────
const verifyDeliveryOTP = Joi.object({
  otp: Joi.string().length(4).pattern(/^\d{4}$/).required()
    .messages({
      'string.length':       'Delivery OTP must be 4 digits',
      'string.pattern.base': 'Delivery OTP must be numeric',
    }),
});

// ── Failed delivery report ────────────────────────────────────
const reportFailedDelivery = Joi.object({
  reason: Joi.string()
    .valid(
      'customer_unavailable',
      'wrong_address',
      'customer_refused',
      'access_denied',
      'other'
    )
    .required()
    .messages({ 'any.required': 'Failure reason is required' }),
  notes: Joi.string().max(500).optional().allow(''),
});

// ── Route assignment (admin assigns to delivery partner) ──────
const assignRoute = Joi.object({
  partner_id: uuid.required()
    .messages({ 'any.required': 'Delivery partner ID is required' }),
  order_id:   uuid.required()
    .messages({ 'any.required': 'Order ID is required' }),
  notes:      Joi.string().max(300).optional().allow(''),
});

// ── Earnings query ────────────────────────────────────────────
const earningsQuery = Joi.object({
  page,  limit,
  period: Joi.string().valid('today', 'week', 'month').default('week'),
  from_date: Joi.date().iso().optional(),
  to_date:   Joi.date().iso().optional(),
});

// ── List deliveries query ─────────────────────────────────────
const deliveryListQuery = Joi.object({
  page, limit,
  status: Joi.string()
    .valid('assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'returned')
    .optional(),
  from_date: Joi.date().iso().optional(),
  to_date:   Joi.date().iso().optional(),
});

// ── Admin: nearby available partners ─────────────────────────
const nearbyPartnersQuery = Joi.object({
  latitude:  Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  radius_km: Joi.number().min(0.1).max(20).default(5),
  limit:     Joi.number().integer().min(1).max(20).default(10),
});

module.exports = {
  sendOTP, verifyOTP, registerPartner, loginPartner,
  updateLocation, toggleOnline,
  verifyDeliveryOTP, reportFailedDelivery,
  assignRoute, earningsQuery, deliveryListQuery, nearbyPartnersQuery,
};
