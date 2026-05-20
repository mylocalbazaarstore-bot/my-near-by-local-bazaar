// src/validators/admin.validator.js
// Admin Panel Validators — MyLocalBazaar.store

const Joi = require('joi');
const uuid    = Joi.string().uuid({ version: 'uuidv4' });
const page    = Joi.number().integer().min(1).default(1);
const limit   = Joi.number().integer().min(1).max(100).default(20);
const dateStr = Joi.date().iso();

// Merchant Management
const merchantListQuery = Joi.object({
  page, limit,
  status:     Joi.string().valid('pending','active','suspended','disabled','rejected').optional(),
  kyc_status: Joi.string().valid('pending','submitted','verified','rejected').optional(),
  category:   Joi.string().optional(),
  search:     Joi.string().max(200).trim().optional(),
  pincode:    Joi.string().pattern(/^\d{6}$/).optional(),
  sort_by:    Joi.string().valid('created_at','store_name','rating').default('created_at'),
  sort_order: Joi.string().valid('asc','desc').default('desc'),
});

const merchantApprove = Joi.object({
  note: Joi.string().max(500).optional().allow(''),
});

const merchantReject = Joi.object({
  reason: Joi.string().min(10).max(500).required()
    .messages({ 'any.required': 'Rejection reason is required' }),
});

const merchantStatusUpdate = Joi.object({
  status: Joi.string().valid('active','suspended','disabled').required(),
  reason: Joi.string().max(500).optional().allow(''),
});

const kycDecision = Joi.object({
  decision: Joi.string().valid('verify','reject').required(),
  rejection_reason: Joi.when('decision', {
    is: 'reject',
    then: Joi.string().min(10).max(500).required(),
    otherwise: Joi.optional().allow(''),
  }),
  note: Joi.string().max(500).optional().allow(''),
});

// Product Management
const productListQuery = Joi.object({
  page, limit,
  status:      Joi.string().valid('pending_approval','active','rejected','archived','out_of_stock').optional(),
  category_id: uuid.optional(),
  merchant_id: uuid.optional(),
  search:      Joi.string().max(200).trim().optional(),
  is_featured: Joi.boolean().optional(),
  sort_by:     Joi.string().valid('created_at','name','retail_price').default('created_at'),
  sort_order:  Joi.string().valid('asc','desc').default('desc'),
});

const productApprove  = Joi.object({ note: Joi.string().max(500).optional().allow('') });
const productReject   = Joi.object({ reason: Joi.string().min(10).max(500).required() });
const productFeatureToggle = Joi.object({
  is_featured:  Joi.boolean().required(),
  is_sponsored: Joi.boolean().optional(),
});

// Customer Management
const customerListQuery = Joi.object({
  page, limit,
  search:     Joi.string().max(200).trim().optional(),
  is_blocked: Joi.boolean().optional(),
  sort_by:    Joi.string().valid('created_at','full_name','wallet_balance').default('created_at'),
  sort_order: Joi.string().valid('asc','desc').default('desc'),
  from_date:  dateStr.optional(),
  to_date:    dateStr.optional(),
});
const customerBlock = Joi.object({
  reason: Joi.string().min(5).max(500).required(),
});

// Order Governance
const adminOrderListQuery = Joi.object({
  page, limit,
  status:         Joi.string().optional(),
  merchant_id:    uuid.optional(),
  user_id:        uuid.optional(),
  payment_method: Joi.string().valid('razorpay','upi','wallet','cod').optional(),
  from_date:      dateStr.optional(),
  to_date:        dateStr.optional(),
  sort_by:        Joi.string().valid('created_at','total_amount').default('created_at'),
  sort_order:     Joi.string().valid('asc','desc').default('desc'),
  search:         Joi.string().max(100).optional(),
});
const adminOrderOverride = Joi.object({
  target_status: Joi.string().valid('accepted','cancelled','refund_initiated','merchant_approved').required(),
  note: Joi.string().min(5).max(1000).required(),
});
const adminRefundInitiate = Joi.object({
  amount: Joi.number().min(0.01).required(),
  reason: Joi.string().min(5).max(500).required(),
});

// Complaint Management
const complaintListQuery = Joi.object({
  page, limit,
  status:     Joi.string().valid('open','in_progress','resolved','closed').optional(),
  priority:   Joi.string().valid('low','normal','high','urgent').optional(),
  sort_by:    Joi.string().valid('created_at','priority').default('created_at'),
  sort_order: Joi.string().valid('asc','desc').default('desc'),
});
const complaintAssign  = Joi.object({ admin_id: uuid.required(), priority: Joi.string().valid('low','normal','high','urgent').optional() });
const complaintResolve = Joi.object({ resolution: Joi.string().min(10).max(2000).required(), status: Joi.string().valid('resolved','closed').default('resolved') });

// Marketing
const createCoupon = Joi.object({
  code:               Joi.string().min(3).max(50).uppercase().required(),
  description:        Joi.string().max(300).optional().allow(''),
  coupon_type:        Joi.string().valid('percentage','flat','free_delivery').required(),
  discount_value:     Joi.number().min(0.01).required(),
  max_discount_amount: Joi.number().min(0).optional(),
  min_order_value:    Joi.number().min(0).default(0),
  merchant_id:        uuid.optional().allow(null),
  category_id:        uuid.optional().allow(null),
  applicable_for:     Joi.string().valid('all','new_user','referral').default('all'),
  max_uses:           Joi.number().integer().min(1).optional().allow(null),
  uses_per_user:      Joi.number().integer().min(1).default(1),
  valid_from:         Joi.date().required(),
  valid_until:        Joi.date().min(Joi.ref('valid_from')).required(),
});

const createBanner = Joi.object({
  title:            Joi.string().max(200).optional().allow(''),
  subtitle:         Joi.string().max(300).optional().allow(''),
  image_url:        Joi.string().uri().required(),
  mobile_image_url: Joi.string().uri().optional().allow(''),
  link_url:         Joi.string().max(500).optional().allow(''),
  link_type:        Joi.string().valid('category','merchant','product','external').optional(),
  link_target_id:   uuid.optional().allow(null),
  position:         Joi.string().valid('hero','mid','sidebar','popup').default('hero'),
  area_id:          uuid.optional().allow(null),
  sort_order:       Joi.number().integer().min(0).default(0),
  valid_from:       Joi.date().optional().allow(null),
  valid_until:      Joi.date().optional().allow(null),
});

// Analytics
const analyticsQuery = Joi.object({
  period:    Joi.string().valid('today','week','month','quarter','year').default('month'),
  from_date: dateStr.optional(),
  to_date:   dateStr.optional(),
  city_id:   uuid.optional(),
  area_id:   uuid.optional(),
});

// Settlements
const settlementListQuery = Joi.object({ page, limit, merchant_id: uuid.optional(), status: Joi.string().valid('pending','processed','failed').optional(), from_date: dateStr.optional(), to_date: dateStr.optional() });
const processSettlement   = Joi.object({ merchant_id: uuid.required(), settlement_period: Joi.string().max(20).required(), net_payable: Joi.number().min(0.01).required(), note: Joi.string().max(500).optional() });

module.exports = {
  merchantListQuery, merchantApprove, merchantReject, merchantStatusUpdate, kycDecision,
  productListQuery, productApprove, productReject, productFeatureToggle,
  customerListQuery, customerBlock,
  adminOrderListQuery, adminOrderOverride, adminRefundInitiate,
  complaintListQuery, complaintAssign, complaintResolve,
  createCoupon, createBanner, analyticsQuery,
  settlementListQuery, processSettlement,
};
