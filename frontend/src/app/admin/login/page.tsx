'use client';
// src/app/admin/login/page.tsx
// ─────────────────────────────────────────────────────────────
// Admin Login — MyLocalBazaar (2-Step: password → 2FA OTP)
// Step 1: POST /auth/admin/login → temp_token
// Step 2: POST /auth/admin/verify-2fa → JWT tokens
// ─────────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Shield, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { apiPost, getErrorMessage, tokenStorage } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

// ── Step 1: Email + Password ───────────────────────────────────
function PasswordStep({
  onSuccess,
}: {
  onSuccess: (tempToken: string, adminName: string) => void;
}) {
  const [email,    setEmail]    = useState('admin@mylocalbazaar.store');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Email and password are required'); return; }
    setLoading(true); setError('');
    try {
      const res = await apiPost<any>('/auth/admin/login', { email, password });
      const { temp_token, admin_name } = (res as any).data;
      toast.success('Password verified — enter your 2FA code');
      onSuccess(temp_token, admin_name);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div key="password" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}>
      <div className="flex items-center gap-3 mb-7">
        <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
          <Shield className="w-5 h-5 text-red-600" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold text-surface-900 leading-tight">Admin Access</h2>
          <p className="text-xs text-surface-500">MyLocalBazaar control panel</p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
            Admin Email
          </label>
          <input
            type="email" value={email} autoComplete="username"
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            className="input-field" placeholder="admin@mylocalbazaar.store"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
            Password
          </label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'} value={password}
              autoComplete="current-password" autoFocus
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              className="input-field pr-10" placeholder="Enter admin password"
            />
            <button
              type="button" tabIndex={-1}
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-red-500 text-xs font-medium bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit" disabled={loading || !email || !password}
          className="btn-primary w-full bg-red-600 hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
          ) : (
            'Continue to 2FA →'
          )}
        </button>
      </form>
    </motion.div>
  );
}

// ── Step 2: 2FA OTP ────────────────────────────────────────────
function OTPStep({
  tempToken,
  adminName,
  onBack,
}: {
  tempToken: string;
  adminName: string;
  onBack:    () => void;
}) {
  const router = useRouter();
  const { setUser, setTokens } = useAuthStore();
  const [otp,      setOtp]      = useState(['', '', '', '', '', '']);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [resendIn, setResendIn] = useState(300); // 5 min window
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
      const res = await apiPost<any>('/auth/admin/verify-2fa', {
        temp_token: tempToken,
        otp:        code,
      });
      const { admin, tokens } = (res as any).data;

      // Persist tokens and set auth state as 'admin' role
      tokenStorage.setAccess(tokens.access_token);
      tokenStorage.setRefresh(tokens.refresh_token);
      setUser(admin, 'admin');
      setTokens(tokens.access_token, tokens.refresh_token);

      toast.success(`Welcome back, ${admin.full_name}!`);
      router.replace('/admin-dashboard');
    } catch (err) {
      setError(getErrorMessage(err));
      setOtp(['', '', '', '', '', '']);
      refs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
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

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <motion.div key="otp" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
      <button onClick={onBack} className="text-surface-500 text-sm font-semibold mb-5 hover:text-surface-800">
        ← Back
      </button>
      <h2 className="font-display text-xl font-bold text-surface-900 mb-1">Two-Factor Authentication</h2>
      <p className="text-surface-500 text-sm mb-2">
        Welcome, <strong className="text-surface-900">{adminName}</strong>. Enter the 6-digit OTP sent to your email.
      </p>
      {process.env.NODE_ENV !== 'production' && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-5 font-mono">
          DEV: use fixed OTP <strong>123456</strong>
        </p>
      )}

      <div className="flex gap-3 justify-center mb-5" onPaste={handlePaste}>
        {otp.map((digit, i) => (
          <input key={i}
            ref={(el) => { refs.current[i] = el; }}
            type="text" inputMode="numeric" maxLength={1} value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKey(i, e)}
            disabled={loading} autoFocus={i === 0}
            className={clsx(
              'w-12 h-14 text-center text-2xl font-black border-2 rounded-xl focus:outline-none transition-all',
              digit ? 'border-red-500 bg-red-50 text-red-600' : 'border-surface-200 bg-white',
              'focus:border-red-500 focus:bg-red-50',
              loading && 'opacity-60 cursor-not-allowed'
            )}
          />
        ))}
      </div>

      {error && <p className="text-red-500 text-sm text-center font-medium mb-3">{error}</p>}
      {loading && (
        <div className="flex justify-center mb-3 text-red-600 text-sm font-semibold gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Verifying…
        </div>
      )}

      <div className="text-center text-xs text-surface-400">
        OTP valid for {formatTime(resendIn)} · Check your email inbox
      </div>
    </motion.div>
  );
}

// ── Admin Login Page ───────────────────────────────────────────
export default function AdminLoginPage() {
  const { user, role, isHydrated } = useAuthStore();
  const router = useRouter();
  const [step,      setStep]      = useState<'password' | 'otp'>('password');
  const [tempToken, setTempToken] = useState('');
  const [adminName, setAdminName] = useState('');

  useEffect(() => {
    if (isHydrated && user && role === 'admin') {
      router.replace('/admin-dashboard');
    }
  }, [isHydrated, user, role, router]);

  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-green to-brand-orange
                            flex items-center justify-center">
              <span className="text-white font-display font-black">M</span>
            </div>
            <span className="font-display font-extrabold text-surface-900 text-lg">MyLocalBazaar</span>
          </div>
          <p className="text-xs text-surface-400 font-semibold uppercase tracking-widest">Admin Panel</p>
        </div>

        <div className="bg-white rounded-3xl shadow-card-hover p-8 border-t-4 border-red-500">
          <AnimatePresence mode="wait">
            {step === 'password' ? (
              <PasswordStep
                key="password"
                onSuccess={(token, name) => {
                  setTempToken(token);
                  setAdminName(name);
                  setStep('otp');
                }}
              />
            ) : (
              <OTPStep
                key="otp"
                tempToken={tempToken}
                adminName={adminName}
                onBack={() => setStep('password')}
              />
            )}
          </AnimatePresence>
        </div>

        <p className="mt-6 text-center text-xs text-surface-400">
          Restricted access — authorised personnel only
        </p>
      </div>
    </div>
  );
}
