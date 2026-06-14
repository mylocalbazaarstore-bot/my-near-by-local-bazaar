// src/components/checkout/OrderSummary.tsx
// ─────────────────────────────────────────────────────────────
// Checkout Step 3 — Coupon + Order Summary
// POST /cart/coupon (preview) | DELETE /cart/coupon
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState } from 'react';
import { Tag, X, Receipt, Loader2 } from 'lucide-react';
import { apiPost, apiDelete, getErrorMessage } from '@/lib/api';
import toast from 'react-hot-toast';
import type { Cart, DeliveryEstimate, CouponPreview } from './types';
import { computeTotals } from './types';

export default function OrderSummary({
  cart, delivery, coupon, onCouponChange, onContinue, onBack,
}: {
  cart: Cart;
  delivery: DeliveryEstimate | null;
  coupon: CouponPreview | null;
  onCouponChange: (coupon: CouponPreview | null) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const [code, setCode]       = useState('');
  const [applying, setApplying] = useState(false);
  const [removing, setRemoving] = useState(false);

  const totals = computeTotals(cart, delivery, coupon);

  const applyCoupon = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      toast.error('Enter a coupon code');
      return;
    }
    setApplying(true);
    try {
      const res = await apiPost<CouponPreview>('/cart/coupon', { coupon_code: trimmed });
      onCouponChange(res.data);
      toast.success(res.message);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setApplying(false);
    }
  };

  const removeCoupon = async () => {
    setRemoving(true);
    try {
      await apiDelete('/cart/coupon');
      onCouponChange(null);
      setCode('');
      toast.success('Coupon removed');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-surface-900 flex items-center gap-2">
        <Receipt className="w-5 h-5 text-brand-green" /> Order Summary
      </h2>

      {/* Coupon */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-brand-green" />
          <h3 className="text-sm font-bold text-surface-900">Coupon Code</h3>
        </div>

        {coupon ? (
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-brand-green/5 border border-brand-green/20">
            <div>
              <p className="text-sm font-bold text-brand-green">{coupon.coupon.code}</p>
              {coupon.coupon.description && (
                <p className="text-xs text-surface-500">{coupon.coupon.description}</p>
              )}
              <p className="text-xs text-surface-600 mt-0.5">
                You save ₹{coupon.discount_amount.toFixed(2)}
                {coupon.free_delivery ? ' + Free Delivery' : ''}
              </p>
            </div>
            <button
              onClick={removeCoupon}
              disabled={removing}
              className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 flex-shrink-0"
            >
              {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Enter coupon code"
              className="input-field flex-1"
            />
            <button
              onClick={applyCoupon}
              disabled={applying}
              className="btn-primary !px-5 disabled:opacity-50 whitespace-nowrap"
            >
              {applying ? 'Applying…' : 'Apply'}
            </button>
          </div>
        )}
      </div>

      {/* Breakdown */}
      <div className="card p-4 space-y-2.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-surface-500">Subtotal ({cart.item_count} item{cart.item_count !== 1 ? 's' : ''})</span>
          <span className="font-semibold text-surface-900">₹{totals.subtotal.toFixed(2)}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-surface-500">Delivery</span>
          {coupon?.free_delivery ? (
            <span className="font-semibold text-brand-green">FREE</span>
          ) : delivery ? (
            <span className="font-semibold text-surface-900">
              {delivery.is_free_delivery ? 'FREE' : `₹${(delivery.delivery_charge ?? 0).toFixed(2)}`}
            </span>
          ) : (
            <span className="text-surface-400">—</span>
          )}
        </div>

        {totals.discount > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-surface-500">Coupon discount</span>
            <span className="font-semibold text-brand-green">-₹{totals.discount.toFixed(2)}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-sm">
          <span className="text-surface-500">GST</span>
          <span className="font-semibold text-surface-900">₹{totals.gst.toFixed(2)}</span>
        </div>

        <div className="border-t border-surface-100 pt-2.5 flex items-center justify-between">
          <span className="font-bold text-surface-900">Total</span>
          <span className="font-black text-lg text-surface-900">₹{totals.total.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="btn-ghost flex-1">← Back</button>
        <button onClick={onContinue} className="btn-primary flex-1">
          Continue to Payment →
        </button>
      </div>
    </div>
  );
}
