'use client';
// src/app/merchant/login/page.tsx — Merchant Password Login — MyLocalBazaar

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, Store, AlertCircle, ArrowRight } from 'lucide-react';
import { apiPost, getErrorMessage, tokenStorage } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

export default function MerchantLoginPage() {
  const router = useRouter();
  const { setUser, setTokens } = useAuthStore();

  const [phone,    setPhone]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !password) { setError('Enter your phone and password'); return; }
    setLoading(true); setError('');

    try {
      const res = await apiPost<any>('/auth/merchant/login', { phone, password });
      const { merchant, tokens } = res.data as any;

      tokenStorage.setAccess(tokens.access_token);
      tokenStorage.setRefresh(tokens.refresh_token);
      setUser(merchant, 'merchant');
      setTokens(tokens.access_token, tokens.refresh_token);

      toast.success(`Welcome, ${merchant.store_name}! 🏪`);
      router.replace('/merchant-dashboard');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setLoading(false); }
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
            Grow Your Business<br />
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg,#22C55E,#60A5FA)' }}>
              With Digital India
            </span>
          </h1>
          <p className="text-white/60 text-base leading-relaxed">
            Manage your store, approve orders, track earnings, and reach thousands of local customers.
          </p>
        </div>
        <div className="space-y-3">
          {[['📦','Product & inventory management'],['🛒','Order approval dashboard'],['📊','Sales analytics & insights'],['💳','Weekly wallet settlements']].map(([icon, text]) => (
            <div key={text} className="flex items-center gap-3">
              <span className="text-xl">{icon}</span>
              <span className="text-white/70 text-sm">{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Login panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">

          <div className="flex lg:hidden items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-xl bg-[#1E3A8A] flex items-center justify-center">
              <Store className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-extrabold text-surface-900">Merchant Portal</span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl shadow-card-hover p-8"
          >
            <h2 className="font-display text-2xl font-bold text-surface-900 mb-1">Merchant Login</h2>
            <p className="text-surface-500 text-sm mb-7">Access your store dashboard</p>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-5 text-sm text-red-700"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Phone */}
              <div>
                <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">
                  Registered Phone
                </label>
                <div className="flex items-center gap-2 border-2 border-surface-200 rounded-xl px-4 py-3.5
                                focus-within:border-[#1E3A8A] transition-colors">
                  <span>🇮🇳</span>
                  <span className="text-sm font-bold text-surface-500">+91</span>
                  <span className="w-px h-4 bg-surface-200" />
                  <input
                    type="tel" value={phone} inputMode="numeric" autoFocus
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="9876543210"
                    className="flex-1 bg-transparent text-surface-900 font-semibold text-lg focus:outline-none tracking-wider"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="flex items-center gap-2 border-2 border-surface-200 rounded-xl px-4 py-3.5
                                focus-within:border-[#1E3A8A] transition-colors">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="flex-1 bg-transparent text-surface-900 font-semibold focus:outline-none"
                  />
                  <button type="button" onClick={() => setShowPass((v) => !v)}
                          className="text-surface-400 hover:text-surface-700 transition-colors">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !phone || !password}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl
                           bg-[#1E3A8A] text-white font-bold text-base
                           hover:bg-blue-900 active:scale-95 transition-all
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
                  : <>Access Dashboard <ArrowRight className="w-4 h-4" /></>
                }
              </button>
            </form>

            <div className="mt-5 pt-5 border-t border-surface-100 text-center space-y-2">
              <p className="text-xs text-surface-400">
                Not registered yet?{' '}
                <Link href="/merchant/register" className="text-[#1E3A8A] font-bold hover:underline">
                  Register your store
                </Link>
              </p>
              <p className="text-xs text-surface-400">
                Customer?{' '}
                <Link href="/login" className="text-brand-green font-bold hover:underline">
                  Login here
                </Link>
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
