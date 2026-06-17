// src/components/checkout/PaymentStep.tsx
// ─────────────────────────────────────────────────────────────
// Checkout Step 4 — Payment
// POST /orders  → {order, payment, message}
// POST /orders/verify (Razorpay only) → {order_id, order_number, ...}
// POST /orders/upload-proof (UPI Direct) → {url}
// Razorpay checkout.js is loaded lazily inside useEffect.
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState, useEffect, useRef } from 'react';
import { CreditCard, Truck, Wallet, ShieldCheck, Check, Smartphone, Upload } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { apiPost, apiPostForm, getErrorMessage } from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import type { Cart, Address, OrderTotals } from './types';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

type PaymentMethod = 'razorpay' | 'cod' | 'wallet' | 'upi_direct';

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

  // Resolve codAvailable before initializing method state so the default is correct
  const codAvailable  = !!cart.merchant?.accepts_cod;
  const upiAvailable  = !!(cart.merchant?.upi_id);
  const walletBalance = Number(user?.wallet_balance ?? 0);
  const walletSufficient = walletBalance >= totals.total;

  const [method, setMethod]           = useState<PaymentMethod>(codAvailable ? 'cod' : 'razorpay');
  const [placing, setPlacing]         = useState(false);
  const [scriptReady, setScriptReady] = useState(false);

  // UPI Direct state
  const [utrNumber,          setUtrNumber]          = useState('');
  const [screenshotFile,     setScreenshotFile]      = useState<File | null>(null);
  const [screenshotUrl,      setScreenshotUrl]       = useState('');
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const screenshotInputRef = useRef<HTMLInputElement>(null);

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

  // Upload screenshot to Cloudinary and save URL
  const handleScreenshotChange = async (file: File) => {
    setScreenshotFile(file);
    setUploadingScreenshot(true);
    try {
      const fd = new FormData();
      fd.append('screenshot', file);
      const res = await apiPostForm<{ url: string }>('/orders/upload-proof', fd);
      setScreenshotUrl((res.data as any).url || '');
      toast.success('Screenshot uploaded');
    } catch {
      toast.error('Screenshot upload failed. Please try again.');
      setScreenshotFile(null);
    } finally {
      setUploadingScreenshot(false);
    }
  };

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
    if (method === 'upi_direct') {
      if (!utrNumber.trim() && !screenshotUrl) {
        toast.error('Please enter your UTR number or upload a payment screenshot');
        return;
      }
      if (uploadingScreenshot) {
        toast.error('Screenshot is still uploading, please wait');
        return;
      }
    }

    setPlacing(true);
    try {
      const body: Record<string, unknown> = {
        address_id: address.id,
        payment_method: method,
        ...(couponCode ? { coupon_code: couponCode } : {}),
      };

      if (method === 'upi_direct') {
        if (utrNumber.trim()) body.payment_utr = utrNumber.trim();
        if (screenshotUrl)    body.payment_screenshot_url = screenshotUrl;
      }

      const res = await apiPost<PlaceOrderResponse>('/orders', body);
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

  // UPI deep-link string for QR code and mobile tap
  const upiDeepLink = upiAvailable
    ? `upi://pay?pa=${encodeURIComponent(cart.merchant!.upi_id!)}&pn=${encodeURIComponent(cart.merchant!.store_name)}&am=${totals.total.toFixed(2)}&cu=INR&tn=Order`
    : '';

  const upiProofValid = !!(utrNumber.trim() || screenshotUrl);

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

        {/* UPI Direct — only shown when merchant has a upi_id set */}
        {upiAvailable && (
          <div
            className={`rounded-2xl border transition-colors ${
              method === 'upi_direct' ? 'border-brand-green bg-brand-green/5' : 'border-surface-200 bg-white'
            }`}
          >
            <button
              onClick={() => setMethod('upi_direct')}
              className="w-full text-left p-4 flex items-center gap-3"
            >
              <RadioDot active={method === 'upi_direct'} />
              <Smartphone className="w-5 h-5 text-surface-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-surface-900">Pay via UPI (Direct to Merchant)</p>
                <p className="text-xs text-surface-500">
                  Scan QR or tap Pay Now, then enter UTR or upload screenshot
                </p>
              </div>
            </button>

            {method === 'upi_direct' && (
              <div className="px-4 pb-4 space-y-4 border-t border-surface-100 pt-3">
                {/* QR code + mobile Pay Now */}
                <div className="flex flex-col items-center gap-3">
                  <div className="bg-white p-3 rounded-2xl border border-surface-200 shadow-sm">
                    <QRCodeSVG value={upiDeepLink} size={160} level="M" />
                  </div>
                  <p className="text-xs text-surface-500 text-center">
                    Scan with any UPI app<br />
                    <span className="font-mono text-surface-700 font-bold">{cart.merchant!.upi_id}</span>
                  </p>
                  {/* Mobile: tap to open UPI app directly */}
                  <a
                    href={upiDeepLink}
                    className="sm:hidden btn-primary text-sm !px-6 !py-2.5 w-full text-center"
                  >
                    📱 Pay ₹{totals.total.toFixed(2)} Now
                  </a>
                </div>

                {/* UTR input */}
                <div>
                  <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
                    UTR / Transaction Reference Number
                  </label>
                  <input
                    type="text"
                    value={utrNumber}
                    onChange={(e) => setUtrNumber(e.target.value)}
                    placeholder="e.g. 123456789012"
                    className="input-field font-mono"
                  />
                  <p className="text-[11px] text-surface-400 mt-1">
                    Find the UTR in your UPI app after payment
                  </p>
                </div>

                {/* Screenshot upload */}
                <div>
                  <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
                    Payment Screenshot (optional if UTR provided)
                  </label>
                  <div
                    onClick={() => screenshotInputRef.current?.click()}
                    className="border-2 border-dashed border-surface-300 rounded-xl p-4 flex flex-col items-center gap-2 cursor-pointer hover:border-brand-green/50 transition-colors"
                  >
                    {screenshotUrl ? (
                      <>
                        <img
                          src={screenshotUrl}
                          alt="Payment screenshot"
                          className="w-24 h-24 object-cover rounded-lg"
                        />
                        <p className="text-xs text-green-600 font-semibold">Screenshot uploaded ✓</p>
                      </>
                    ) : uploadingScreenshot ? (
                      <p className="text-xs text-surface-500 animate-pulse">Uploading…</p>
                    ) : (
                      <>
                        <Upload className="w-6 h-6 text-surface-400" />
                        <p className="text-xs text-surface-500">
                          {screenshotFile ? screenshotFile.name : 'Tap to upload payment screenshot'}
                        </p>
                      </>
                    )}
                  </div>
                  <input
                    ref={screenshotInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleScreenshotChange(f);
                    }}
                  />
                </div>

                {/* Validation hint */}
                {!upiProofValid && (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2 font-medium">
                    Please enter your UTR number or upload a payment screenshot to continue.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

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
        <button
          onClick={placeOrder}
          disabled={placing || (method === 'upi_direct' && !upiProofValid) || uploadingScreenshot}
          className="btn-primary flex-1 disabled:opacity-50"
        >
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
