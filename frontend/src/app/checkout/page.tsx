// src/app/checkout/page.tsx
// ─────────────────────────────────────────────────────────────
// Checkout Page — MyLocalBazaar
// Wizard: Cart Review → Address → Order Summary (coupon) → Payment → Success
// GET /cart drives the whole flow; each step mutates shared state
// that is passed down to the next step.
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import { apiGet, getErrorMessage } from '@/lib/api';
import toast from 'react-hot-toast';

import CartReview from '@/components/checkout/CartReview';
import AddressStep from '@/components/checkout/AddressStep';
import OrderSummary from '@/components/checkout/OrderSummary';
import PaymentStep from '@/components/checkout/PaymentStep';
import OrderSuccess from '@/components/checkout/OrderSuccess';
import {
  type Cart, type Address, type DeliveryEstimate, type CouponPreview,
  type CheckoutStep, STEP_ORDER, STEP_LABELS, computeTotals,
} from '@/components/checkout/types';

export default function CheckoutPage() {
  const router = useRouter();
  const { user, isHydrated } = useAuthStore();
  const fetchGlobalCart = useCartStore((s) => s.fetchCart);

  const [cart, setCart]       = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep]       = useState<CheckoutStep>('cart');

  const [address, setAddress]   = useState<Address | null>(null);
  const [delivery, setDelivery] = useState<DeliveryEstimate | null>(null);
  const [coupon, setCoupon]     = useState<CouponPreview | null>(null);

  const [success, setSuccess] = useState<{ orderId: string; orderNumber: string } | null>(null);

  // ── Auth guard ────────────────────────────────────────────────
  useEffect(() => {
    if (isHydrated && !user) {
      router.replace('/login?redirect=/checkout');
    }
  }, [isHydrated, user, router]);

  // ── Load cart ────────────────────────────────────────────────
  const loadCart = useCallback(async () => {
    try {
      const res = await apiGet<{ cart: Cart }>('/cart');
      setCart(res.data.cart);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadCart();
  }, [user, loadCart]);

  // ── Empty cart guard ─────────────────────────────────────────
  useEffect(() => {
    if (!loading && cart && cart.items.length === 0 && !success) {
      router.replace('/');
    }
  }, [loading, cart, success, router]);

  if (!isHydrated || !user) return null;

  if (loading || !cart) {
    return (
      <div className="min-h-screen bg-surface-50">
        <main className="container-mlb max-w-lg py-8 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-2xl" />
          ))}
        </main>
      </div>
    );
  }

  if (cart.items.length === 0 && !success) return null; // redirecting

  const totals = computeTotals(cart, delivery, coupon);
  const stepIndex = STEP_ORDER.indexOf(step);

  const handleCartChange = (updated: Cart) => {
    setCart(updated);
    // Subtotal may have changed — stale delivery quote / coupon discount no longer apply
    setDelivery(null);
    setCoupon(null);
  };

  const handleOrderSuccess = (orderId: string, orderNumber: string) => {
    setSuccess({ orderId, orderNumber });
    fetchGlobalCart();
  };

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Header bar */}
      <header className="bg-white border-b border-surface-100 sticky top-0 z-10">
        <div className="container-mlb flex items-center gap-3 py-4">
          <Link href="/" className="flex items-center gap-1.5 text-sm text-surface-600 hover:text-brand-green">
            <ChevronLeft className="w-4 h-4" /> Back to store
          </Link>
          <div className="flex-1 text-center">
            <h1 className="font-display font-bold text-surface-900">Checkout</h1>
          </div>
          {!success && (
            <span className="text-xs font-bold text-surface-400 whitespace-nowrap">
              Step {stepIndex + 1} of {STEP_ORDER.length}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {!success && (
          <div className="container-mlb pb-3">
            <div className="flex items-center gap-1.5">
              {STEP_ORDER.map((s, i) => (
                <div
                  key={s}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i <= stepIndex ? 'bg-brand-green' : 'bg-surface-200'
                  }`}
                  title={STEP_LABELS[s]}
                />
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="container-mlb max-w-lg py-8">
        <AnimatePresence mode="wait">
          {success ? (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              <OrderSuccess orderNumber={success.orderNumber} />
            </motion.div>
          ) : (
            <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
              {step === 'cart' && (
                <CartReview
                  cart={cart}
                  onCartChange={handleCartChange}
                  onContinue={() => setStep('address')}
                />
              )}

              {step === 'address' && (
                <AddressStep
                  selectedAddress={address}
                  delivery={delivery}
                  onSelect={(addr, est) => { setAddress(addr); setDelivery(est); }}
                  onContinue={() => setStep('summary')}
                  onBack={() => setStep('cart')}
                />
              )}

              {step === 'summary' && (
                <OrderSummary
                  cart={cart}
                  delivery={delivery}
                  coupon={coupon}
                  onCouponChange={setCoupon}
                  onContinue={() => setStep('payment')}
                  onBack={() => setStep('address')}
                />
              )}

              {step === 'payment' && address && (
                <PaymentStep
                  cart={cart}
                  address={address}
                  totals={totals}
                  couponCode={coupon?.coupon.code ?? null}
                  onBack={() => setStep('summary')}
                  onSuccess={handleOrderSuccess}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
