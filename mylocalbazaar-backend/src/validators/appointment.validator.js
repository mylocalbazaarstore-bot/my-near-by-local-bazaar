// src/validators/appointment.validator.js
// Appointment booking validators for service marketplace flow.

const Joi = require('joi');

const uuid = Joi.string().uuid({ version: 'uuidv4' });
const page = Joi.number().integer().min(1).default(1);
const limit = Joi.number().integer().min(1).max(100).default(20);
const money = Joi.number().min(0).precision(2);
const phone = Joi.string().trim().pattern(/^[6-9]\d{9}$/).messages({
  'string.pattern.base': 'Mobile number must be a valid 10 digit Indian number',
});

const serviceCategory = Joi.string().valid(
  'doctor',
  'doctor-booking',
  'mens_salon',
  'mens-salon',
  'womens_salon',
  'womens-salon',
  'home_services',
  'home-services'
);

const APP_TIMEZONE_OFFSET_MINUTES = parseInt(process.env.APP_TIMEZONE_OFFSET_MINUTES || '330', 10);
const APP_TIMEZONE_OFFSET = Number.isFinite(APP_TIMEZONE_OFFSET_MINUTES)
  ? APP_TIMEZONE_OFFSET_MINUTES
  : 330;
const todayIso = () => {
  const shifted = new Date(Date.now() + APP_TIMEZONE_OFFSET * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
};

const futureOrTodayDate = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((value, helpers) => {
  if (value < todayIso()) return helpers.error('date.min');
  return value;
}).messages({
  'string.pattern.base': 'Date must be in YYYY-MM-DD format',
  'date.min': 'Date cannot be in the past',
});

const idParam = Joi.object({
  id: uuid.required(),
});

const customerParam = Joi.object({
  customerId: uuid.required(),
});

const listServices = Joi.object({
  category: serviceCategory.optional(),
  merchant_id: uuid.optional(),
  provider_id: uuid.optional(),
  search: Joi.string().max(120).trim().optional(),
  is_home_visit: Joi.boolean().optional(),
  page,
  limit,
});

const listProviders = Joi.object({
  category: serviceCategory.optional(),
  merchant_id: uuid.optional(),
  include_inactive: Joi.boolean().default(false),
  page,
  limit,
});

const listSlots = Joi.object({
  providerId: uuid.required(),
  serviceId: uuid.optional(),
  date: futureOrTodayDate.required(),
});

const createBooking = Joi.object({
  service_id: uuid.required(),
  provider_id: uuid.optional(),
  slot_id: uuid.required(),
  customer_name: Joi.string().min(2).max(200).trim().required(),
  customer_mobile: phone.required(),
  customer_email: Joi.string().email().max(200).trim().optional().allow('', null),
  address_id: uuid.optional().allow(null),
  address_text: Joi.string().max(1000).trim().optional().allow('', null),
  location_lat: Joi.number().min(-90).max(90).optional().allow(null),
  location_lng: Joi.number().min(-180).max(180).optional().allow(null),
  notes: Joi.string().max(1500).trim().optional().allow('', null),
  is_emergency: Joi.boolean().default(false),
  payment_method: Joi.string().valid('none', 'pay_at_shop', 'online', 'cash', 'upi', 'card').default('pay_at_shop'),
  payment_reference_id: Joi.string().max(150).trim().optional().allow('', null),
}).options({ stripUnknown: true });

const bookingList = Joi.object({
  status: Joi.string().valid('pending', 'confirmed', 'cancelled', 'completed', 'no_show', 'rejected').optional(),
  scope: Joi.string().valid('today', 'upcoming', 'past').optional(),
  page,
  limit,
});

const updateBookingStatus = Joi.object({
  status: Joi.string().valid('pending', 'confirmed', 'cancelled', 'completed', 'no_show', 'rejected').required(),
  reason: Joi.string().max(500).trim().optional().allow('', null),
}).options({ stripUnknown: true });

const createSlot = Joi.object({
  provider_id: uuid.required(),
  service_id: uuid.optional().allow(null),
  slot_date: futureOrTodayDate.required(),
  start_time: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).required(),
  end_time: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).required(),
  is_blocked: Joi.boolean().default(false),
}).options({ stripUnknown: true });

const updateSlot = Joi.object({
  service_id: uuid.optional().allow(null),
  slot_date: futureOrTodayDate.optional(),
  start_time: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional(),
  end_time: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional(),
  is_blocked: Joi.boolean().optional(),
}).min(1).options({ stripUnknown: true });

const createService = Joi.object({
  provider_id: uuid.optional().allow(null),
  category_id: uuid.required(),
  name: Joi.string().min(2).max(300).trim().required(),
  description: Joi.string().max(3000).trim().optional().allow('', null),
  duration_minutes: Joi.number().integer().min(5).max(480).default(30),
  price: money.required(),
  discount_price: money.optional().allow(null),
  image_url: Joi.string().uri().max(1000).optional().allow('', null),
  is_home_visit: Joi.boolean().default(false),
  is_active: Joi.boolean().default(true),
}).options({ stripUnknown: true });

const updateService = createService.fork(
  ['category_id', 'name', 'price'],
  (schema) => schema.optional()
).min(1);

const createProvider = Joi.object({
  service_category: serviceCategory.required(),
  staff_name: Joi.string().max(200).trim().optional().allow('', null),
  specialization: Joi.string().max(300).trim().optional().allow('', null),
  experience_years: Joi.number().integer().min(0).max(80).optional().allow(null),
  qualification: Joi.string().max(1500).trim().optional().allow('', null),
  profile_image_url: Joi.string().uri().max(1000).optional().allow('', null),
  is_available: Joi.boolean().default(true),
}).options({ stripUnknown: true });

const updateProvider = createProvider.fork(
  ['service_category'],
  (schema) => schema.optional()
).min(1);

module.exports = {
  idParam,
  customerParam,
  listServices,
  listProviders,
  listSlots,
  createBooking,
  bookingList,
  updateBookingStatus,
  createSlot,
  updateSlot,
  createService,
  updateService,
  createProvider,
  updateProvider,
};
