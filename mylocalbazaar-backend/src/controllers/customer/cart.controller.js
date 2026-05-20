// src/controllers/customer/cart.controller.js
// ─────────────────────────────────────────────────────────────
// Customer Cart Controller — MyLocalBazaar.store
//
// ENDPOINTS:
//   GET    /cart              → Full cart with totals & warnings
//   POST   /cart/items        → Add item (enforces single-merchant rule)
//   PUT    /cart/items/:id    → Update quantity
//   DELETE /cart/items/:id    → Remove item
//   DELETE /cart              → Clear entire cart
//   POST   /cart/coupon       → Preview coupon discount
//   DELETE /cart/coupon       → Remove coupon from session
//   GET    /cart/delivery-charge?address_id= → Estimate delivery charge
// ─────────────────────────────────────────────────────────────

const CartService   = require('../../services/cart.service');
const CouponService = require('../../services/coupon.service');
const { MerchantDiscoveryService } = require('../../services/area.service');
const { query }     = require('../../config/db');
const { redis }     = require('../../config/redis');
const {
  success, created, badRequest, notFound,
} = require('../../utils/response');

// ── GET /cart ─────────────────────────────────────────────────
const getCart = async (req, res) => {
  const cart = await CartService.getFullCart(req.user.id);
  return success(res, { cart }, 'Cart fetched');
};

// ── POST /cart/items ──────────────────────────────────────────
const addItem = async (req, res) => {
  const result = await CartService.addItem(req.user.id, req.body);

  const message = result.cart_switched
    ? `Cart updated for ${result.store_name}. Previous cart items were cleared.`
    : 'Item added to cart';

  return created(res, {
    cart_item:    result.cart_item,
    store_name:   result.store_name,
    cart_switched: result.cart_switched,
  }, message);
};

// ── PUT /cart/items/:id ───────────────────────────────────────
const updateItem = async (req, res) => {
  await CartService.updateItem(req.user.id, req.params.id, req.body.quantity);
  const cart = await CartService.getFullCart(req.user.id);
  return success(res, { cart }, 'Cart updated');
};

// ── DELETE /cart/items/:id ────────────────────────────────────
const removeItem = async (req, res) => {
  await CartService.removeItem(req.user.id, req.params.id);
  const cart = await CartService.getFullCart(req.user.id);
  return success(res, { cart }, 'Item removed from cart');
};

// ── DELETE /cart ──────────────────────────────────────────────
const clearCart = async (req, res) => {
  await CartService.clear(req.user.id);
  return success(res, null, 'Cart cleared');
};

// ── POST /cart/coupon ─────────────────────────────────────────
// Returns discount preview — does NOT apply to DB (applied at order placement)
const previewCoupon = async (req, res) => {
  const { coupon_code } = req.body;
  const cart = await CartService.getFullCart(req.user.id);

  if (!cart.items.length) {
    return badRequest(res, 'Your cart is empty. Add items before applying a coupon.');
  }

  // Check if user is new (for first-order coupons)
  const { rows } = await query(
    'SELECT COUNT(*) AS cnt FROM orders WHERE user_id = $1', [req.user.id]
  );
  const isNewUser = parseInt(rows[0].cnt) === 0;

  const couponResult = await CouponService.validate(coupon_code, {
    userId:     req.user.id,
    merchantId: cart.merchant_id,
    subtotal:   cart.totals.subtotal,
    isNewUser,
  });

  // Store coupon preview in Redis (to persist across page refreshes)
  await redis.set(`mlb:cart_coupon:${req.user.id}`, couponResult, 900); // 15 min

  return success(res, {
    coupon:          couponResult,
    discount_amount: couponResult.discount_amount,
    free_delivery:   couponResult.free_delivery,
    new_total:       parseFloat(
      (cart.totals.total - couponResult.discount_amount).toFixed(2)
    ),
  }, `Coupon applied! You save ₹${couponResult.discount_amount.toFixed(2)}`);
};

// ── DELETE /cart/coupon ───────────────────────────────────────
const removeCoupon = async (req, res) => {
  await redis.del(`mlb:cart_coupon:${req.user.id}`);
  return success(res, null, 'Coupon removed');
};

// ── GET /cart/delivery-charge?address_id= ────────────────────
// Estimates delivery charge before order placement
const estimateDelivery = async (req, res) => {
  const { address_id } = req.query;
  if (!address_id) return badRequest(res, 'address_id is required');

  const cart = await CartService.getFullCart(req.user.id);
  if (!cart.items.length) return badRequest(res, 'Cart is empty');

  // Fetch address
  const { rows: addrRows } = await query(
    'SELECT * FROM user_addresses WHERE id = $1 AND user_id = $2',
    [address_id, req.user.id]
  );
  if (!addrRows[0]) return notFound(res, 'Address not found');

  const zoneCheck = await MerchantDiscoveryService.isAddressInDeliveryZone(
    cart.merchant_id, address_id
  );

  const distKm = parseFloat(zoneCheck.distance_km || 0);
  const base   = parseFloat(process.env.DELIVERY_BASE_CHARGE   || 20);
  const perKm  = parseFloat(process.env.DELIVERY_PER_KM_CHARGE || 5);
  const free   = parseFloat(process.env.FREE_DELIVERY_ABOVE    || 500);

  const charge = cart.totals.subtotal >= free ? 0
    : parseFloat((base + distKm * perKm).toFixed(2));

  return success(res, {
    delivers:           zoneCheck.withinZone,
    distance_km:        distKm,
    delivery_charge:    zoneCheck.withinZone ? charge : null,
    free_delivery_above: free,
    is_free_delivery:   cart.totals.subtotal >= free,
    estimated_total:    zoneCheck.withinZone
      ? parseFloat((cart.totals.total + charge).toFixed(2))
      : null,
    message: !zoneCheck.withinZone
      ? `This store doesn't deliver to your address (${distKm}km away, max ${zoneCheck.delivery_radius_km}km)`
      : charge === 0
        ? 'Free delivery!'
        : `Delivery charge: ₹${charge}`,
  }, 'Delivery estimate');
};

module.exports = {
  getCart, addItem, updateItem, removeItem,
  clearCart, previewCoupon, removeCoupon, estimateDelivery,
};
