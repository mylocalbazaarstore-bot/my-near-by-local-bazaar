// src/components/ui/CartDrawer.tsx
// ─────────────────────────────────────────────────────────────
// Global Cart Drawer — MyLocalBazaar
// Slide-over from right, synced with useCartStore
// MOQ-respecting quantity controls + checkout trigger
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingCart, Minus, Plus, Trash2, ArrowRight } from 'lucide-react';
import { clsx } from 'clsx';
import { useCartStore, type CartItemLocal } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

// ── Cart item row ─────────────────────────────────────────────
function CartItemRow({ item }: { item: CartItemLocal }) {
  const { updateQty, removeItem } = useCartStore();
  const [busy, setBusy] = React.useState(false);

  const change = async (delta: number) => {
    const next = item.quantity + delta;
    if (next < item.moq) {
      // Below MOQ — prompt removal instead of allowing invalid qty
      await handleRemove();
      return;
    }
    setBusy(true);
    try {
      await updateQty(item.cart_item_id, next, item.moq);
    } catch {
      toast.error('Failed to update quantity');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    try {
      await removeItem(item.cart_item_id);
    } catch {
      toast.error('Failed to remove item');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      className="flex gap-3 py-3 border-b border-surface-100 last:border-0"
    >
      {/* Thumbnail */}
      <div className="w-14 h-14 rounded-xl bg-surface-100 overflow-hidden flex-shrink-0">
        {item.image ? (
          <Image src={item.image} alt={item.name}
                 width={56} height={56} className="object-cover w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl">🛍️</div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-surface-900 line-clamp-1">{item.name}</p>
        {item.variant_name && (
          <p className="text-[11px] text-surface-400">{item.variant_name}</p>
        )}
        <p className="text-xs text-surface-500">
          ₹{item.unit_price.toFixed(2)} × {item.quantity}
          {item.unit ? ` ${item.unit}` : ''}
          {item.moq > 1 && (
            <span className="ml-1 text-[10px] text-brand-orange font-bold">(MOQ: {item.moq})</span>
          )}
        </p>

        {/* Qty controls */}
        <div className="flex items-center gap-2 mt-1.5">
          <button
            disabled={busy}
            onClick={() => change(-1)}
            className="w-6 h-6 rounded-lg bg-surface-100 hover:bg-surface-200
                       flex items-center justify-center transition-colors disabled:opacity-40"
          >
            <Minus className="w-3 h-3 text-surface-700" />
          </button>
          <span className="text-sm font-bold text-surface-900 w-6 text-center">
            {item.quantity}
          </span>
          <button
            disabled={busy}
            onClick={() => change(1)}
            className="w-6 h-6 rounded-lg bg-surface-100 hover:bg-surface-200
                       flex items-center justify-center transition-colors disabled:opacity-40"
          >
            <Plus className="w-3 h-3 text-surface-700" />
          </button>
        </div>
      </div>

      {/* Price + remove */}
      <div className="flex flex-col items-end justify-between">
        <p className="text-sm font-bold text-surface-900">
          ₹{item.line_total.toFixed(2)}
        </p>
        <button
          disabled={busy}
          onClick={handleRemove}
          className="p-1 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
        >
          <Trash2 className="w-3.5 h-3.5 text-red-400" />
        </button>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CART DRAWER
// ═══════════════════════════════════════════════════════════════
export default function CartDrawer() {
  const { items, totals, itemCount, loading, drawerOpen, closeDrawer, fetchCart } = useCartStore();
  const { user } = useAuthStore();

  useEffect(() => {
    if (drawerOpen && user) fetchCart();
  }, [drawerOpen]);

  return (
    <AnimatePresence>
      {drawerOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
            onClick={closeDrawer}
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-white z-50
                       shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-100 flex-shrink-0">
              <button
                onClick={closeDrawer}
                className="p-2 rounded-xl hover:bg-surface-100 transition-colors"
              >
                <X className="w-5 h-5 text-surface-600" />
              </button>
              <div className="flex-1">
                <h2 className="font-display font-bold text-surface-900">
                  My Cart
                  {itemCount > 0 && (
                    <span className="ml-2 text-brand-green">({itemCount})</span>
                  )}
                </h2>
                {items[0]?.store_name && (
                  <p className="text-[11px] text-surface-400 mt-0.5">From {items[0].store_name}</p>
                )}
              </div>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-5">
              {loading ? (
                <div className="space-y-4 py-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="skeleton w-14 h-14 rounded-xl flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="skeleton h-3.5 w-3/4 rounded" />
                        <div className="skeleton h-3 w-1/2 rounded" />
                        <div className="skeleton h-6 w-24 rounded-lg" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <ShoppingCart className="w-12 h-12 text-surface-200 mb-4" />
                  <p className="font-bold text-surface-700 mb-1">Your cart is empty</p>
                  <p className="text-sm text-surface-400 mb-6">Browse categories to add products</p>
                  <Link
                    href="/categories/grocery-fmcg"
                    onClick={closeDrawer}
                    className="btn-primary text-sm"
                  >
                    Shop Now
                  </Link>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  <div>
                    {items.map((item) => (
                      <CartItemRow key={item.cart_item_id} item={item} />
                    ))}
                  </div>
                </AnimatePresence>
              )}
            </div>

            {/* Footer — totals + CTA */}
            {items.length > 0 && (
              <div className="flex-shrink-0 px-5 py-4 border-t border-surface-100 space-y-3 bg-white">
                {/* Price breakdown */}
                {totals && (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between text-surface-500">
                      <span>Subtotal</span>
                      <span>₹{totals.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-surface-500">
                      <span>GST</span>
                      <span>₹{totals.gst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-surface-500">
                      <span>Delivery</span>
                      <span>{totals.delivery_charge > 0 ? `₹${totals.delivery_charge}` : 'Calculated at checkout'}</span>
                    </div>
                    <div className="flex justify-between font-bold text-base pt-1.5 border-t border-surface-100">
                      <span>Total</span>
                      <span className="text-brand-green">₹{totals.total.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {!user ? (
                  <Link
                    href="/login?redirect=/checkout"
                    onClick={closeDrawer}
                    className="btn-primary w-full text-center flex items-center justify-center gap-2"
                  >
                    Login to Checkout <ArrowRight className="w-4 h-4" />
                  </Link>
                ) : (
                  <Link
                    href="/checkout"
                    onClick={closeDrawer}
                    className="btn-primary w-full text-center flex items-center justify-center gap-2"
                  >
                    Proceed to Checkout <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
