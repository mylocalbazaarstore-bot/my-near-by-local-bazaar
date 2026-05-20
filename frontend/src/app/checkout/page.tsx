// src/app/checkout/page.tsx
// ─────────────────────────────────────────────────────────────
// Checkout Page — MyLocalBazaar
// Flow: Select/Add Address → Choose Payment → Place Order
// POST /orders { address_id, payment_method, notes?, use_wallet? }
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, CreditCard, CheckCircle2, ShoppingCart,
  Plus, ChevronLeft, Package, Wallet,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import { apiGet, apiPost } from '@/lib/api';
import toast from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────────
interface Address {
  id:            string;
  label:         string;
  full_name:     string;
  phone:         string;
  address_line1: string;
  address_line2?: string;
  landmark?:     string;
  pincode:       string;
  city:          string;
  state:         string;
  is_default:    boolean;
}

const PAYMENT_METHODS = [
  { key: 'cod',    label: 'Cash on Delivery', icon: '💵', desc: 'Pay when your order arrives' },
  { key: 'wallet', label: 'Wallet Balance',   icon: '💰', desc: 'Use your MyLocalBazaar wallet' },
];

// ── Step 1: Address selection ──────────────────────────────────
function AddressStep({
  onSelect,
}: {
  onSelect: (addr: Address) => void;
}) {
  const { user } = useAuthStore();
  const [addresses,  setAddresses]  = useState<Address[]>([]);
  const [selected,   setSelected]   = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [form, setForm] = useState({
    label:         'Home',
    full_name:     user?.full_name || '',
    phone:         user?.phone     || '',
    address_line1: '',
    address_line2: '',
    landmark:      '',
    pincode:       '410210',
    city:          'Navi Mumbai',
    state:         'Maharashtra',
    is_default:    true,
  });

  useEffect(() => {
    apiGet<any>('/auth/customer/addresses')
      .then((res) => {
        const addrs: Address[] = (res.data as any)?.addresses || [];
        setAddresses(addrs);
        // Auto-select default address
        const def = addrs.find((a) => a.is_default) || addrs[0];
        if (def) setSelected(def.id);
        // If no addresses, show the form immediately
        if (addrs.length === 0) setShowForm(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const saveAddress = async () => {
    if (!form.address_line1 || !form.phone || !form.full_name) {
      toast.error('Please fill in all required fields');
      return;
    }
    setSaving(true);
    try {
      const res = await apiPost<any>('/auth/customer/address', form);
      const newAddr: Address = (res.data as any)?.address;
      if (newAddr) {
        setAddresses((prev) => [newAddr, ...prev]);
        setSelected(newAddr.id);
        setShowForm(false);
        toast.success('Address saved!');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save address');
    } finally {
      setSaving(false);
    }
  };

  const proceed = () => {
    const addr = addresses.find((a) => a.id === selected);
    if (!addr) { toast.error('Please select a delivery address'); return; }
    onSelect(addr);
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-surface-900 flex items-center gap-2">
        <MapPin className="w-5 h-5 text-brand-green" /> Delivery Address
      </h2>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}
        </div>
      ) : (
        <>
          {/* Existing addresses */}
          {addresses.map((addr) => (
            <label
              key={addr.id}
              className={clsx(
                'flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all',
                selected === addr.id
                  ? 'border-brand-green bg-green-50'
                  : 'border-surface-200 hover:border-surface-300'
              )}
            >
              <input
                type="radio"
                name="address"
                value={addr.id}
                checked={selected === addr.id}
                onChange={() => setSelected(addr.id)}
                className="mt-0.5 accent-brand-green"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-bold text-surface-500 uppercase">{addr.label}</span>
                  {addr.is_default && (
                    <span className="text-[10px] font-black bg-brand-green/10 text-brand-green px-1.5 py-0.5 rounded-full">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-surface-900">{addr.full_name}</p>
                <p className="text-xs text-surface-500 mt-0.5">
                  {addr.address_line1}
                  {addr.address_line2 ? `, ${addr.address_line2}` : ''}
                  {addr.landmark ? ` — ${addr.landmark}` : ''}
                </p>
                <p className="text-xs text-surface-500">{addr.city}, {addr.pincode} · {addr.phone}</p>
              </div>
            </label>
          ))}

          {/* Add new address toggle */}
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 text-sm font-bold text-brand-green
                         border-2 border-dashed border-brand-green/30 hover:border-brand-green/60
                         w-full py-3 px-4 rounded-2xl transition-colors"
            >
              <Plus className="w-4 h-4" /> Add New Address
            </button>
          )}

          {/* Inline address form */}
          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="card p-4 space-y-3"
              >
                <p className="font-bold text-surface-900">New Address</p>

                <div className="grid grid-cols-2 gap-3">
                  {(['Home', 'Work', 'Other'] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, label: l }))}
                      className={clsx(
                        'py-2 rounded-xl text-sm font-bold border-2 transition-colors',
                        form.label === l
                          ? 'border-brand-green bg-green-50 text-brand-green'
                          : 'border-surface-200 text-surface-600'
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>

                {[
                  { key: 'full_name',     label: 'Full Name',      placeholder: 'Recipient name', required: true  },
                  { key: 'phone',         label: 'Phone',          placeholder: '9XXXXXXXXX',     required: true  },
                  { key: 'address_line1', label: 'Address',        placeholder: 'Flat, Building, Street', required: true },
                  { key: 'landmark',      label: 'Landmark',       placeholder: 'Near park, landmark…',  required: false },
                  { key: 'pincode',       label: 'Pincode',        placeholder: '410210',          required: true  },
                ].map(({ key, label, placeholder, required }) => (
                  <div key={key}>
                    <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1">
                      {label} {required && <span className="text-red-400">*</span>}
                    </label>
                    <input
                      type="text"
                      value={(form as any)[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="input-field"
                    />
                  </div>
                ))}

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowForm(false)}
                    className="btn-ghost flex-1 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveAddress}
                    disabled={saving}
                    className="btn-primary flex-1 text-sm"
                  >
                    {saving ? 'Saving…' : 'Save Address'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {addresses.length > 0 && (
            <button onClick={proceed} className="btn-primary w-full">
              Continue to Payment →
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Step 2: Payment & Place Order ──────────────────────────────
function PaymentStep({
  address,
  onBack,
  onSuccess,
}: {
  address:   Address;
  onBack:    () => void;
  onSuccess: (orderId: string, orderNum: string) => void;
}) {
  const { user } = useAuthStore();
  const { items, totals, clearCart } = useCartStore();
  const [method,   setMethod]   = useState('cod');
  const [notes,    setNotes]    = useState('');
  const [useWallet,setUseWallet] = useState(false);
  const [placing,  setPlacing]  = useState(false);

  const placeOrder = async () => {
    setPlacing(true);
    try {
      const res = await apiPost<any>('/orders', {
        address_id:     address.id,
        payment_method: method,
        notes:          notes || undefined,
        use_wallet:     useWallet,
      });
      const order = (res.data as any)?.order;
      await clearCart();
      onSuccess(order?.id || '', order?.order_number || '');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to place order');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="font-display text-lg font-bold text-surface-900 flex items-center gap-2">
        <CreditCard className="w-5 h-5 text-brand-green" /> Payment Method
      </h2>

      {/* Delivery address recap */}
      <div className="card p-4 flex items-start gap-3">
        <MapPin className="w-4 h-4 text-brand-green flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-surface-500 uppercase mb-0.5">{address.label}</p>
          <p className="text-sm font-semibold text-surface-900">{address.address_line1}</p>
          <p className="text-xs text-surface-500">{address.city}, {address.pincode} · {address.phone}</p>
        </div>
        <button onClick={onBack} className="ml-auto text-xs font-bold text-brand-green hover:underline">
          Change
        </button>
      </div>

      {/* Payment method selection */}
      <div className="space-y-2">
        {PAYMENT_METHODS.map((pm) => (
          <label
            key={pm.key}
            className={clsx(
              'flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all',
              method === pm.key
                ? 'border-brand-green bg-green-50'
                : 'border-surface-200 hover:border-surface-300'
            )}
          >
            <input
              type="radio"
              name="payment"
              value={pm.key}
              checked={method === pm.key}
              onChange={() => setMethod(pm.key)}
              className="accent-brand-green"
            />
            <span className="text-xl">{pm.icon}</span>
            <div>
              <p className="text-sm font-bold text-surface-900">{pm.label}</p>
              <p className="text-xs text-surface-500">{pm.desc}</p>
            </div>
            {pm.key === 'wallet' && user?.wallet_balance !== undefined && (
              <span className="ml-auto text-sm font-black text-brand-green">
                ₹{Number(user.wallet_balance).toFixed(2)}
              </span>
            )}
          </label>
        ))}
      </div>

      {/* Wallet top-up option */}
      {method !== 'wallet' && Number(user?.wallet_balance ?? 0) > 0 && (
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setUseWallet((v) => !v)}
            className={clsx(
              'w-10 h-5 rounded-full transition-colors relative',
              useWallet ? 'bg-brand-green' : 'bg-surface-300'
            )}
          >
            <span className={clsx(
              'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
              useWallet ? 'translate-x-5' : 'translate-x-0.5'
            )} />
          </div>
          <span className="text-sm text-surface-700">
            Use wallet balance (₹{Number(user?.wallet_balance).toFixed(2)}) for partial payment
          </span>
        </label>
      )}

      {/* Notes */}
      <div>
        <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
          Order Notes (Optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any special instructions for the merchant…"
          rows={2}
          maxLength={500}
          className="input-field resize-none text-sm"
        />
      </div>

      {/* Order summary */}
      {totals && (
        <div className="card p-4 space-y-1.5 text-sm">
          <p className="font-bold text-surface-900 mb-2">Order Summary</p>
          <div className="flex justify-between text-surface-500">
            <span>Subtotal ({items.length} item{items.length !== 1 ? 's' : ''})</span>
            <span>₹{totals.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-surface-500">
            <span>GST</span>
            <span>₹{totals.gst.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-surface-500">
            <span>Delivery</span>
            <span>{totals.delivery_charge > 0 ? `₹${totals.delivery_charge}` : 'Free'}</span>
          </div>
          <div className="flex justify-between font-bold text-base pt-2 border-t border-surface-100">
            <span>Total Payable</span>
            <span className="text-brand-green">₹{totals.total.toFixed(2)}</span>
          </div>
        </div>
      )}

      <button
        onClick={placeOrder}
        disabled={placing}
        className="btn-primary w-full text-base py-3"
      >
        {placing ? 'Placing Order…' : `Place Order • ₹${totals?.total.toFixed(2) ?? '0.00'}`}
      </button>
    </div>
  );
}

// ── Step 3: Order success ──────────────────────────────────────
function SuccessStep({ orderId, orderNum }: { orderId: string; orderNum: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', damping: 12 }}
        className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6"
      >
        <CheckCircle2 className="w-10 h-10 text-brand-green" />
      </motion.div>

      <h2 className="font-display text-2xl font-black text-surface-900 mb-2">
        Order Placed!
      </h2>
      <p className="text-surface-500 mb-1">Your order has been sent to the merchant.</p>
      <p className="font-mono font-bold text-brand-green text-lg mb-8">{orderNum}</p>

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
        <Link href="/dashboard" className="btn-primary flex-1 text-center">
          Track Order
        </Link>
        <Link href="/" className="btn-ghost flex-1 text-center">
          Keep Shopping
        </Link>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CHECKOUT PAGE
// ═══════════════════════════════════════════════════════════════
export default function CheckoutPage() {
  const router = useRouter();
  const { user, isHydrated } = useAuthStore();
  const { items, fetchCart, loading: cartLoading } = useCartStore();

  const [step,      setStep]      = useState<'address' | 'payment' | 'success'>('address');
  const [address,   setAddress]   = useState<Address | null>(null);
  const [orderId,   setOrderId]   = useState('');
  const [orderNum,  setOrderNum]  = useState('');

  // Guard: must be logged in
  useEffect(() => {
    if (isHydrated && !user) {
      router.replace('/login?redirect=/checkout');
    }
  }, [isHydrated, user]);

  // Load cart on mount
  useEffect(() => {
    if (user) fetchCart();
  }, [user]);

  if (!isHydrated || !user) return null;

  // Empty cart guard — only after cart has loaded
  if (!cartLoading && items.length === 0 && step !== 'success') {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="text-center">
          <ShoppingCart className="w-16 h-16 text-surface-200 mx-auto mb-4" />
          <h2 className="font-display text-xl font-bold text-surface-900 mb-2">Cart is empty</h2>
          <p className="text-surface-500 mb-6">Add some products before checking out.</p>
          <Link href="/categories/grocery-fmcg" className="btn-primary">Browse Products</Link>
        </div>
      </div>
    );
  }

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
          {/* Step indicator */}
          <div className="flex items-center gap-1.5 text-xs font-bold text-surface-400">
            {['address', 'payment', 'success'].map((s, i) => (
              <React.Fragment key={s}>
                <span className={clsx(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px]',
                  step === s
                    ? 'bg-brand-green text-white'
                    : i < ['address','payment','success'].indexOf(step)
                      ? 'bg-green-200 text-green-800'
                      : 'bg-surface-200 text-surface-500'
                )}>
                  {i + 1}
                </span>
                {i < 2 && <span className="text-surface-300">—</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
      </header>

      <main className="container-mlb max-w-lg py-8">
        <AnimatePresence mode="wait">
          {step === 'address' && (
            <motion.div key="address" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}>
              <AddressStep
                onSelect={(addr) => {
                  setAddress(addr);
                  setStep('payment');
                }}
              />
            </motion.div>
          )}

          {step === 'payment' && address && (
            <motion.div key="payment" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
              <PaymentStep
                address={address}
                onBack={() => setStep('address')}
                onSuccess={(id, num) => {
                  setOrderId(id);
                  setOrderNum(num);
                  setStep('success');
                }}
              />
            </motion.div>
          )}

          {step === 'success' && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              <SuccessStep orderId={orderId} orderNum={orderNum} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
