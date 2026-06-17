'use client';
// src/components/home/CategoryGrid.tsx
// ─────────────────────────────────────────────────────────────
// 16 Category Cards — MyLocalBazaar Homepage
// Each card uses the exact brand colors from master prompt:
//   Grocery: Green + Orange | Electronics: Blue + White
//   Medical: White + Blue + Red | Men's Salon: Dark Blue + Silver
//   Women's Salon: Pink + White + Gold | Home Services: Yellow + Blue
//   Food: Orange + Red | etc.
// ─────────────────────────────────────────────────────────────

import React, { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { CATEGORIES, type CategoryUIConfig, type Category } from '@/types';

// ── Individual Category Card ──────────────────────────────────
// `count` = live merchant count for this category (undefined = still loading)
function CategoryCard({ cat, index, count }: { cat: CategoryUIConfig; index: number; count?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.4, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        href={`/categories/${cat.slug}`}
        className="group block relative overflow-hidden rounded-2xl
                   border border-white/60 shadow-card
                   hover:shadow-card-hover hover:-translate-y-1
                   transition-all duration-300 bg-white"
      >
        {/* ── Gradient background ──────────────────────────── */}
        <div
          className="relative h-28 sm:h-32 overflow-hidden"
          style={{ background: cat.gradient }}
        >
          {/* Noise overlay for texture */}
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            }}
          />

          {/* Floating circles decoration */}
          <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
          <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full bg-white/08" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                          w-14 h-14 rounded-full bg-white/10" />

          {/* Emoji icon */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            whileHover={{ scale: 1.15, rotate: [0, -5, 5, 0] }}
            transition={{ duration: 0.4 }}
          >
            <span
              className="text-4xl sm:text-5xl drop-shadow-lg select-none
                         group-hover:scale-110 transition-transform duration-300"
              role="img"
              aria-label={cat.label}
            >
              {cat.emoji}
            </span>
          </motion.div>

          {/* Corner arrow — appears on hover */}
          <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20
                          flex items-center justify-center
                          opacity-0 group-hover:opacity-100
                          translate-x-2 group-hover:translate-x-0
                          transition-all duration-300">
            <ArrowRight className="w-3.5 h-3.5 text-white" />
          </div>

          {/* Live merchant count badge */}
          <div className="absolute bottom-2.5 left-2.5">
            {count === undefined ? (
              <div className="h-4 w-16 rounded-full bg-white/20 animate-pulse" />
            ) : (
              <span className="text-[10px] font-bold text-white bg-black/20
                                backdrop-blur-sm rounded-full px-2 py-0.5">
                {count} {count === 1 ? 'store' : 'stores'}
              </span>
            )}
          </div>
        </div>

        {/* ── Card body ────────────────────────────────────── */}
        <div className="p-3.5">
          <p className="font-semibold text-surface-900 text-sm leading-tight
                        group-hover:text-surface-700 transition-colors">
            {cat.label}
          </p>
          <p className="text-[11px] text-surface-400 mt-0.5 font-medium">
            Shop Now →
          </p>
        </div>
      </Link>
    </motion.div>
  );
}

// ── Festival Banner (between rows) ────────────────────────────
function FestivalBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="col-span-full rounded-3xl overflow-hidden relative
                 bg-gradient-to-r from-brand-dark via-surface-900 to-brand-dark
                 border border-white/10 shadow-card"
    >
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-64 h-64 rounded-full
                        bg-brand-green/10 blur-3xl -translate-y-1/2" />
        <div className="absolute bottom-0 right-1/4 w-64 h-64 rounded-full
                        bg-brand-orange/10 blur-3xl translate-y-1/2" />
      </div>
      <div className="relative z-10 flex flex-col sm:flex-row items-center
                      justify-between gap-4 p-6 sm:p-8">
        <div>
          <p className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-1">
            Limited Time Offer
          </p>
          <h3 className="font-display text-2xl sm:text-3xl font-bold text-white">
            First Order <span className="text-gradient">Free Delivery</span>
          </h3>
          <p className="text-white/60 text-sm mt-1">
            Use code <span className="font-bold text-brand-orange bg-orange-500/10
                                       px-2 py-0.5 rounded-md">WELCOME50</span> at checkout
          </p>
        </div>
        <Link
          href="/categories"
          className="flex-shrink-0 btn-primary text-sm !px-6 !py-3 shadow-glow-green"
        >
          Shop All Categories
        </Link>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY GRID
// ═══════════════════════════════════════════════════════════════
export default function CategoryGrid() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const inView     = useInView(sectionRef, { once: true, margin: '-80px' });

  // Live merchant counts per category slug — undefined while loading
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countsLoaded, setCountsLoaded] = useState(false);

  useEffect(() => {
    apiGet<{ categories: Category[] }>('/categories')
      .then((res) => {
        const map: Record<string, number> = {};
        (res.data.categories || []).forEach((c) => {
          map[c.slug] = Number(c.active_merchant_count) || 0;
        });
        setCounts(map);
      })
      .catch(() => { /* graceful degradation — counts simply stay empty */ })
      .finally(() => setCountsLoaded(true));
  }, []);

  // Split into two rows with the promo banner between them
  const firstRow  = CATEGORIES.slice(0, 8);
  const secondRow = CATEGORIES.slice(8);

  return (
    <section ref={sectionRef} className="py-12 md:py-16 bg-surface-50">
      <div className="container-mlb">

        {/* ── Section header ──────────────────────────────── */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <motion.p
              initial={{ opacity: 0, x: -12 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.4 }}
              className="text-xs font-bold text-brand-green uppercase tracking-widest mb-1"
            >
              Everything you need
            </motion.p>
            <motion.h2
              initial={{ opacity: 0, x: -12 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.4, delay: 0.05 }}
              className="section-heading"
            >
              Shop by Category
            </motion.h2>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <Link
              href="/categories"
              className="hidden sm:flex items-center gap-1.5 text-sm font-semibold
                         text-brand-green hover:text-green-700 transition-colors"
            >
              All categories <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>

        {/* ── First row: 8 categories ──────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-3">
          {firstRow.map((cat, i) => (
            <CategoryCard key={cat.slug} cat={cat} index={i} count={countsLoaded ? counts[cat.slug] ?? 0 : undefined} />
          ))}
        </div>

        {/* ── Festival banner ──────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 mb-3">
          <FestivalBanner />
        </div>

        {/* ── Second row: 8 categories ─────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {secondRow.map((cat, i) => (
            <CategoryCard key={cat.slug} cat={cat} index={i + 8} count={countsLoaded ? counts[cat.slug] ?? 0 : undefined} />
          ))}
        </div>

        {/* ── Mobile "see all" link ─────────────────────────── */}
        <div className="flex sm:hidden justify-center mt-6">
          <Link href="/categories" className="btn-ghost text-sm">
            Browse All Categories <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
