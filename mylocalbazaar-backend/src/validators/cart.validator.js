// src/validators/cart.validator.js
// ─────────────────────────────────────────────────────────────
// Cart & Order Validators — MyLocalBazaar.store
// Covers: Cart operations | Order placement | Merchant actions |
//         Coupon application | Payment webhooks
// ─────────────────────────────────────────────────────────────

const Joi = require('joi');

const uuid  = Joi.string().uuid({ version: 'uuidv4' });
const price = Joi.number().min(0).precision(2);

// ═══════════════════════════════════════════════════════════════
// CART SCHEMAS
// ═══════════════════════════════════════════════════════════════

// Add item to cart
const addToCart = Joi.object({
  product_id: uuid.required()
    .messages({ 'any.required': 'Product ID is required' }),
  variant_id: uuid.optional().allow(null),
  quantity:   Joi.number().integer().min(1).max(100).required()
    .messages({
      'any.required':  'Quantity is required',
      'number.max':    'Maximum 100 units per item',
    }),
});

// Update item quantity
const updateCartItem = Joi.object({
  quantity: Joi.number().integer().min(1).max(100).required()
    .messages({ 'any.required': 'Quantity is required' }),
});

// Apply/remove coupon
const applyCoupon = Joi.object({
  coupon_code: Joi.string().min(3).max(50).trim().uppercase().required()
    .messages({ 'any.required': 'Coupon code is required' }),
});

// ═══════════════════════════════════════════════════════════════
// ORDER SCHEMAS
// ═══════════════════════════════════════════════════════════════

// Customer places order
const placeOrder = Joi.object({
  address_id:    uuid.required()
    .messages({ 'any.required': 'Delivery address is required' }),
  payment_method: Joi.string()
    .valid('razorpay', 'upi', 'wallet', 'cod', 'upi_direct')
    .required()
    .messages({ 'any.required': 'Payment method is required' }),
  coupon_code: Joi.string().max(50).trim().uppercase().optional().allow('', null),
  notes:       Joi.string().max(500).trim().optional().allow('', null),
  // For wallet partial payment top-up
  use_wallet:  Joi.boolean().default(false),
  // UPI Direct fields — at least one required when payment_method === 'upi_direct'
  payment_utr:              Joi.string().max(50).trim().optional().allow('', null),
  payment_screenshot_url:   Joi.string().uri().max(500).optional().allow('', null),
}).custom((value, helpers) => {
  if (value.payment_method === 'upi_direct') {
    const hasUtr        = !!(value.payment_utr        && value.payment_utr.trim());
    const hasScreenshot = !!(value.payment_screenshot_url && value.payment_screenshot_url.trim());
    if (!hasUtr && !hasScreenshot) {
      return helpers.message('Please provide a UTR number or payment screenshot for UPI Direct payment');
    }
  }
  return value;
});

// Verify Razorpay payment after frontend checkout
const verifyPayment = Joi.object({
  order_id:            uuid.required(),
  razorpay_order_id:   Joi.string().required(),
  razorpay_payment_id: Joi.string().required(),
  razorpay_signature:  Joi.string().required(),
});

// Merchant approves or rejects an order (Double-Approval Step)
const merchantOrderAction = Joi.object({
  action: Joi.string().valid('approve', 'reject').required()
    .messages({ 'any.required': 'Action must be approve or reject' }),
  rejection_reason: Joi.when('action', {
    is:   'reject',
    then: Joi.string().min(5).max(500).required()
      .messages({ 'any.required': 'Rejection reason is required when rejecting an order' }),
    otherwise: Joi.string().optional().allow('', null),
  }),
  estimated_delivery_minutes: Joi.when('action', {
    is:        'approve',
    then:      Joi.number().integer().min(10).max(1440).optional(),
    otherwise: Joi.optional(),
  }),
});

// Merchant updates order status (packed → out_for_delivery)
const merchantUpdateStatus = Joi.object({
  status: Joi.string()
    .valid('accepted', 'packed', 'out_for_delivery', 'delivered')
    .required()
    .messages({ 'any.required': 'Status is required' }),
  note: Joi.string().max(500).optional().allow('', null),
});

// Admin overrides a merchant decision
const adminOrderOverride = Joi.object({
  target_status: Joi.string()
    .valid('accepted', 'cancelled', 'refund_initiated')
    .required(),
  note: Joi.string().min(5).max(1000).required()
    .messages({ 'any.required': 'Admin override note is required' }),
});

// Customer raises return request
const returnRequest = Joi.object({
  reason: Joi.string().min(10).max(1000).trim().required()
    .messages({ 'any.required': 'Return reason is required' }),
  return_items: Joi.array().items(
    Joi.object({
      order_item_id: uuid.required(),
      quantity:      Joi.number().integer().min(1).required(),
      reason:        Joi.string().max(300).optional(),
    })
  ).min(1).required()
    .messages({ 'array.min': 'At least one item must be selected for return' }),
});

// Delivery partner verifies OTP
const deliveryOTPVerify = Joi.object({
  otp: Joi.string().length(4).pattern(/^\d{4}$/).required()
    .messages({ 'string.pattern.base': 'Delivery OTP must be 4 digits' }),
});

// Order list filters
const orderListQuery = Joi.object({
  page:   Joi.number().integer().min(1).default(1),
  limit:  Joi.number().integer().min(1).max(50).default(10),
  status: Joi.string().valid(
    'payment_pending','payment_processed','merchant_approved','merchant_rejected',
    'admin_overridden','accepted','packed','out_for_delivery','delivered',
    'cancelled','return_requested','return_approved','return_rejected',
    'refund_initiated','refund_completed'
  ).optional(),
  from_date: Joi.date().optional(),
  to_date:   Joi.date().min(Joi.ref('from_date')).optional(),
  sort_by:   Joi.string().valid('created_at','total_amount').default('created_at'),
  sort_order:Joi.string().valid('asc','desc').default('desc'),
});

module.exports = {
  addToCart, updateCartItem, applyCoupon,
  placeOrder, verifyPayment,
  merchantOrderAction, merchantUpdateStatus,
  adminOrderOverride, returnRequest,
  deliveryOTPVerify, orderListQuery,
};
