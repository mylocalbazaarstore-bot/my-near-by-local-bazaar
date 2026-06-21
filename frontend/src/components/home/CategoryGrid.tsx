'use client';
// src/components/home/CategoryGrid.tsx
// ─────────────────────────────────────────────────────────────
// 16 Category Cards — MyLocalBazaar Homepage
// Layout: 10 shop categories | specialty banner | 5 service categories
// ─────────────────────────────────────────────────────────────

import React, { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { CATEGORIES, type CategoryUIConfig, type Category } from '@/types';

// ── Category groupings ─────────────────────────────────────────
const SHOP_SLUGS = [
  'grocery-fmcg', 'wholesale', 'electronics', 'hardware', 'clothing',
  'medical', 'tea-stall', 'chaat-chinese', 'jewellery', 'restaurant', 'furniture',
];
const SERVICE_SLUGS = [
  'doctor-booking', 'home-services', 'mens-salon', 'womens-salon',
];

// ── Individual Category Card ───────────────────────────────────
function CategoryCard({
  cat,
  index,
  count,
  cta = 'Shop Now',
  href,
}: {
  cat: CategoryUIConfig;
  index: number;
  count?: number;
  cta?: string;
  href?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.4, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        href={href || `/categories/${cat.slug}`}
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
            {cta} →
          </p>
        </div>
      </Link>
    </motion.div>
  );
}

// ── Section divider label ──────────────────────────────────────
function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-[10px] font-bold text-surface-500 uppercase tracking-widest whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-surface-200" />
    </div>
  );
}

// ── Finance / EMI Banner ───────────────────────────────────────
function FinanceBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="rounded-3xl overflow-hidden relative border border-white/10 shadow-card"
      style={{ background: 'linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 50%, #1E3A8A 100%)' }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-64 h-64 rounded-full
                        bg-blue-400/20 blur-3xl -translate-y-1/2" />
        <div className="absolute bottom-0 right-1/4 w-64 h-64 rounded-full
                        bg-cyan-400/10 blur-3xl translate-y-1/2" />
      </div>
      <div className="relative z-10 flex flex-col sm:flex-row items-center
                      justify-between gap-4 p-6 sm:p-8">
        <div>
          <p className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-1">
            Easy Installments
          </p>
          <h3 className="font-display text-2xl sm:text-3xl font-bold text-white">
            💳 EMI Available on Electronics &amp; Furniture
          </h3>
          <p className="text-white/60 text-sm mt-1">
            Buy now, pay later — easy installment options. Call us to know more.
          </p>
        </div>
        <a
          href="tel:8398975653"
          className="flex-shrink-0 btn-primary text-sm !px-6 !py-3 shadow-glow-green"
        >
          📞 Call 8398975653
        </a>
      </div>
    </motion.div>
  );
}

// ── Specialty Banner ───────────────────────────────────────────
function SpecialtyBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="rounded-3xl overflow-hidden relative
                 border border-white/10 shadow-card"
      style={{ background: 'linear-gradient(135deg, #4C1D95 0%, #5B21B6 50%, #4C1D95 100%)' }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-64 h-64 rounded-full
                        bg-violet-400/20 blur-3xl -translate-y-1/2" />
        <div className="absolute bottom-0 right-1/4 w-64 h-64 rounded-full
                        bg-amber-400/10 blur-3xl translate-y-1/2" />
      </div>
      <div className="relative z-10 flex flex-col sm:flex-row items-center
                      justify-between gap-4 p-6 sm:p-8">
        <div>
          <p className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-1">
            Curated Collection
          </p>
          <h3 className="font-display text-2xl sm:text-3xl font-bold text-white">
            ⭐ <span className="text-gradient">Specialty Stores</span>
          </h3>
          <p className="text-white/60 text-sm mt-1">
            Unique local stores with exclusive finds — jewellers, boutiques & more
          </p>
        </div>
        <Link
          href="/categories/specialty"
          className="flex-shrink-0 btn-primary text-sm !px-6 !py-3 shadow-glow-green"
        >
          Explore Specialty
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

  const [counts, setCounts]           = useState<Record<string, number>>({});
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
      .catch(() => {})
      .finally(() => setCountsLoaded(true));
  }, []);

  const shopCategories    = CATEGORIES.filter(c => SHOP_SLUGS.includes(c.slug));
  const serviceCategories = CATEGORIES.filter(c => SERVICE_SLUGS.includes(c.slug));

  const getCount = (slug: string) =>
    countsLoaded ? counts[slug] ?? 0 : undefined;

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

        {/* ── SHOP BY CATEGORY: 10 product/goods categories ─ */}
        <SectionLabel label="Shop by Category" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4">
          {shopCategories.map((cat, i) => (
            <CategoryCard
              key={cat.slug}
              cat={cat}
              index={i}
              count={getCount(cat.slug)}
            />
          ))}
        </div>

        {/* ── Finance / EMI banner ─────────────────────────── */}
        <div className="mb-4">
          <FinanceBanner />
        </div>

        {/* ── Specialty Stores banner ──────────────────────── */}
        <div className="mb-4">
          <SpecialtyBanner />
        </div>

        {/* ── SERVICES BY CATEGORY: 5 service categories ───── */}
        <SectionLabel label="Services by Category" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {serviceCategories.map((cat, i) => (
            <CategoryCard
              key={cat.slug}
              cat={cat}
              index={i}
              count={getCount(cat.slug)}
              cta="Book Now"
              href={`/services/${cat.slug}`}
            />
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
