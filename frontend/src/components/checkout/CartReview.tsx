// src/components/checkout/CartReview.tsx
// ─────────────────────────────────────────────────────────────
// Checkout Step 1 — Cart Review
// PUT /cart/items/:id (debounced 300ms) | DELETE /cart/items/:id
// Shows MOQ / stock / min-order warnings from cart.validation
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Minus, Plus, Trash2, AlertTriangle, Store, ShoppingBag } from 'lucide-react';
import api, { apiDelete, getErrorMessage } from '@/lib/api';
import toast from 'react-hot-toast';
import type { Cart, CartItem } from './types';

// ── Yellow warning banner ───────────────────────────────────────
function WarningBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-yellow-200 bg-yellow-50 text-yellow-800 text-sm">
      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

// ── Single cart line item ───────────────────────────────────────
function CartItemRow({
  item, onCartChange,
}: {
  item: CartItem;
  onCartChange: (cart: Cart) => void;
}) {
  const [qty, setQty]   = useState(item.quantity);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setQty(item.quantity), [item.quantity]);

  const commit = (newQty: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await api.put<{ success: boolean; data: { cart: Cart }; message: string }>(
          `/cart/items/${item.cart_item_id}`,
          { quantity: newQty }
        );
        onCartChange(res.data.data.cart);
      } catch (err) {
        toast.error(getErrorMessage(err));
        setQty(item.quantity); // revert on failure
      } finally {
        setBusy(false);
      }
    }, 300);
  };

  const changeQty = (delta: number) => {
    const next = Math.max(item.moq, qty + delta);
    if (next === qty) return;
    setQty(next);
    commit(next);
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await apiDelete<{ cart: Cart }>(`/cart/items/${item.cart_item_id}`);
      onCartChange(res.data.cart);
      toast.success('Item removed');
    } catch (err) {
      toast.error(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 p-3 rounded-2xl border border-surface-100 bg-white"
    >
      <div className="w-16 h-16 rounded-xl bg-surface-50 flex-shrink-0 overflow-hidden flex items-center justify-center">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <ShoppingBag className="w-6 h-6 text-surface-300" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-surface-900 truncate">{item.name}</p>
        {item.variant_name && (
          <p className="text-xs text-surface-400">{item.variant_name}</p>
        )}
        <p className="text-xs text-surface-500 mt-0.5">
          ₹{Number(item.unit_price).toFixed(2)}{item.unit ? ` / ${item.unit}` : ''}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => changeQty(-1)}
          disabled={busy || qty <= item.moq}
          className="w-7 h-7 rounded-lg border border-surface-200 flex items-center justify-center
                     text-surface-600 disabled:opacity-30 hover:border-surface-300 transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="w-6 text-center text-sm font-bold text-surface-900">{qty}</span>
        <button
          onClick={() => changeQty(1)}
          disabled={busy}
          className="w-7 h-7 rounded-lg border border-surface-200 flex items-center justify-center
                     text-surface-600 disabled:opacity-30 hover:border-surface-300 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="text-right w-20 flex-shrink-0">
        <p className="text-sm font-black text-surface-900">₹{Number(item.line_total).toFixed(2)}</p>
      </div>

      <button
        onClick={remove}
        disabled={busy}
        className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 flex-shrink-0"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

// ── Main panel ────────────────────────────────────────────────
export default function CartReview({
  cart, onCartChange, onContinue,
}: {
  cart: Cart;
  onCartChange: (cart: Cart) => void;
  onContinue: () => void;
}) {
  const merchantBlocked = !!cart.merchant &&
    (!cart.merchant.is_open || cart.merchant.merchant_status !== 'active');

  // Defensive: the cart schema enforces a single merchant, but flag
  // it prominently if that invariant is ever violated
  const merchantIds = new Set(cart.items.map((i) => i.merchant_id));
  const multiStore  = merchantIds.size > 1;

  const canContinue = cart.items.length > 0
    && cart.validation.is_valid
    && !merchantBlocked
    && !multiStore;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-surface-900 flex items-center gap-2">
        <ShoppingBag className="w-5 h-5 text-brand-green" /> Your Cart
      </h2>

      {cart.merchant && (
        <div className="flex items-center gap-2 text-sm text-surface-600">
          <Store className="w-4 h-4 text-brand-green" />
          <span className="font-semibold">{cart.merchant.store_name}</span>
          {!cart.merchant.is_open && (
            <span className="badge bg-red-100 text-red-700 text-[10px]">Currently Closed</span>
          )}
        </div>
      )}

      {multiStore && (
        <WarningBanner message="Your cart contains items from multiple stores. Please remove items so that only one store remains before continuing." />
      )}

      {merchantBlocked && !multiStore && (
        <WarningBanner
          message={
            cart.merchant?.merchant_status !== 'active'
              ? 'This store is currently unavailable. Please remove these items and try a different store.'
              : 'This store is currently closed. You can review your cart, but checkout will be available once the store reopens.'
          }
        />
      )}

      {cart.validation.warnings.map((w, i) => (
        <WarningBanner key={`${w.type}-${w.product_id ?? i}`} message={w.message} />
      ))}

      <div className="space-y-2">
        {cart.items.map((item) => (
          <CartItemRow key={item.cart_item_id} item={item} onCartChange={onCartChange} />
        ))}
      </div>

      <div className="card p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-surface-500">
            {cart.item_count} item{cart.item_count !== 1 ? 's' : ''}
          </p>
          <p className="text-lg font-black text-surface-900">₹{cart.totals.subtotal.toFixed(2)}</p>
        </div>
        <p className="text-xs text-surface-400 text-right max-w-[10rem]">
          Subtotal (excl. delivery &amp; GST)
        </p>
      </div>

      <button onClick={onContinue} disabled={!canContinue} className="btn-primary w-full disabled:opacity-50">
        Continue to Address →
      </button>
    </div>
  );
}
