'use client';
// src/app/set-location/page.tsx — Pincode / Area Selector

import React, { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Search, Loader2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { apiGet, getErrorMessage } from '@/lib/api';
import { apiPost } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

const QUICK_AREAS = [
  { name: 'Kharghar Sector 12', pincode: '410210' },
  { name: 'Kharghar Sector 20', pincode: '410210' },
  { name: 'Panvel',             pincode: '410206' },
  { name: 'CBD Belapur',        pincode: '400614' },
  { name: 'Vashi',              pincode: '400703' },
  { name: 'Nerul',              pincode: '400706' },
];

export default function SetLocationPage() {
  const router                  = useRouter();
  const { user }                = useAuthStore();
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const debounceRef             = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const endpoint = /^\d{6}$/.test(q)
        ? `/areas/pincode/${q}`
        : `/areas/search?q=${encodeURIComponent(q)}&limit=8`;
      const res = await apiGet<any>(endpoint);
      const areas = res.data?.areas || res.data || [];
      setResults(Array.isArray(areas) ? areas : [areas].filter(Boolean));
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const handleSelect = async (area: any) => {
    setSelected(area);
    localStorage.setItem('mlb_selected_area', JSON.stringify(area));

    // If logged in, save to backend too
    if (user) {
      try {
        await apiPost('/mobile/customer/set-location', {
          area_id: area.id, pincode: area.pincode,
        });
      } catch { /* non-critical */ }
    }

    toast.success(`📍 Delivering to ${area.name}!`);
    setTimeout(() => {
      const redirect = new URLSearchParams(window.location.search).get('redirect');
      router.replace(redirect || '/');
    }, 800);
  };

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Header */}
      <div className="bg-white border-b border-surface-100 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-green to-brand-orange flex items-center justify-center">
            <span className="text-white font-display font-black text-sm">M</span>
          </div>
          <span className="font-display font-bold text-surface-900">Set Delivery Location</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Hero */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-4">
            <MapPin className="w-8 h-8 text-brand-green animate-pulse-ring" />
          </div>
          <h1 className="font-display text-2xl font-bold text-surface-900 mb-2">
            Where should we deliver?
          </h1>
          <p className="text-surface-500 text-sm">
            Enter your pincode or area name to discover local stores near you
          </p>
        </div>

        {/* Search box */}
        <div className="relative mb-6">
          <div className="flex items-center gap-2 bg-white border-2 border-surface-200 rounded-2xl
                          px-4 py-3.5 focus-within:border-brand-green transition-colors shadow-sm">
            <Search className="w-4 h-4 text-surface-400 flex-shrink-0" />
            <input
              type="text" value={query} onChange={handleChange} autoFocus
              placeholder="Enter pincode or area (e.g. Kharghar, 410210)"
              className="flex-1 bg-transparent text-surface-900 text-sm placeholder-surface-400 focus:outline-none"
            />
            {loading && <Loader2 className="w-4 h-4 text-surface-400 animate-spin flex-shrink-0" />}
          </div>

          {/* Results dropdown */}
          <AnimatePresence>
            {results.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl
                           shadow-card-hover border border-surface-100 z-20 overflow-hidden"
              >
                {results.map((area) => (
                  <button key={area.id} onClick={() => handleSelect(area)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-green-50
                               transition-colors text-left border-b border-surface-100 last:border-0">
                    <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-4 h-4 text-brand-green" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-surface-900">{area.name}</p>
                      <p className="text-xs text-surface-500">{area.city_name} · {area.pincode}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-surface-300" />
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Selected success */}
        <AnimatePresence>
          {selected && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="card p-4 border-2 border-brand-green bg-green-50 mb-6 flex items-center gap-3"
            >
              <CheckCircle2 className="w-6 h-6 text-brand-green flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-surface-900">Delivering to {selected.name}</p>
                <p className="text-xs text-surface-500">{selected.pincode} · Redirecting…</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick select */}
        <div>
          <p className="text-xs font-bold text-surface-400 uppercase tracking-widest mb-3">
            Popular Areas — Navi Mumbai
          </p>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_AREAS.map((area) => (
              <button
                key={area.name}
                onClick={() => handleSelect({ ...area, id: null, city_name: 'Navi Mumbai' })}
                className="flex items-center gap-2 p-3 bg-white rounded-xl border border-surface-200
                           hover:border-brand-green hover:bg-green-50 transition-all text-left group"
              >
                <MapPin className="w-3.5 h-3.5 text-surface-400 group-hover:text-brand-green flex-shrink-0" />
                <div>
                  <p className="text-xs font-bold text-surface-900 line-clamp-1">{area.name}</p>
                  <p className="text-[10px] text-surface-400">{area.pincode}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
