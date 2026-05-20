'use client';
// src/components/home/HeroSection.tsx
// ─────────────────────────────────────────────────────────────
// Hero Section — MyLocalBazaar Homepage
// Design: Warm dark gradient background with animated mesh,
// bold display headline, hyperlocal pincode search front-and-center,
// and pulsing live activity indicators
// ─────────────────────────────────────────────────────────────

import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Search, ArrowRight, Loader2, CheckCircle2, TrendingUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { apiGet } from '@/lib/api';
import type { Area } from '@/types';

// ── Floating stat pills ────────────────────────────────────────
const STATS = [
  { label: '500+ Merchants', emoji: '🏪', delay: 0 },
  { label: '10K+ Products',  emoji: '📦', delay: 0.15 },
  { label: 'Same-Day Delivery', emoji: '🚴', delay: 0.30 },
  { label: '50+ Services',  emoji: '⚡', delay: 0.45 },
];

// ── Trending searches ──────────────────────────────────────────
const TRENDING = [
  'Onion 1kg', 'AC Repair', 'Doctor near me', 'Protein Powder', 'Chaat',
];

// ── Pincode Search Component ───────────────────────────────────
function PincodeSearch() {
  const router    = useRouter();
  const inputRef  = useRef<HTMLInputElement>(null);

  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<Area[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [selected, setSelected] = useState<Area | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mlb_selected_area');
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      // Try pincode search first, then text search
      const endpoint = /^\d+$/.test(q) && q.length >= 6
        ? `/areas/pincode/${q}`
        : `/areas/search?q=${encodeURIComponent(q)}&limit=6`;
      const res = await apiGet<{ areas?: Area[]; data?: Area[] }>(endpoint);
      const areas = (res.data as any).areas || (res.data as any) || [];
      setResults(Array.isArray(areas) ? areas : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const handleSelect = (area: Area) => {
    setSelected(area);
    setQuery('');
    setResults([]);
    setFocused(false);
    localStorage.setItem('mlb_selected_area', JSON.stringify(area));
    router.push(`/explore?area=${area.id}&pincode=${area.pincode}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query) {
      router.push(`/search?q=${encodeURIComponent(query)}`);
    }
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <motion.div
        className={clsx(
          'flex items-center gap-2 bg-white rounded-2xl p-2 shadow-hero',
          'border-2 transition-all duration-300',
          focused ? 'border-brand-green shadow-glow-green' : 'border-transparent'
        )}
        animate={{ scale: focused ? 1.01 : 1 }}
        transition={{ duration: 0.2 }}
      >
        {/* Location icon + selected area */}
        <div className="flex items-center gap-2 pl-2 flex-shrink-0">
          <MapPin className="w-5 h-5 text-brand-green" />
          {selected && (
            <div className="hidden sm:flex flex-col leading-none">
              <span className="text-[10px] font-bold text-green-600 uppercase tracking-wider">Area</span>
              <span className="text-xs font-bold text-surface-800 truncate max-w-[100px]">
                {selected.name}
              </span>
            </div>
          )}
          {selected && (
            <div className="hidden sm:block w-px h-8 bg-surface-200" />
          )}
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder={selected
            ? `Search in ${selected.name}…`
            : 'Enter pincode or area (e.g. Kharghar, 410210)'}
          className="flex-1 bg-transparent text-base text-surface-900
                     placeholder-surface-400 focus:outline-none py-2 min-w-0"
        />

        {loading && <Loader2 className="w-5 h-5 text-surface-400 animate-spin flex-shrink-0" />}

        {/* Search button */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => query && router.push(`/search?q=${encodeURIComponent(query)}`)}
          className="flex items-center gap-2 bg-brand-green text-white font-bold text-sm
                     px-5 py-3 rounded-xl hover:bg-green-600 transition-colors
                     flex-shrink-0 shadow-sm"
        >
          <Search className="w-4 h-4" />
          <span className="hidden sm:inline">Explore</span>
        </motion.button>
      </motion.div>

      {/* Dropdown results */}
      <AnimatePresence>
        {focused && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="absolute top-full left-0 right-0 mt-3 bg-white rounded-2xl
                       shadow-card-hover border border-surface-100 z-50 overflow-hidden"
          >
            <div className="p-2">
              <p className="px-3 py-1.5 text-[10px] font-bold text-surface-400 uppercase tracking-widest">
                Select your area
              </p>
              {results.map((area) => (
                <motion.button
                  key={area.id}
                  whileHover={{ x: 4 }}
                  onClick={() => handleSelect(area)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl
                             hover:bg-green-50 transition-colors text-left group"
                >
                  <div className="w-8 h-8 rounded-xl bg-green-100 flex items-center
                                  justify-center flex-shrink-0">
                    <MapPin className="w-4 h-4 text-brand-green" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-surface-900">{area.name}</p>
                    <p className="text-xs text-surface-500">{area.city_name} · {area.pincode}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-surface-300 group-hover:text-brand-green
                                         transition-colors" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// HERO SECTION
// ═══════════════════════════════════════════════════════════════
export default function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-brand-dark min-h-[520px] md:min-h-[580px]
                        flex items-center">

      {/* ── Animated background mesh ───────────────────────── */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        {/* Green glow blob — top left */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full
                        bg-brand-green/20 blur-3xl" />
        {/* Orange glow blob — bottom right */}
        <div className="absolute -bottom-32 -right-16 w-80 h-80 rounded-full
                        bg-brand-orange/15 blur-3xl" />
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />
        {/* Diagonal accent line */}
        <div className="absolute top-0 right-0 w-px h-full bg-gradient-to-b
                        from-transparent via-brand-green/30 to-transparent
                        translate-x-[180px] rotate-12 origin-top" />
      </div>

      {/* ── Content ────────────────────────────────────────── */}
      <div className="container-mlb relative z-10 py-16 md:py-20">
        <div className="max-w-3xl mx-auto text-center">

          {/* Live indicator */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm
                       border border-white/20 rounded-full px-4 py-1.5 mb-6"
          >
            <span className="w-2 h-2 bg-brand-green rounded-full animate-pulse-ring" />
            <span className="text-xs font-semibold text-white/90">
              Live in Kharghar, Navi Mumbai
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold
                       text-white leading-[1.05] tracking-tight mb-4"
          >
            Your Local Market,{' '}
            <span
              className="text-transparent bg-clip-text"
              style={{ backgroundImage: 'linear-gradient(135deg, #22C55E 0%, #F97316 100%)' }}
            >
              Digitally Connected
            </span>
          </motion.h1>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-base sm:text-lg text-white/70 mb-8 max-w-xl mx-auto leading-relaxed"
          >
            Har Local Vyapar aur Har Zaroori Service — Ab Digital Bharat Ka Hissa.
            Shop local. Book local. Grow local.
          </motion.p>

          {/* ── PINCODE SEARCH — centre stage ─────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mb-4"
          >
            <PincodeSearch />
          </motion.div>

          {/* Trending searches */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex flex-wrap items-center justify-center gap-2 mb-10"
          >
            <span className="text-white/40 text-xs font-medium flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> Trending:
            </span>
            {TRENDING.map((term) => (
              <button
                key={term}
                onClick={() => window.location.href = `/search?q=${encodeURIComponent(term)}`}
                className="text-xs text-white/60 hover:text-white border border-white/15
                           hover:border-white/30 rounded-full px-3 py-1
                           transition-colors hover:bg-white/5"
              >
                {term}
              </button>
            ))}
          </motion.div>

          {/* ── Stat pills ──────────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {STATS.map((stat) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + stat.delay }}
                className="flex items-center gap-2 bg-white/10 backdrop-blur-sm
                           border border-white/15 rounded-xl px-3 py-2"
              >
                <span className="text-base">{stat.emoji}</span>
                <span className="text-xs font-semibold text-white/85">{stat.label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
