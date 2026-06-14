// src/components/checkout/PaymentStep.tsx
// ─────────────────────────────────────────────────────────────
// Checkout Step 4 — Payment
// POST /orders  → {order, payment, message}
// POST /orders/verify (Razorpay only) → {order_id, order_number, ...}
// Razorpay checkout.js is loaded lazily inside useEffect.
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState, useEffect } from 'react';
import { CreditCard, Truck, Wallet, ShieldCheck, Check } from 'lucide-react';
import { apiPost, getErrorMessage } from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import type { Cart, Address, OrderTotals } from './types';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

type PaymentMethod = 'razorpay' | 'cod' | 'wallet';

interface PlacedOrder {
  id: string;
  order_number: string;
  total_amount?: number | string;
  order_status?: string;
  payment_status?: string;
}

interface PaymentInfo {
  method: string;
  payable?: number;
  wallet_applied?: number;
  razorpay_order_id?: string;
  key_id?: string;
}

interface PlaceOrderResponse {
  order: PlacedOrder;
  payment: PaymentInfo;
  message: string;
}

interface VerifyResponse {
  order_id: string;
  order_number: string;
  order_status: string;
  payment_status: string;
  message: string;
}

export default function PaymentStep({
  cart, address, totals, couponCode, onBack, onSuccess,
}: {
  cart: Cart;
  address: Address;
  totals: OrderTotals;
  couponCode: string | null;
  onBack: () => void;
  onSuccess: (orderId: string, orderNumber: string) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [method, setMethod]         = useState<PaymentMethod>('razorpay');
  const [placing, setPlacing]       = useState(false);
  const [scriptReady, setScriptReady] = useState(false);

  const codAvailable     = !!cart.merchant?.accepts_cod;
  const walletBalance    = user?.wallet_balance ?? 0;
  const walletSufficient = walletBalance >= totals.total;

  // Lazily load Razorpay checkout.js — never at module scope
  useEffect(() => {
    if (window.Razorpay) { setScriptReady(true); return; }
    const script = document.createElement('script');
    script.src   = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload  = () => setScriptReady(true);
    script.onerror = () => toast.error('Could not load the payment gateway. Please refresh and try again.');
    document.body.appendChild(script);
    return () => {
      if (document.body.contains(script)) document.body.removeChild(script);
    };
  }, []);

  const openRazorpayCheckout = (order: PlacedOrder, payment: PaymentInfo) => {
    const keyId = payment.key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';

    const options = {
      key: keyId,
      amount: Math.round((payment.payable ?? totals.total) * 100),
      currency: 'INR',
      name: 'MyLocalBazaar',
      description: `Order ${order.order_number}`,
      order_id: payment.razorpay_order_id,
      prefill: {
        name: address.full_name,
        contact: address.phone,
        email: user?.email || undefined,
      },
      theme: { color: '#16a34a' },
      handler: async (response: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      }) => {
        try {
          const verifyRes = await apiPost<VerifyResponse>('/orders/verify', {
            razorpay_order_id:   response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature:  response.razorpay_signature,
            order_id:            order.id,
          });
          onSuccess(verifyRes.data.order_id, verifyRes.data.order_number);
        } catch (err) {
          toast.error(getErrorMessage(err) || 'Payment verification failed');
        } finally {
          setPlacing(false);
        }
      },
      modal: {
        ondismiss: () => {
          toast.error('Payment cancelled');
          setPlacing(false);
        },
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  const placeOrder = async () => {
    if (method === 'cod' && !codAvailable) {
      toast.error('Cash on Delivery is not available for this store');
      return;
    }
    if (method === 'wallet' && !walletSufficient) {
      toast.error('Insufficient wallet balance');
      return;
    }
    if (method === 'razorpay' && !scriptReady) {
      toast.error('Payment gateway is still loading. Please wait a moment.');
      return;
    }

    setPlacing(true);
    try {
      const res = await apiPost<PlaceOrderResponse>('/orders', {
        address_id: address.id,
        payment_method: method,
        ...(couponCode ? { coupon_code: couponCode } : {}),
      });

      const { order, payment } = res.data;

      if (method === 'razorpay') {
        openRazorpayCheckout(order, payment);
        // placing stays true until handler/ondismiss resolves
      } else {
        onSuccess(order.id, order.order_number);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
      setPlacing(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-surface-900 flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-brand-green" /> Payment
      </h2>

      <div className="card p-4 flex items-center justify-between">
        <span className="text-sm text-surface-500">Total Payable</span>
        <span className="text-xl font-black text-surface-900">₹{totals.total.toFixed(2)}</span>
      </div>

      <div className="space-y-2">
        {/* Razorpay */}
        <button
          onClick={() => setMethod('razorpay')}
          className={`w-full text-left p-4 rounded-2xl border transition-colors flex items-center gap-3 ${
            method === 'razorpay' ? 'border-brand-green bg-brand-green/5' : 'border-surface-200 bg-white hover:border-surface-300'
          }`}
        >
          <RadioDot active={method === 'razorpay'} />
          <CreditCard className="w-5 h-5 text-surface-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-surface-900">Pay Online (Card / UPI / Netbanking)</p>
            <p className="text-xs text-surface-500">Secure payment via Razorpay</p>
          </div>
        </button>

        {/* COD */}
        <button
          onClick={() => codAvailable && setMethod('cod')}
          disabled={!codAvailable}
          className={`w-full text-left p-4 rounded-2xl border transition-colors flex items-center gap-3 ${
            !codAvailable
              ? 'border-surface-100 bg-surface-50 opacity-60 cursor-not-allowed'
              : method === 'cod' ? 'border-brand-green bg-brand-green/5' : 'border-surface-200 bg-white hover:border-surface-300'
          }`}
        >
          <RadioDot active={method === 'cod'} />
          <Truck className="w-5 h-5 text-surface-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-surface-900">Cash on Delivery</p>
            <p className="text-xs text-surface-500">
              {codAvailable ? 'Pay with cash when your order arrives' : 'Not available for this store'}
            </p>
          </div>
        </button>

        {/* Wallet */}
        <button
          onClick={() => walletSufficient && setMethod('wallet')}
          disabled={!walletSufficient}
          className={`w-full text-left p-4 rounded-2xl border transition-colors flex items-center gap-3 ${
            !walletSufficient
              ? 'border-surface-100 bg-surface-50 opacity-60 cursor-not-allowed'
              : method === 'wallet' ? 'border-brand-green bg-brand-green/5' : 'border-surface-200 bg-white hover:border-surface-300'
          }`}
        >
          <RadioDot active={method === 'wallet'} />
          <Wallet className="w-5 h-5 text-surface-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-surface-900">Wallet</p>
            <p className="text-xs text-surface-500">
              {walletSufficient
                ? `Available balance: ₹${walletBalance.toFixed(2)}`
                : `Insufficient balance (₹${walletBalance.toFixed(2)} available)`}
            </p>
          </div>
        </button>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} disabled={placing} className="btn-ghost flex-1 disabled:opacity-50">← Back</button>
        <button onClick={placeOrder} disabled={placing} className="btn-primary flex-1 disabled:opacity-50">
          {placing ? 'Processing…' : `Place Order — ₹${totals.total.toFixed(2)}`}
        </button>
      </div>
    </div>
  );
}

function RadioDot({ active }: { active: boolean }) {
  return (
    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
      active ? 'border-brand-green' : 'border-surface-300'
    }`}>
      {active && <Check className="w-2.5 h-2.5 text-brand-green" strokeWidth={4} />}
    </div>
  );
}
