// src/components/checkout/OrderSuccess.tsx
// ─────────────────────────────────────────────────────────────
// Checkout Step 5 — Order Confirmation
// Communicates the double-approval flow: payment confirmation does
// NOT mean the merchant has accepted the order yet.
// ─────────────────────────────────────────────────────────────

'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, Package, Truck, Home as HomeIcon } from 'lucide-react';

const FLOW_STEPS = [
  { key: 'payment_processed', label: 'Payment Confirmed',        icon: CheckCircle2, done: true },
  { key: 'merchant_approved',  label: 'Awaiting Merchant Approval', icon: Clock,      done: false },
  { key: 'packed',             label: 'Packing',                  icon: Package,     done: false },
  { key: 'out_for_delivery',   label: 'Out for Delivery',         icon: Truck,       done: false },
  { key: 'delivered',          label: 'Delivered',                icon: HomeIcon,    done: false },
];

export default function OrderSuccess({ orderNumber }: { orderNumber: string }) {
  const router = useRouter();

  return (
    <div className="space-y-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full bg-brand-green/10 flex items-center justify-center">
          <CheckCircle2 className="w-9 h-9 text-brand-green" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold text-surface-900">Order Placed!</h2>
          <p className="text-sm text-surface-500 mt-1">
            Order <span className="font-bold text-surface-900">{orderNumber}</span> has been confirmed.
          </p>
        </div>
      </div>

      {/* Double-approval flow timeline */}
      <div className="card p-4 text-left">
        <p className="text-xs font-bold text-surface-500 uppercase tracking-wide mb-3">Order Status</p>
        <div className="space-y-3">
          {FLOW_STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.key} className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  step.done ? 'bg-brand-green text-white' : 'bg-surface-100 text-surface-400'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className={`text-sm ${step.done ? 'font-bold text-surface-900' : 'text-surface-500'}`}>
                  {step.label}
                </span>
                {i === 1 && !step.done && (
                  <span className="badge bg-orange-100 text-orange-700 text-[10px] ml-auto">Current</span>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-surface-400 mt-4">
          Your payment has been confirmed. The store now needs to review and accept your order —
          you&apos;ll be notified at each step until it&apos;s delivered.
        </p>
      </div>

      <div className="flex gap-3">
        <button onClick={() => router.push('/')} className="btn-ghost flex-1">
          Continue Shopping
        </button>
        <button onClick={() => router.push('/dashboard')} className="btn-primary flex-1">
          Track Order
        </button>
      </div>
    </div>
  );
}
