// src/validators/product.validator.js
// ─────────────────────────────────────────────────────────────
// Product & Merchant Onboarding Validators — MyLocalBazaar.store
// Covers: product CRUD | bulk upload | variant management |
//         category/area query params | dashboard filters
// ─────────────────────────────────────────────────────────────

const Joi = require('joi');

// ── Reusable shared fields ─────────────────────────────────────
const uuid    = Joi.string().uuid({ version: 'uuidv4' });
const page    = Joi.number().integer().min(1).default(1);
const limit   = Joi.number().integer().min(1).max(100).default(20);
const pincode = Joi.string().pattern(/^\d{6}$/).messages({
  'string.pattern.base': 'Pincode must be 6 digits',
});
const price   = Joi.number().min(0).precision(2);

// ── Allowed values from DB schema ─────────────────────────────
const PRODUCT_STATUSES = ['draft', 'pending_approval', 'active', 'rejected', 'out_of_stock', 'archived'];
const STORE_CATEGORIES = [
  'grocery_fmcg','wholesale','electronics','hardware','clothing',
  'medical','food_tea_stall','food_chaat_chinese','specialty','service','food_restaurant','furniture',
];

// ═══════════════════════════════════════════════════════════════
// PRODUCT VARIANT sub-schema (used inside product create/update)
// ═══════════════════════════════════════════════════════════════
const variantSchema = Joi.object({
  variant_name:    Joi.string().max(100).trim().required()
    .messages({ 'any.required': 'Variant name is required (e.g. "500g" or "Red")' }),
  variant_type:    Joi.string().valid('weight','color','size','pack','other').required(),
  mrp:             price.required(),
  retail_price:    price.required(),
  wholesale_price: price.optional(),
  stock_quantity:  Joi.number().integer().min(0).default(0),
  sku:             Joi.string().max(100).trim().optional().allow(''),
  is_active:       Joi.boolean().default(true),
});

// ═══════════════════════════════════════════════════════════════
// CREATE PRODUCT
// ═══════════════════════════════════════════════════════════════
const createProduct = Joi.object({
  // Core identity
  name:              Joi.string().min(2).max(300).trim().required()
    .messages({ 'any.required': 'Product name is required' }),
  description:       Joi.string().max(5000).trim().optional().allow(''),
  short_description: Joi.string().max(500).trim().optional().allow(''),
  sku:               Joi.string().max(100).trim().optional().allow(''),
  barcode:           Joi.string().max(100).trim().optional().allow(''),
  brand:             Joi.string().max(100).trim().optional().allow(''),
  unit:              Joi.string().max(50).trim().optional().default('piece'),

  // Classification
  category_id:    uuid.required()
    .messages({ 'any.required': 'Category is required' }),
  subcategory_id: uuid.optional(),

  // Pricing (required unless product has variants only)
  mrp:             price.required(),
  retail_price:    price.required(),
  wholesale_price: price.optional(),
  moq:             Joi.number().integer().min(1).default(1),

  // Stock
  stock_quantity:      Joi.number().integer().min(0).default(0),
  low_stock_threshold: Joi.number().integer().min(0).default(5),
  track_inventory:     Joi.boolean().default(true),

  // Tax
  gst_percentage: Joi.number().min(0).max(28).precision(2).default(0),
  hsn_code:       Joi.string().max(20).trim().optional().allow(''),

  // Shipping
  weight_grams:   Joi.number().integer().min(0).optional(),

  // Meta
  tags:           Joi.array().items(Joi.string().max(50).trim()).max(20).default([]),
  is_returnable:  Joi.boolean().default(true),
  return_window_days: Joi.number().integer().min(1).max(30).default(7),

  // Variants (optional — simple products have no variants)
  variants: Joi.array().items(variantSchema).max(20).default([]),
}).options({ stripUnknown: true });

// ═══════════════════════════════════════════════════════════════
// UPDATE PRODUCT (all fields optional — partial update)
// ═══════════════════════════════════════════════════════════════
const updateProduct = Joi.object({
  name:              Joi.string().min(2).max(300).trim(),
  description:       Joi.string().max(5000).trim().allow(''),
  short_description: Joi.string().max(500).trim().allow(''),
  sku:               Joi.string().max(100).trim().allow(''),
  barcode:           Joi.string().max(100).trim().allow(''),
  brand:             Joi.string().max(100).trim().allow(''),
  unit:              Joi.string().max(50).trim(),
  category_id:       uuid,
  subcategory_id:    uuid.optional(),
  mrp:               price,
  retail_price:      price,
  wholesale_price:   price.optional(),
  moq:               Joi.number().integer().min(1),
  stock_quantity:    Joi.number().integer().min(0),
  low_stock_threshold: Joi.number().integer().min(0),
  track_inventory:   Joi.boolean(),
  gst_percentage:    Joi.number().min(0).max(28).precision(2),
  hsn_code:          Joi.string().max(20).trim().allow(''),
  weight_grams:      Joi.number().integer().min(0),
  tags:              Joi.array().items(Joi.string().max(50).trim()).max(20),
  is_returnable:     Joi.boolean(),
  return_window_days: Joi.number().integer().min(1).max(30),
}).min(1).messages({ 'object.min': 'At least one field is required for update' });

// ═══════════════════════════════════════════════════════════════
// PRODUCT LIST / SEARCH (query params)
// ═══════════════════════════════════════════════════════════════
const listProducts = Joi.object({
  page,
  limit,
  status:         Joi.string().valid(...PRODUCT_STATUSES).optional(),
  category_id:    uuid.optional(),
  subcategory_id: uuid.optional(),
  search:         Joi.string().max(200).trim().optional(),
  is_featured:    Joi.boolean().optional(),
  min_price:      price.optional(),
  max_price:      price.optional(),
  in_stock:       Joi.boolean().optional(),
  sort_by:        Joi.string().valid('name','retail_price','created_at','stock_quantity','rating').default('created_at'),
  sort_order:     Joi.string().valid('asc','desc').default('desc'),
});

// ═══════════════════════════════════════════════════════════════
// BULK UPLOAD (array of product objects via JSON body)
// Max 50 products per batch to stay within memory limits
// ═══════════════════════════════════════════════════════════════
const bulkUploadProducts = Joi.object({
  products: Joi.array()
    .items(createProduct)
    .min(1).max(50)
    .required()
    .messages({
      'array.min': 'At least 1 product is required',
      'array.max': 'Maximum 50 products per bulk upload batch',
      'any.required': 'products array is required',
    }),
});

// ═══════════════════════════════════════════════════════════════
// STOCK UPDATE (quick inventory adjustment)
// ═══════════════════════════════════════════════════════════════
const updateStock = Joi.object({
  stock_quantity:      Joi.number().integer().min(0).required(),
  low_stock_threshold: Joi.number().integer().min(0).optional(),
});

// ═══════════════════════════════════════════════════════════════
// UPDATE PRODUCT VARIANT
// ═══════════════════════════════════════════════════════════════
const updateVariant = variantSchema.fork(
  ['variant_name','variant_type','mrp','retail_price'],
  (s) => s.optional()
).min(1);

// ═══════════════════════════════════════════════════════════════
// AREA / PINCODE DISCOVERY (query params)
// ═══════════════════════════════════════════════════════════════
const areaSearch = Joi.object({
  pincode:    pincode.optional(),
  city_id:    uuid.optional(),
  search:     Joi.string().max(100).trim().optional(),
  latitude:   Joi.number().min(-90).max(90).optional(),
  longitude:  Joi.number().min(-180).max(180).optional(),
  radius_km:  Joi.number().min(0.1).max(100).default(5),
  page,
  limit,
}).or('pincode','search','latitude','city_id')
  .messages({ 'object.missing': 'Provide at least one of: pincode, search, latitude, or city_id' });

// Merchants available in an area (PostGIS radius check)
const merchantsByArea = Joi.object({
  pincode:       pincode.optional(),
  area_id:       uuid.optional(),
  lat:           Joi.number().min(-90).max(90).optional(),
  lng:           Joi.number().min(-180).max(180).optional(),
  radius_km:     Joi.number().min(0.1).max(50).default(5),
  store_category: Joi.string().valid(...STORE_CATEGORIES).optional(),
  is_open:       Joi.boolean().optional(),
  sort_by:       Joi.string().valid('distance','rating','name').default('distance'),
  page,
  limit,
});

// ═══════════════════════════════════════════════════════════════
// MERCHANT STOREFRONT PRODUCT LIST (query params) — public
// ═══════════════════════════════════════════════════════════════
const merchantProducts = Joi.object({
  page,
  limit,
  category_id:    uuid.optional(),
  subcategory_id: uuid.optional(),
  search:         Joi.string().max(200).trim().optional(),
  min_price:      price.optional(),
  max_price:      price.optional(),
  in_stock:       Joi.boolean().optional(),
  sort_by:        Joi.string().valid('created_at','retail_price','name','rating').default('created_at'),
  sort_order:     Joi.string().valid('asc','desc').default('desc'),
});

// ═══════════════════════════════════════════════════════════════
// CATEGORY QUERY PARAMS
// ═══════════════════════════════════════════════════════════════
const categoryList = Joi.object({
  store_category: Joi.string().valid(...STORE_CATEGORIES).optional(),
  with_subcats:   Joi.boolean().default(false),
  is_active:      Joi.boolean().default(true),
});

// ═══════════════════════════════════════════════════════════════
// MERCHANT DASHBOARD FILTERS
// ═══════════════════════════════════════════════════════════════
const dashboardOverview = Joi.object({
  period: Joi.string().valid('today','week','month','quarter','year').default('month'),
});

const recentOrders = Joi.object({
  page,
  limit: Joi.number().integer().min(1).max(50).default(10),
  status: Joi.string().valid(
    'payment_pending','payment_processed','merchant_approved','merchant_rejected',
    'accepted','packed','out_for_delivery','delivered','cancelled',
    'return_requested','refund_initiated','refund_completed'
  ).optional(),
});

// ═══════════════════════════════════════════════════════════════
// PRODUCT IMAGE REORDER
// ═══════════════════════════════════════════════════════════════
const reorderImages = Joi.object({
  image_orders: Joi.array().items(
    Joi.object({
      image_id:   uuid.required(),
      sort_order: Joi.number().integer().min(0).required(),
    })
  ).min(1).required(),
});

module.exports = {
  createProduct,
  updateProduct,
  listProducts,
  bulkUploadProducts,
  updateStock,
  updateVariant,
  areaSearch,
  merchantsByArea,
  merchantProducts,
  categoryList,
  dashboardOverview,
  recentOrders,
  reorderImages,
};
