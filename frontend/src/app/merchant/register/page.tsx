'use client';
// src/app/merchant/register/page.tsx — Merchant Registration Wizard — MyLocalBazaar
// 5-step wizard: Phone verification → Store details → Owner account → Review → Success

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Loader2, RefreshCw, CheckCircle2, Circle, Store, AlertCircle,
  Eye, EyeOff, MapPin, Search, ChevronDown, ChevronUp, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import { apiPost, apiGet, getErrorMessage, tokenStorage } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { getBrandColor } from '@/lib/storeTheme';
import toast from 'react-hot-toast';

// ── Shared styles ───────────────────────────────────────────────
const PRIMARY_BTN = 'w-full flex items-center justify-center gap-2 py-3.5 rounded-xl ' +
  'bg-[#1E3A8A] text-white font-bold text-base hover:bg-blue-900 active:scale-95 ' +
  'transition-all disabled:opacity-50 disabled:cursor-not-allowed';

const INPUT_CLS = 'w-full rounded-xl border-2 border-surface-200 bg-white px-4 py-3 ' +
  'text-sm text-surface-900 placeholder-surface-400 focus:outline-none ' +
  'focus:border-[#1E3A8A] transition-colors';

// ── Store category labels (static — store_category ENUM has 10 values) ──
const STORE_CATEGORY_LABELS: Record<string, string> = {
  grocery_fmcg:       'Grocery & FMCG',
  wholesale:          'Wholesale',
  electronics:        'Electronics',
  hardware:           'Hardware',
  clothing:           'Clothing & Fashion',
  medical:            'Medical & Pharmacy',
  food_tea_stall:     'Food — Tea Stall',
  food_chaat_chinese: 'Food — Chaat/Chinese',
  specialty:          'Specialty Store',
  service:            'Services',
};

const STORE_CATEGORIES: { value: string; label: string; emoji: string }[] = [
  { value: 'grocery_fmcg',       label: STORE_CATEGORY_LABELS.grocery_fmcg,       emoji: '🛒' },
  { value: 'wholesale',          label: STORE_CATEGORY_LABELS.wholesale,          emoji: '📦' },
  { value: 'electronics',        label: STORE_CATEGORY_LABELS.electronics,        emoji: '📱' },
  { value: 'hardware',           label: STORE_CATEGORY_LABELS.hardware,           emoji: '🔨' },
  { value: 'clothing',           label: STORE_CATEGORY_LABELS.clothing,           emoji: '👕' },
  { value: 'medical',            label: STORE_CATEGORY_LABELS.medical,            emoji: '💊' },
  { value: 'food_tea_stall',     label: STORE_CATEGORY_LABELS.food_tea_stall,     emoji: '☕' },
  { value: 'food_chaat_chinese', label: STORE_CATEGORY_LABELS.food_chaat_chinese, emoji: '🍜' },
  { value: 'specialty',          label: STORE_CATEGORY_LABELS.specialty,          emoji: '✨' },
  { value: 'service',            label: STORE_CATEGORY_LABELS.service,            emoji: '🛎️' },
];

// Live password requirements — must mirror backend Joi regex
const PASSWORD_CHECKS: { label: string; test: (p: string) => boolean }[] = [
  { label: 'At least 8 characters',   test: (p) => p.length >= 8 },
  { label: 'One uppercase letter (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter (a-z)', test: (p) => /[a-z]/.test(p) },
  { label: 'One number (0-9)',        test: (p) => /\d/.test(p) },
  { label: 'One special character (@$!%*?&#^()-_=+)', test: (p) => /[@$!%*?&#^()\-_=+]/.test(p) },
];

// ── Wizard state ───────────────────────────────────────────────
interface RegisterFormData {
  // Step 1
  phone: string;
  phone_verified_token: string;
  tokenExpiresAt: number | null;
  // Step 3
  owner_name: string;
  email: string;
  password: string;
  confirm_password: string;
  // Step 2
  store_name: string;
  store_category: string;
  store_description: string;
  address_line1: string;
  address_line2: string;
  landmark: string;
  pincode: string;
  area_id: string | null;
  latitude: number | null;
  longitude: number | null;
  // Step 3 — business settings
  min_order_value: number;
  delivery_radius_km: number;
  accepts_cod: boolean;
  // Step 3 — tax & legal
  gstin: string;
  pan_number: string;
  udyog_aadhaar: string;
}

const initialFormData: RegisterFormData = {
  phone: '',
  phone_verified_token: '',
  tokenExpiresAt: null,
  owner_name: '',
  email: '',
  password: '',
  confirm_password: '',
  store_name: '',
  store_category: '',
  store_description: '',
  address_line1: '',
  address_line2: '',
  landmark: '',
  pincode: '',
  area_id: null,
  latitude: null,
  longitude: null,
  min_order_value: 0,
  delivery_radius_km: 5,
  accepts_cod: true,
  gstin: '',
  pan_number: '',
  udyog_aadhaar: '',
};

type Update = (patch: Partial<RegisterFormData>) => void;

// ═══════════════════════════════════════════════════════════════
// STEP 1 — Phone Verification
// ═══════════════════════════════════════════════════════════════
function Step1Phone({ data, update, onNext }: { data: RegisterFormData; update: Update; onNext: () => void }) {
  const [phase, setPhase] = useState<'verified' | 'phone' | 'otp'>(data.phone_verified_token ? 'verified' : 'phone');
  const [phone, setPhone] = useState(data.phone || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [existingAccount, setExistingAccount] = useState(false);
  const [redirectQuery, setRedirectQuery] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [resendIn, setResendIn] = useState(60);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const isValid = /^[6-9]\d{9}$/.test(phone);

  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get('redirect');
    if (r) setRedirectQuery(`?redirect=${encodeURIComponent(r)}`);
  }, []);

  useEffect(() => {
    if (phase !== 'otp') return;
    const t = setInterval(() => setResendIn((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const sendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isValid) { setError('Enter a valid 10-digit Indian mobile number'); return; }
    setLoading(true); setError(''); setExistingAccount(false);
    try {
      await apiPost('/auth/merchant/send-otp', { phone, purpose: 'register' });
      toast.success(`OTP sent to ${phone.slice(0, 5)}XXXXX`);
      setOtp(['', '', '', '', '', '']);
      setResendIn(60);
      setPhase('otp');
    } catch (err: any) {
      if (err?.response?.status === 409) setExistingAccount(true);
      else setError(getErrorMessage(err));
    } finally { setLoading(false); }
  };

  const verifyOtp = async (code: string) => {
    if (code.length !== 6) return;
    setLoading(true); setError('');
    try {
      const res = await apiPost<any>('/auth/merchant/verify-otp', { phone, otp: code, purpose: 'register' });
      const token = res.data.phone_verified_token;
      update({ phone, phone_verified_token: token, tokenExpiresAt: Date.now() + 15 * 60 * 1000 });
      toast.success('Phone verified! 🎉');
      onNext();
    } catch (err) {
      setError(getErrorMessage(err));
      setOtp(['', '', '', '', '', '']);
      refs.current[0]?.focus();
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (phase === 'otp' && otp.every((d) => d !== '')) verifyOtp(otp.join(''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  const handleChange = (i: number, v: string) => {
    if (!/^\d*$/.test(v)) return;
    const next = [...otp]; next[i] = v.slice(-1); setOtp(next);
    if (v && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) {
      const next = [...otp]; next[i - 1] = ''; setOtp(next);
      refs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (p.length === 6) setOtp(p.split(''));
  };

  const resend = async () => {
    if (resendIn > 0) return;
    try {
      await apiPost('/auth/merchant/send-otp', { phone, purpose: 'register' });
      setResendIn(60); setOtp(['', '', '', '', '', '']);
      toast.success('New OTP sent!');
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  if (phase === 'verified') {
    return (
      <motion.div key="verified" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}>
        <h2 className="font-display text-2xl font-bold text-surface-900 mb-1">Phone Verified</h2>
        <p className="text-surface-500 text-sm mb-7">You&apos;re all set to continue your registration</p>
        <div className="flex items-center gap-3 border-2 border-green-200 bg-green-50 rounded-xl px-4 py-3.5 mb-5">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <span className="font-semibold text-surface-900">+91 {data.phone}</span>
        </div>
        <button onClick={onNext} className={PRIMARY_BTN}>
          Continue <ArrowRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => { update({ phone: '', phone_verified_token: '', tokenExpiresAt: null }); setPhone(''); setPhase('phone'); }}
          className="w-full text-center text-xs font-semibold text-surface-400 hover:text-surface-700 mt-4"
        >
          Use a different number
        </button>
      </motion.div>
    );
  }

  if (phase === 'phone') {
    return (
      <motion.div key="phone" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}>
        <h2 className="font-display text-2xl font-bold text-surface-900 mb-1">Register Your Store</h2>
        <p className="text-surface-500 text-sm mb-7">Enter your mobile number to get started</p>
        <form onSubmit={sendOtp} className="space-y-4">
          <div>
            <div className="flex items-center gap-2 border-2 border-surface-200 rounded-xl px-4 py-3.5
                            focus-within:border-[#1E3A8A] transition-colors bg-white">
              <span className="text-base">🇮🇳</span>
              <span className="text-sm font-bold text-surface-500">+91</span>
              <span className="w-px h-4 bg-surface-200" />
              <input
                type="tel" value={phone} inputMode="numeric" autoFocus
                onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(''); setExistingAccount(false); }}
                placeholder="9876543210"
                className="flex-1 bg-transparent text-surface-900 font-semibold text-lg focus:outline-none tracking-wider"
              />
              {isValid && <CheckCircle2 className="w-5 h-5 text-green-600" />}
            </div>
            {error && <p className="text-red-500 text-xs font-medium mt-2">{error}</p>}
            {existingAccount && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 mt-2 text-sm text-amber-800">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  An account with this number already exists.{' '}
                  <Link href={`/merchant/login${redirectQuery}`} className="font-bold underline">
                    Go to Merchant Login →
                  </Link>
                </span>
              </div>
            )}
          </div>
          <button type="submit" disabled={!isValid || loading} className={PRIMARY_BTN}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <>Send OTP <ArrowRight className="w-4 h-4" /></>}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-surface-500">
          Already registered?{' '}
          <Link href={`/merchant/login${redirectQuery}`} className="text-[#1E3A8A] font-bold hover:underline">
            Log in
          </Link>
        </p>
      </motion.div>
    );
  }

  // phase === 'otp'
  return (
    <motion.div key="otp" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
      <button onClick={() => setPhase('phone')} className="text-surface-500 text-sm font-semibold mb-5 hover:text-surface-800">← Back</button>
      <h2 className="font-display text-2xl font-bold text-surface-900 mb-1">Enter OTP</h2>
      <p className="text-surface-500 text-sm mb-7">Sent to <strong className="text-surface-900">+91 {phone}</strong></p>

      <div className="flex gap-3 justify-center mb-5" onPaste={handlePaste}>
        {otp.map((digit, i) => (
          <input key={i} ref={(el) => { refs.current[i] = el; }}
            type="text" inputMode="numeric" maxLength={1} value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKey(i, e)}
            disabled={loading} autoFocus={i === 0}
            className={clsx(
              'w-12 h-14 text-center text-2xl font-black border-2 rounded-xl focus:outline-none transition-all',
              digit ? 'border-[#1E3A8A] bg-blue-50 text-[#1E3A8A]' : 'border-surface-200 bg-white',
              'focus:border-[#1E3A8A] focus:bg-blue-50',
              loading && 'opacity-60 cursor-not-allowed'
            )}
          />
        ))}
      </div>

      {error && <p className="text-red-500 text-sm text-center font-medium mb-3">{error}</p>}
      {loading && (
        <div className="flex justify-center mb-3 text-[#1E3A8A] text-sm font-semibold gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Verifying…
        </div>
      )}

      <div className="flex items-center justify-center gap-2 text-xs">
        <span className="text-surface-400">Didn&apos;t receive?</span>
        <button onClick={resend} disabled={resendIn > 0}
          className="font-bold text-[#1E3A8A] disabled:text-surface-400 disabled:cursor-not-allowed">
          <RefreshCw className="w-3 h-3 inline mr-1" />
          {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend'}
        </button>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STEP 2 — Store Details
// ═══════════════════════════════════════════════════════════════
function Step2Store({ data, update, onNext, onBack }: { data: RegisterFormData; update: Update; onNext: () => void; onBack: () => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showArea, setShowArea] = useState(false);
  const [areaQuery, setAreaQuery] = useState('');
  const [areaResults, setAreaResults] = useState<any[]>([]);
  const [areaLoading, setAreaLoading] = useState(false);
  const [selectedArea, setSelectedArea] = useState<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const searchAreas = useCallback(async (q: string) => {
    if (q.length < 2) { setAreaResults([]); return; }
    setAreaLoading(true);
    try {
      const endpoint = /^\d{6}$/.test(q) ? `/areas/pincode/${q}` : `/areas/search?q=${encodeURIComponent(q)}&limit=8`;
      const res = await apiGet<any>(endpoint);
      const areas = res.data?.areas || res.data || [];
      setAreaResults(Array.isArray(areas) ? areas : [areas].filter(Boolean));
    } catch { setAreaResults([]); }
    finally { setAreaLoading(false); }
  }, []);

  const handleAreaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAreaQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchAreas(val), 300);
  };

  const selectArea = (area: any) => {
    setSelectedArea(area);
    setAreaResults([]);
    setAreaQuery(area.name);
    update({ area_id: area.id ?? null, latitude: area.latitude ?? null, longitude: area.longitude ?? null });
  };

  const clearArea = () => {
    setSelectedArea(null);
    setAreaQuery('');
    setAreaResults([]);
    update({ area_id: null, latitude: null, longitude: null });
  };

  const validate = () => {
    const e: Record<string, string> = {};
    const name = data.store_name.trim();
    if (name.length < 2 || name.length > 300) e.store_name = 'Store name must be 2-300 characters';
    if (!data.store_category) e.store_category = 'Please select a category';
    if (!/^\d{6}$/.test(data.pincode)) e.pincode = 'Enter a valid 6-digit pincode';
    const addr = data.address_line1.trim();
    if (addr.length < 5 || addr.length > 500) e.address_line1 = 'Address must be 5-500 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  return (
    <motion.div key="step2" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}>
      <h2 className="font-display text-2xl font-bold text-surface-900 mb-1">Store Details</h2>
      <p className="text-surface-500 text-sm mb-6">Tell us about your store</p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">Store Name *</label>
          <input value={data.store_name} onChange={(e) => update({ store_name: e.target.value })}
            placeholder="e.g. Sharma General Store" className={INPUT_CLS} />
          {errors.store_name && <p className="text-red-500 text-xs font-medium mt-1.5">{errors.store_name}</p>}
        </div>

        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">Store Category *</label>
          <div className="grid grid-cols-2 gap-2">
            {STORE_CATEGORIES.map((cat) => {
              const color = getBrandColor(cat.value);
              const active = data.store_category === cat.value;
              return (
                <button
                  key={cat.value} type="button"
                  onClick={() => update({ store_category: cat.value })}
                  className={clsx(
                    'flex flex-col items-center gap-1 p-3 rounded-2xl border-2 transition-all text-center',
                    !active && 'border-surface-200 hover:border-surface-300 bg-white'
                  )}
                  style={active ? { borderColor: color, backgroundColor: `${color}14` } : undefined}
                >
                  <span className="text-2xl">{cat.emoji}</span>
                  <span className="text-xs font-bold leading-tight" style={active ? { color } : { color: '#374151' }}>
                    {cat.label}
                  </span>
                </button>
              );
            })}
          </div>
          {errors.store_category && <p className="text-red-500 text-xs font-medium mt-1.5">{errors.store_category}</p>}
        </div>

        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">Store Description (optional)</label>
          <textarea value={data.store_description} onChange={(e) => update({ store_description: e.target.value })} rows={3}
            placeholder="What do you sell? What makes your store special?" className={INPUT_CLS} />
        </div>

        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">Pincode *</label>
          <input value={data.pincode} onChange={(e) => update({ pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
            inputMode="numeric" placeholder="410210" className={INPUT_CLS} />
          {errors.pincode && <p className="text-red-500 text-xs font-medium mt-1.5">{errors.pincode}</p>}
        </div>

        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">Address Line 1 *</label>
          <input value={data.address_line1} onChange={(e) => update({ address_line1: e.target.value })}
            placeholder="Shop no., building, street" className={INPUT_CLS} />
          {errors.address_line1 && <p className="text-red-500 text-xs font-medium mt-1.5">{errors.address_line1}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">Address Line 2</label>
            <input value={data.address_line2} onChange={(e) => update({ address_line2: e.target.value })} placeholder="Optional" className={INPUT_CLS} />
          </div>
          <div>
            <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">Landmark</label>
            <input value={data.landmark} onChange={(e) => update({ landmark: e.target.value })} placeholder="Optional" className={INPUT_CLS} />
          </div>
        </div>

        {/* Optional delivery area link */}
        <div className="border border-surface-200 rounded-xl overflow-hidden">
          <button type="button" onClick={() => setShowArea((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-surface-700 hover:bg-surface-50 transition-colors">
            <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-surface-400" /> Link to a delivery area (optional)</span>
            {showArea ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <AnimatePresence>
            {showArea && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="px-4 pb-4 space-y-3">
                  <p className="text-xs text-surface-500">
                    Linking an area helps customers discover your store more accurately. Skip this and set it up later if you&apos;re not sure.
                  </p>
                  {selectedArea ? (
                    <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                      <span className="flex items-center gap-2 text-sm font-semibold text-surface-900">
                        <CheckCircle2 className="w-4 h-4 text-green-600" /> {selectedArea.name}
                      </span>
                      <button type="button" onClick={clearArea} className="text-xs font-bold text-surface-400 hover:text-red-500">Remove</button>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="flex items-center gap-2 border-2 border-surface-200 rounded-xl px-3 py-2.5 focus-within:border-[#1E3A8A] transition-colors">
                        <Search className="w-4 h-4 text-surface-400 flex-shrink-0" />
                        <input value={areaQuery} onChange={handleAreaChange} placeholder="Search area name or pincode"
                          className="flex-1 bg-transparent text-sm text-surface-900 focus:outline-none" />
                        {areaLoading && <Loader2 className="w-4 h-4 text-surface-400 animate-spin" />}
                      </div>
                      {areaResults.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-card-hover border border-surface-100 z-20 overflow-hidden max-h-48 overflow-y-auto">
                          {areaResults.map((area) => (
                            <button key={area.id} type="button" onClick={() => selectArea(area)}
                              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-blue-50 transition-colors text-left border-b border-surface-100 last:border-0">
                              <MapPin className="w-3.5 h-3.5 text-surface-400 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-semibold text-surface-900">{area.name}</p>
                                <p className="text-xs text-surface-500">{area.city_name} · {area.pincode}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex gap-3 mt-7">
        <button onClick={onBack} className="btn-ghost flex-1">← Back</button>
        <button onClick={() => { if (validate()) onNext(); }} className={clsx(PRIMARY_BTN, 'flex-[2]')}>
          Continue <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STEP 3 — Owner Account & Business Settings
// ═══════════════════════════════════════════════════════════════
function Step3Owner({ data, update, onNext, onBack }: { data: RegisterFormData; update: Update; onNext: () => void; onBack: () => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showBusiness, setShowBusiness] = useState(true);
  const [showTax, setShowTax] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    const name = data.owner_name.trim();
    if (name.length < 2 || name.length > 200) e.owner_name = 'Name must be 2-200 characters';
    if (data.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) e.email = 'Enter a valid email address';
    const pwOk = data.password.length <= 128 && PASSWORD_CHECKS.every((c) => c.test(data.password));
    if (!pwOk) e.password = 'Password does not meet all requirements';
    if (data.confirm_password !== data.password) e.confirm_password = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  return (
    <motion.div key="step3" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}>
      <h2 className="font-display text-2xl font-bold text-surface-900 mb-1">Owner Account</h2>
      <p className="text-surface-500 text-sm mb-6">Set up your login credentials</p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">Your Name *</label>
          <input value={data.owner_name} onChange={(e) => update({ owner_name: e.target.value })} placeholder="Full name" className={INPUT_CLS} />
          {errors.owner_name && <p className="text-red-500 text-xs font-medium mt-1.5">{errors.owner_name}</p>}
        </div>

        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">Email (optional)</label>
          <input value={data.email} onChange={(e) => update({ email: e.target.value })} type="email" placeholder="you@example.com" className={INPUT_CLS} />
          {errors.email && <p className="text-red-500 text-xs font-medium mt-1.5">{errors.email}</p>}
        </div>

        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">Password *</label>
          <div className="relative">
            <input value={data.password} onChange={(e) => update({ password: e.target.value })} type={showPass ? 'text' : 'password'}
              placeholder="Create a password" className={clsx(INPUT_CLS, 'pr-11')} />
            <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700">
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-1">
            {PASSWORD_CHECKS.map((c) => {
              const ok = c.test(data.password);
              return (
                <span key={c.label} className={clsx('flex items-center gap-1.5 text-xs', ok ? 'text-green-600' : 'text-surface-400')}>
                  {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />} {c.label}
                </span>
              );
            })}
          </div>
          {errors.password && <p className="text-red-500 text-xs font-medium mt-1.5">{errors.password}</p>}
        </div>

        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">Confirm Password *</label>
          <div className="relative">
            <input value={data.confirm_password} onChange={(e) => update({ confirm_password: e.target.value })} type={showConfirm ? 'text' : 'password'}
              placeholder="Re-enter your password" className={clsx(INPUT_CLS, 'pr-11')} />
            <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700">
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.confirm_password && <p className="text-red-500 text-xs font-medium mt-1.5">{errors.confirm_password}</p>}
        </div>

        {/* Business settings */}
        <div className="border border-surface-200 rounded-xl overflow-hidden">
          <button type="button" onClick={() => setShowBusiness((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-surface-700 hover:bg-surface-50 transition-colors">
            <span className="flex items-center gap-2">⚙️ Business Settings</span>
            {showBusiness ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <AnimatePresence>
            {showBusiness && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">Min. Order Value (₹)</label>
                      <input type="number" min={0} max={10000} value={data.min_order_value}
                        onChange={(e) => update({ min_order_value: Math.max(0, Math.min(10000, Number(e.target.value) || 0)) })} className={INPUT_CLS} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">Delivery Radius (km)</label>
                      <input type="number" min={0.5} max={50} step={0.5} value={data.delivery_radius_km}
                        onChange={(e) => update({ delivery_radius_km: Math.max(0.5, Math.min(50, Number(e.target.value) || 5)) })} className={INPUT_CLS} />
                    </div>
                  </div>
                  <label className="flex items-center justify-between px-1">
                    <span className="text-sm font-semibold text-surface-700">Accept Cash on Delivery</span>
                    <button type="button" onClick={() => update({ accepts_cod: !data.accepts_cod })}>
                      {data.accepts_cod ? <ToggleRight className="w-8 h-8 text-[#1E3A8A]" /> : <ToggleLeft className="w-8 h-8 text-surface-300" />}
                    </button>
                  </label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Tax & legal */}
        <div className="border border-surface-200 rounded-xl overflow-hidden">
          <button type="button" onClick={() => setShowTax((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-surface-700 hover:bg-surface-50 transition-colors">
            <span className="flex items-center gap-2">🪪 Tax &amp; Legal (optional — can add later from dashboard)</span>
            {showTax ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <AnimatePresence>
            {showTax && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="px-4 pb-4 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">GSTIN</label>
                    <input value={data.gstin} onChange={(e) => update({ gstin: e.target.value.toUpperCase() })} placeholder="22AAAAA0000A1Z5" className={INPUT_CLS} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">PAN Number</label>
                    <input value={data.pan_number} onChange={(e) => update({ pan_number: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" className={INPUT_CLS} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">Udyog Aadhaar</label>
                    <input value={data.udyog_aadhaar} onChange={(e) => update({ udyog_aadhaar: e.target.value.toUpperCase() })} placeholder="UDYAM-MH-27-0000001" className={INPUT_CLS} />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex gap-3 mt-7">
        <button onClick={onBack} className="btn-ghost flex-1">← Back</button>
        <button onClick={() => { if (validate()) onNext(); }} className={clsx(PRIMARY_BTN, 'flex-[2]')}>
          Review &amp; Submit <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STEP 4 — Review & Submit
// ═══════════════════════════════════════════════════════════════
function Step4Submit({ data, onBack, onResetPhone, onSuccess }: {
  data: RegisterFormData; onBack: () => void; onResetPhone: () => void; onSuccess: (loggedIn: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setUser, setTokens } = useAuthStore();

  const expired = !data.tokenExpiresAt || Date.now() > data.tokenExpiresAt;

  const submit = async () => {
    if (expired) { setError('Your phone verification has expired. Please verify again.'); return; }
    setLoading(true); setError('');
    try {
      await apiPost('/auth/merchant/register', {
        phone_verified_token: data.phone_verified_token,
        owner_name: data.owner_name.trim(),
        email: data.email.trim() || undefined,
        password: data.password,
        confirm_password: data.confirm_password,
        store_name: data.store_name.trim(),
        store_category: data.store_category,
        store_description: data.store_description.trim() || undefined,
        address_line1: data.address_line1.trim(),
        address_line2: data.address_line2.trim() || undefined,
        landmark: data.landmark.trim() || undefined,
        pincode: data.pincode,
        area_id: data.area_id || undefined,
        latitude: data.latitude ?? undefined,
        longitude: data.longitude ?? undefined,
        min_order_value: data.min_order_value,
        delivery_radius_km: data.delivery_radius_km,
        accepts_cod: data.accepts_cod,
        gstin: data.gstin.trim() || undefined,
        pan_number: data.pan_number.trim() || undefined,
        udyog_aadhaar: data.udyog_aadhaar.trim() || undefined,
      });

      try {
        const loginRes = await apiPost<any>('/auth/merchant/login', { phone: data.phone, password: data.password });
        const { merchant, tokens } = loginRes.data;
        tokenStorage.setAccess(tokens.access_token);
        tokenStorage.setRefresh(tokens.refresh_token);
        setUser(merchant, 'merchant');
        setTokens(tokens.access_token, tokens.refresh_token);
        onSuccess(true);
      } catch {
        onSuccess(false);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setLoading(false); }
  };

  const summary: { label: string; value: string }[] = [
    { label: 'Store Name', value: data.store_name },
    { label: 'Category', value: STORE_CATEGORY_LABELS[data.store_category] || data.store_category },
    { label: 'Address', value: `${[data.address_line1, data.address_line2, data.landmark].filter(Boolean).join(', ')} - ${data.pincode}` },
    { label: 'Owner', value: data.owner_name },
    { label: 'Phone', value: `+91 ${data.phone}` },
    ...(data.email ? [{ label: 'Email', value: data.email }] : []),
    { label: 'Min. Order Value', value: `₹${data.min_order_value}` },
    { label: 'Delivery Radius', value: `${data.delivery_radius_km} km` },
    { label: 'Cash on Delivery', value: data.accepts_cod ? 'Accepted' : 'Not accepted' },
  ];

  return (
    <motion.div key="step4" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}>
      <h2 className="font-display text-2xl font-bold text-surface-900 mb-1">Review &amp; Submit</h2>
      <p className="text-surface-500 text-sm mb-6">Check your details before submitting</p>

      <div className="space-y-2 mb-6">
        {summary.map((row) => (
          <div key={row.label} className="flex justify-between gap-4 text-sm py-1.5 border-b border-surface-100 last:border-0">
            <span className="text-surface-500 font-medium flex-shrink-0">{row.label}</span>
            <span className="text-surface-900 font-semibold text-right">{row.value}</span>
          </div>
        ))}
      </div>

      {expired && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Your phone verification has expired.</p>
            <p className="mt-1">Please verify your phone again to continue.</p>
            <button onClick={onResetPhone} className="mt-2 text-xs font-bold text-[#1E3A8A] underline">Verify Phone Again</button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} disabled={loading} className="btn-ghost flex-1">← Back</button>
        <button onClick={submit} disabled={loading || expired} className={clsx(PRIMARY_BTN, 'flex-[2]')}>
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : <>Submit Application <ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STEP 5 — Success / Pending Review
// ═══════════════════════════════════════════════════════════════
function Step5Success({ storeName, loggedIn }: { storeName: string; loggedIn: boolean }) {
  const router = useRouter();
  return (
    <motion.div key="step5" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
      <div className="text-center mb-6">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="font-display text-2xl font-bold text-surface-900 mb-2">Application Submitted!</h2>
        <p className="text-surface-500 text-sm leading-relaxed">
          Your store &quot;<strong className="text-surface-900">{storeName}</strong>&quot; is under review.
          We&apos;ll notify you within 1-2 business days.
        </p>
        <span className="badge bg-amber-100 text-amber-700 mt-4 inline-flex">KYC: Pending</span>
      </div>

      {loggedIn ? (
        <div className="space-y-3">
          <button onClick={() => router.push('/merchant-dashboard?tab=kyc')} className={PRIMARY_BTN}>
            Upload KYC Documents <ArrowRight className="w-4 h-4" />
          </button>
          <button onClick={() => router.push('/merchant-dashboard')} className="btn-ghost w-full">
            Go to Dashboard
          </button>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-sm text-surface-500 mb-3">Registration successful — please log in to continue.</p>
          <Link href="/merchant/login" className={PRIMARY_BTN}>
            Go to Merchant Login <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════
export default function MerchantRegisterPage() {
  const [step, setStep] = useState(1);
  const [loggedIn, setLoggedIn] = useState(true);
  const [formData, setFormData] = useState<RegisterFormData>(initialFormData);

  const update: Update = (patch) => setFormData((f) => ({ ...f, ...patch }));

  const handleStep4Success = (loginSucceeded: boolean) => {
    setLoggedIn(loginSucceeded);
    setStep(5);
  };

  const handleResetPhone = () => {
    update({ phone_verified_token: '', tokenExpiresAt: null });
    setStep(1);
  };

  return (
    <div className="min-h-screen bg-surface-50 flex">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-[#1E3A8A] p-12">
        <div>
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-lg">
              <Store className="w-6 h-6 text-[#1E3A8A]" />
            </div>
            <div>
              <p className="font-display text-xl font-extrabold text-white">MyLocalBazaar</p>
              <p className="text-[10px] font-semibold text-white/35 uppercase tracking-widest">Merchant Portal</p>
            </div>
          </div>
          <h1 className="font-display text-4xl font-extrabold text-white leading-tight mb-4">
            List Your Store<br />
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg,#22C55E,#60A5FA)' }}>
              In Minutes
            </span>
          </h1>
          <p className="text-white/60 text-base leading-relaxed">
            Join hundreds of local merchants selling to thousands of customers near you. Free to register — get approved in 1-2 business days.
          </p>
        </div>
        <div className="space-y-3">
          {[
            ['📱', 'Verify with OTP — no paperwork upfront'],
            ['🏪', 'Set up your storefront in 5 quick steps'],
            ['🪪', 'Add KYC documents anytime from your dashboard'],
            ['📈', 'Start selling once approved'],
          ].map(([icon, text]) => (
            <div key={text} className="flex items-center gap-3">
              <span className="text-xl">{icon}</span>
              <span className="text-white/70 text-sm">{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-lg">
          <div className="flex lg:hidden items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-xl bg-[#1E3A8A] flex items-center justify-center">
              <Store className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-extrabold text-surface-900">Merchant Portal</span>
          </div>

          {step <= 4 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-surface-500 uppercase tracking-wider">Step {step} of 5</span>
                <span className="text-xs font-bold text-[#1E3A8A]">{Math.round((step / 5) * 100)}%</span>
              </div>
              <div className="h-1.5 bg-surface-100 rounded-full overflow-hidden">
                <motion.div className="h-full bg-[#1E3A8A] rounded-full" animate={{ width: `${(step / 5) * 100}%` }} transition={{ duration: 0.3 }} />
              </div>
            </div>
          )}

          <div className="bg-white rounded-3xl shadow-card-hover p-8">
            <AnimatePresence mode="wait">
              {step === 1 && <Step1Phone key="step1" data={formData} update={update} onNext={() => setStep(2)} />}
              {step === 2 && <Step2Store key="step2" data={formData} update={update} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
              {step === 3 && <Step3Owner key="step3" data={formData} update={update} onNext={() => setStep(4)} onBack={() => setStep(2)} />}
              {step === 4 && <Step4Submit key="step4" data={formData} onBack={() => setStep(3)} onResetPhone={handleResetPhone} onSuccess={handleStep4Success} />}
              {step === 5 && <Step5Success key="step5" storeName={formData.store_name} loggedIn={loggedIn} />}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
