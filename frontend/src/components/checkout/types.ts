// src/components/checkout/types.ts
// ─────────────────────────────────────────────────────────────
// Shared types for the Checkout flow — mirrors backend response
// shapes from CartService.getFullCart, CouponService.validate
// and cart.controller.estimateDelivery
// ─────────────────────────────────────────────────────────────

export interface CartWarning {
  type: 'product_unavailable' | 'insufficient_stock' | 'moq_not_met' | 'below_minimum_order';
  message: string;
  product_id?: string;
  available?: number;
  moq?: number;
  min_order_value?: number;
  current_subtotal?: number;
}

export interface CartItem {
  cart_item_id: string;
  product_id: string;
  name: string;
  slug: string;
  unit?: string | null;
  image?: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  gst_amount: number;
  gst_percentage: string | number;
  mrp: string | number;
  retail_price: string | number;
  stock_quantity: number;
  moq: number;
  is_returnable: boolean;
  product_status: string;
  variant_id?: string | null;
  variant_name?: string | null;
  variant_type?: string | null;
  variant_price?: string | number | null;
  variant_stock?: number | null;
  merchant_id: string;
  store_name: string;
  store_slug: string;
  min_order_value: string | number;
  delivery_radius_km: number;
  is_open: boolean;
  merchant_status: string;
  accepts_cod: boolean;
}

export interface CartTotals {
  subtotal: number;
  gst: number;
  delivery_charge: number;
  total: number;
}

export interface CartValidation {
  is_valid: boolean;
  below_min_order: boolean;
  min_order_value: number;
  warnings: CartWarning[];
}

export interface CartMerchant {
  id: string;
  store_name: string;
  store_slug: string;
  is_open: boolean;
  merchant_status: string;
  accepts_cod: boolean;
  upi_id?: string | null;
}

export interface Cart {
  cart_id: string;
  merchant_id: string | null;
  items: CartItem[];
  item_count: number;
  totals: CartTotals;
  validation: CartValidation;
  merchant: CartMerchant | null;
}

export interface Address {
  id: string;
  label: string;
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2?: string | null;
  landmark?: string | null;
  pincode: string;
  city: string;
  state: string;
  area_name?: string | null;
  is_default: boolean;
}

export interface DeliveryEstimate {
  delivers: boolean;
  distance_km: number;
  delivery_charge: number | null;
  free_delivery_above: number;
  is_free_delivery: boolean;
  estimated_total: number | null;
  message: string;
}

export interface CouponPreview {
  coupon: {
    coupon_id: string;
    code: string;
    description: string | null;
    coupon_type: 'percentage' | 'flat' | 'free_delivery';
    discount_value: number;
    discount_amount: number;
    free_delivery: boolean;
    max_discount: string | number | null;
    valid: boolean;
  };
  discount_amount: number;
  free_delivery: boolean;
  new_total: number;
}

export interface OrderTotals {
  subtotal:       number;
  gst:            number;
  deliveryCharge: number;
  discount:       number;
  total:          number;
}

export type CheckoutStep = 'cart' | 'address' | 'summary' | 'payment';

export const STEP_ORDER: CheckoutStep[] = ['cart', 'address', 'summary', 'payment'];

export const STEP_LABELS: Record<CheckoutStep, string> = {
  cart:    'Cart',
  address: 'Address',
  summary: 'Summary',
  payment: 'Payment',
};

// ── Final payable total — mirrors OrderService.place calc:
//    total = subtotal - discount + delivery + gst
//    (delivery is waived when the coupon grants free delivery)
export function computeTotals(
  cart: Cart,
  delivery: DeliveryEstimate | null,
  coupon: CouponPreview | null
): OrderTotals {
  const subtotal       = cart.totals.subtotal;
  const gst            = cart.totals.gst;
  const discount       = coupon?.discount_amount ?? 0;
  const deliveryCharge = coupon?.free_delivery ? 0 : (delivery?.delivery_charge ?? 0);
  const total = parseFloat(Math.max(0, subtotal - discount + deliveryCharge + gst).toFixed(2));

  return { subtotal, gst, deliveryCharge, discount, total };
}
