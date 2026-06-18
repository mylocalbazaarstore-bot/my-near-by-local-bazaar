'use client';
// src/app/login/page.tsx — Customer Login — MyLocalBazaar
//
// Two auth paths, selected by OTP_TEST_MODE:
//   • Test mode (default): backend phone-OTP flow (/auth/customer/send-otp +
//     /verify-otp). With the backend in dev OTP mode the code is a fixed 123456,
//     so there is no reCAPTCHA / Firebase SMS dependency.
//   • Production: Firebase phone auth (signInWithPhoneNumber + reCAPTCHA),
//     enabled by setting NEXT_PUBLIC_OTP_TEST_MODE='false'.

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Loader2, RefreshCw, CheckCircle2, Store } from 'lucide-react';
import { clsx } from 'clsx';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from 'firebase/auth';
import { apiPost, getErrorMessage, tokenStorage } from '@/lib/api';
import { getFirebaseAuth } from '@/lib/firebase';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

// Test mode uses the backend phone-OTP flow instead of Firebase. ON by default;
// set NEXT_PUBLIC_OTP_TEST_MODE='false' to switch back to Firebase + reCAPTCHA.
const OTP_TEST_MODE = process.env.NEXT_PUBLIC_OTP_TEST_MODE !== 'false';
// Fixed dev OTP shown/prefilled in test mode (mirrors backend OTP_FIXED_DEV_CODE).
const TEST_OTP = '123456';
const emptyOtp = () => ['', '', '', '', '', ''];
const initialOtp = () => (OTP_TEST_MODE ? TEST_OTP.split('') : emptyOtp());

// ── Invisible reCAPTCHA singleton (Firebase path only) ───────────
// signInWithPhoneNumber needs a RecaptchaVerifier bound to a DOM
// node that stays mounted across the phone -> OTP step transition.
let recaptchaVerifier: RecaptchaVerifier | null = null;

const getRecaptchaVerifier = (): RecaptchaVerifier => {
  if (!recaptchaVerifier) {
    recaptchaVerifier = new RecaptchaVerifier(getFirebaseAuth(), 'recaptcha-container', {
      size: 'invisible',
    });
  }
  return recaptchaVerifier;
};

const resetRecaptchaVerifier = () => {
  if (recaptchaVerifier) {
    try { recaptchaVerifier.clear(); } catch { /* already torn down */ }
    recaptchaVerifier = null;
  }
};

// Map Firebase Auth error codes to friendly, actionable messages
const firebaseErrorMessage = (err: any): string => {
  switch (err?.code) {
    case 'auth/invalid-phone-number':
      return 'Enter a valid 10-digit Indian mobile number';
    case 'auth/missing-phone-number':
      return 'Phone number is required';
    case 'auth/too-many-requests':
      return 'Too many attempts from this device. Please try again later.';
    case 'auth/quota-exceeded':
      return 'SMS limit reached for today. Please try again later.';
    case 'auth/invalid-verification-code':
      return 'Incorrect OTP. Please check and try again.';
    case 'auth/code-expired':
      return 'This OTP has expired. Please resend and try again.';
    case 'auth/captcha-check-failed':
      return 'Verification check failed. Please refresh the page and try again.';
    case 'auth/invalid-app-credential':
      return 'Verification service is temporarily unavailable. Please try again in a moment.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and try again.';
    default:
      return err?.message || 'Something went wrong. Please try again.';
  }
};

// ── Phone step ─────────────────────────────────────────────────
function PhoneStep({
  onSuccess,
}: {
  onSuccess: (phone: string, confirmation: ConfirmationResult | null) => void;
}) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isValid = /^[6-9]\d{9}$/.test(phone);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) { setError('Enter a valid 10-digit Indian mobile number'); return; }
    setLoading(true); setError('');
    try {
      if (OTP_TEST_MODE) {
        await apiPost('/auth/customer/send-otp', { phone, purpose: 'login' });
        toast.success(`Test mode — use OTP ${TEST_OTP}`);
        onSuccess(phone, null);
      } else {
        const appVerifier = getRecaptchaVerifier();
        const confirmation = await signInWithPhoneNumber(getFirebaseAuth(), `+91${phone}`, appVerifier);
        toast.success(`OTP sent to ${phone.slice(0, 5)}XXXXX`);
        onSuccess(phone, confirmation);
      }
    } catch (err: any) {
      setError(OTP_TEST_MODE ? getErrorMessage(err) : firebaseErrorMessage(err));
      if (!OTP_TEST_MODE) resetRecaptchaVerifier();
    }
    finally { setLoading(false); }
  };

  return (
    <motion.div key="phone" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}>
      <h2 className="font-display text-2xl font-bold text-surface-900 mb-1">Welcome back!</h2>
      <p className="text-surface-500 text-sm mb-7">Enter your mobile number to continue</p>
      <form onSubmit={send} className="space-y-4">
        <div>
          <div className="flex items-center gap-2 border-2 border-surface-200 rounded-xl px-4 py-3.5
                          focus-within:border-brand-green transition-colors bg-white">
            <span className="text-base">🇮🇳</span>
            <span className="text-sm font-bold text-surface-500">+91</span>
            <span className="w-px h-4 bg-surface-200" />
            <input
              type="tel" value={phone} inputMode="numeric" autoFocus
              onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(''); }}
              placeholder="9876543210"
              className="flex-1 bg-transparent text-surface-900 font-semibold text-lg focus:outline-none tracking-wider"
            />
            {isValid && <CheckCircle2 className="w-5 h-5 text-brand-green" />}
          </div>
          {error && <p className="text-red-500 text-xs font-medium mt-2">{error}</p>}
          {OTP_TEST_MODE && (
            <p className="text-amber-600 text-xs font-medium mt-2">
              ⚙️ Test mode active — OTP is <strong>{TEST_OTP}</strong>
            </p>
          )}
        </div>
        <button type="submit" disabled={!isValid || loading} className="btn-primary w-full text-base py-3.5">
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <>Get OTP <ArrowRight className="w-4 h-4" /></>}
        </button>
      </form>
    </motion.div>
  );
}

// ── OTP step ───────────────────────────────────────────────────
function OTPStep({
  phone,
  confirmation,
  onBack,
  onResend,
}: {
  phone: string;
  confirmation: ConfirmationResult | null;
  onBack: () => void;
  onResend: () => Promise<ConfirmationResult | null>;
}) {
  const router = useRouter();
  const { setUser, setTokens } = useAuthStore();
  const [otp, setOtp] = useState(initialOtp);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(60);
  const [confirmationResult, setConfirmationResult] = useState(confirmation);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const t = setInterval(() => setResendIn((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (otp.every((d) => d !== '')) verify(otp.join(''));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  const verify = async (code: string) => {
    if (code.length !== 6) return;
    setLoading(true); setError('');
    try {
      let res: any;
      if (OTP_TEST_MODE) {
        res = await apiPost<any>('/auth/customer/verify-otp', { phone, otp: code, purpose: 'login' });
      } else {
        if (!confirmationResult) throw new Error('Verification session expired. Please resend the OTP.');
        const credential = await confirmationResult.confirm(code);
        const idToken = await credential.user.getIdToken();
        res = await apiPost<any>('/auth/customer/firebase-login', { id_token: idToken });
      }
      const { user, tokens } = res.data as any;
      tokenStorage.setAccess(tokens.access_token);
      tokenStorage.setRefresh(tokens.refresh_token);
      setUser(user, 'customer');
      setTokens(tokens.access_token, tokens.refresh_token);
      toast.success(`Welcome, ${user.full_name?.split(' ')[0] || 'there'}! 👋`);
      const redirect = new URLSearchParams(window.location.search).get('redirect');
      router.replace(redirect || '/dashboard');
    } catch (err: any) {
      setError(!OTP_TEST_MODE && err?.code ? firebaseErrorMessage(err) : getErrorMessage(err));
      setOtp(emptyOtp());
      refs.current[0]?.focus();
    } finally { setLoading(false); }
  };

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
      const fresh = await onResend();
      if (fresh) setConfirmationResult(fresh);
      setResendIn(60); setOtp(OTP_TEST_MODE ? initialOtp() : emptyOtp());
      toast.success(OTP_TEST_MODE ? `Test mode — OTP is ${TEST_OTP}` : 'New OTP sent!');
    } catch (err: any) { toast.error(OTP_TEST_MODE ? getErrorMessage(err) : firebaseErrorMessage(err)); }
  };

  return (
    <motion.div key="otp" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
      <button onClick={onBack} className="text-surface-500 text-sm font-semibold mb-5 hover:text-surface-800">← Back</button>
      <h2 className="font-display text-2xl font-bold text-surface-900 mb-1">Enter OTP</h2>
      <p className="text-surface-500 text-sm mb-7">Sent to <strong className="text-surface-900">+91 {phone}</strong></p>

      <div className="flex gap-2 sm:gap-3 justify-center mb-5" onPaste={handlePaste}>
        {otp.map((digit, i) => (
          <input key={i} ref={(el) => { refs.current[i] = el; }}
            type="text" inputMode="numeric" maxLength={1} value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKey(i, e)}
            disabled={loading} autoFocus={i === 0}
            className={clsx(
              'w-9 h-11 sm:w-12 sm:h-14 text-lg sm:text-2xl text-center font-black border-2 rounded-xl focus:outline-none transition-all',
              digit ? 'border-brand-green bg-green-50 text-brand-green' : 'border-surface-200 bg-white',
              'focus:border-brand-green focus:bg-green-50',
              loading && 'opacity-60 cursor-not-allowed'
            )}
          />
        ))}
      </div>

      {OTP_TEST_MODE && !error && (
        <p className="text-amber-600 text-xs text-center font-medium mb-3">
          ⚙️ Test mode — OTP prefilled ({TEST_OTP})
        </p>
      )}
      {error && <p className="text-red-500 text-sm text-center font-medium mb-3">{error}</p>}
      {loading && (
        <div className="flex justify-center mb-3 text-brand-green text-sm font-semibold gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Verifying…
        </div>
      )}

      <div className="flex items-center justify-center gap-2 text-xs">
        <span className="text-surface-400">Didn't receive?</span>
        <button onClick={resend} disabled={resendIn > 0}
          className="font-bold text-brand-green disabled:text-surface-400 disabled:cursor-not-allowed">
          <RefreshCw className="w-3 h-3 inline mr-1" />
          {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend'}
        </button>
      </div>
    </motion.div>
  );
}

// ── Page ───────────────────────────────────────────────────────
export default function LoginPage() {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);

  const handlePhoneSuccess = (p: string, conf: ConfirmationResult | null) => {
    setPhone(p);
    setConfirmation(conf);
    setStep('otp');
  };

  const handleResend = async (): Promise<ConfirmationResult | null> => {
    if (OTP_TEST_MODE) {
      await apiPost('/auth/customer/send-otp', { phone, purpose: 'login' });
      return null;
    }
    resetRecaptchaVerifier();
    const appVerifier = getRecaptchaVerifier();
    const conf = await signInWithPhoneNumber(getFirebaseAuth(), `+91${phone}`, appVerifier);
    setConfirmation(conf);
    return conf;
  };

  return (
    <div className="min-h-screen bg-surface-50 flex">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-brand-dark p-12">
        <div>
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-green to-brand-orange flex items-center justify-center">
              <span className="text-white font-display font-black text-lg">M</span>
            </div>
            <span className="font-display text-xl font-extrabold text-white">MyLocalBazaar</span>
          </div>
          <h1 className="font-display text-4xl font-extrabold text-white leading-tight mb-4">
            Your Local Market,{' '}
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg,#22C55E,#F97316)' }}>
              Digitally Connected
            </span>
          </h1>
          <p className="text-white/60 text-base leading-relaxed">
            Shop from 500+ verified local stores in Kharghar, Navi Mumbai. Same-day delivery, doctor bookings, home services.
          </p>
        </div>
        <div className="space-y-3">
          {[['🛒','500+ local stores'],['🚴','Same-day delivery'],['👨‍⚕️','Doctor & salon bookings'],['💳','Secure payments']].map(([icon, text]) => (
            <div key={text} className="flex items-center gap-3">
              <span className="text-xl">{icon}</span>
              <span className="text-white/70 text-sm">{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Auth panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="flex lg:hidden items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-green to-brand-orange flex items-center justify-center">
              <span className="text-white font-display font-black text-sm">M</span>
            </div>
            <span className="font-display font-extrabold text-surface-900">MyLocalBazaar</span>
          </div>

          <div className="bg-white rounded-3xl shadow-card-hover p-8">
            <AnimatePresence mode="wait">
              {step === 'phone'
                ? <PhoneStep key="phone" onSuccess={handlePhoneSuccess} />
                : <OTPStep   key="otp"   phone={phone} confirmation={confirmation} onBack={() => setStep('phone')} onResend={handleResend} />
              }
            </AnimatePresence>
          </div>

          <p className="mt-6 text-center text-sm text-surface-500">
            Own a business?{' '}
            <Link href="/merchant/login" className="text-brand-orange font-bold hover:underline inline-flex items-center gap-1">
              <Store className="w-3.5 h-3.5" /> Merchant Login
            </Link>
          </p>
        </div>
      </div>

      {/* Invisible reCAPTCHA mount point for Firebase Phone Auth */}
      <div id="recaptcha-container" />
    </div>
  );
}
