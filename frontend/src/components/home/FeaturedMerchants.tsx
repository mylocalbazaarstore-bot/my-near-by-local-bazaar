'use client';
// src/components/home/FeaturedMerchants.tsx
// ─────────────────────────────────────────────────────────────
// Featured Merchants — MyLocalBazaar Homepage
// Horizontally scrollable rows of merchant store cards
// Fetches live data from /merchants/by-pincode API
// Includes: rating, delivery info, open/closed badge, category badge
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, useInView } from 'framer-motion';
import {
  Star, MapPin, Clock, ChevronRight, Zap,
  Package, ShoppingBag, ArrowRight, Truck,
} from 'lucide-react';
import { clsx } from 'clsx';
import { apiGet } from '@/lib/api';
import { useLocationStore } from '@/store/locationStore';
import { CAT_BADGES, getBrandColor, getBrandAccent } from '@/lib/storeTheme';
import type { Merchant } from '@/types';

// ── Merchant Card ──────────────────────────────────────────────
function MerchantCard({ merchant, index }: { merchant: Merchant; index: number }) {
  const badge = CAT_BADGES[merchant.store_category] || { label: 'Store', class: 'bg-surface-100 text-surface-600' };
  const isFree = true; // placeholder — would compute based on min_order_value

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.07 }}
      className="flex-shrink-0 w-64 sm:w-72"
    >
      <Link
        href={`/store/${merchant.store_slug}`}
        className="group block card h-full"
      >
        {/* ── Banner Image ──────────────────────────────────── */}
        <div className="relative h-36 overflow-hidden bg-gradient-to-br from-surface-100 to-surface-200">
          {merchant.store_banner_url ? (
            <Image
              src={merchant.store_banner_url}
              alt={merchant.store_name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            // Placeholder gradient banner
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(135deg, ${getBrandColor(merchant.store_category)} 0%, ${getBrandAccent(merchant.store_category)} 100%)`,
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center opacity-30">
                <ShoppingBag className="w-16 h-16 text-white" />
              </div>
            </div>
          )}

          {/* Open/Closed badge */}
          <div className="absolute top-2.5 left-2.5">
            <span className={clsx(
              'badge text-[10px] font-bold shadow-sm',
              merchant.is_open
                ? 'bg-green-500 text-white'
                : 'bg-surface-800/80 text-white backdrop-blur-sm'
            )}>
              {merchant.is_open ? '● Open' : '○ Closed'}
            </span>
          </div>

          {/* Featured badge */}
          {merchant.is_featured && (
            <div className="absolute top-2.5 right-2.5">
              <span className="badge bg-brand-orange text-white text-[10px] shadow-sm">
                ⭐ Featured
              </span>
            </div>
          )}

          {/* Emergency booking badge */}
          {merchant.emergency_booking && (
            <div className="absolute bottom-2.5 right-2.5">
              <span className="badge bg-red-500/90 text-white text-[10px] backdrop-blur-sm">
                <Zap className="w-2.5 h-2.5" /> Emergency
              </span>
            </div>
          )}
        </div>

        {/* ── Store logo overlay ────────────────────────────── */}
        <div className="relative px-3 -mt-6">
          <div className="w-12 h-12 rounded-xl border-2 border-white shadow-md
                          bg-white overflow-hidden flex-shrink-0">
            {merchant.store_logo_url ? (
              <Image
                src={merchant.store_logo_url}
                alt={merchant.store_name}
                width={48}
                height={48}
                className="object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-white font-bold text-lg"
                style={{ background: getBrandColor(merchant.store_category) }}
              >
                {merchant.store_name[0]}
              </div>
            )}
          </div>
        </div>

        {/* ── Card Body ─────────────────────────────────────── */}
        <div className="px-3 pt-2 pb-4">
          {/* Category badge */}
          <span className={clsx('badge text-[10px] mb-2', badge.class)}>
            {badge.label}
          </span>

          {/* Store name */}
          <h3 className="font-bold text-surface-900 text-base leading-tight mb-1
                         group-hover:text-brand-green transition-colors line-clamp-1">
            {merchant.store_name}
          </h3>

          {/* Rating */}
          <div className="flex items-center gap-1.5 mb-2">
            <div className="flex items-center gap-0.5">
              <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
              <span className="text-xs font-bold text-surface-800">
                {Number(merchant.rating || 0).toFixed(1)}
              </span>
            </div>
            <span className="text-surface-300 text-xs">·</span>
            <span className="text-xs text-surface-500">
              {merchant.total_reviews} reviews
            </span>
          </div>

          {/* Delivery + distance */}
          <div className="flex items-center gap-3 text-xs text-surface-500">
            <span className="flex items-center gap-1">
              <Truck className="w-3.5 h-3.5 text-brand-green" />
              {isFree ? (
                <span className="text-green-600 font-semibold">Free delivery</span>
              ) : (
                `₹${merchant.min_order_value} min`
              )}
            </span>
            {merchant.distance_km && (
              <>
                <span className="text-surface-200">·</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {Number(merchant.distance_km).toFixed(1)} km
                </span>
              </>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ── Skeleton card ──────────────────────────────────────────────
function MerchantCardSkeleton() {
  return (
    <div className="flex-shrink-0 w-64 sm:w-72 card">
      <div className="skeleton h-36" />
      <div className="p-3 space-y-2 mt-2">
        <div className="skeleton h-3 w-16 rounded" />
        <div className="skeleton h-5 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
        <div className="skeleton h-3 w-2/3 rounded" />
      </div>
    </div>
  );
}

// ── "Set your location" CTA (shown when no location is set) ────
function LocationCTA() {
  return (
    <div className="card flex flex-col items-center justify-center text-center gap-3 py-10 px-6">
      <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center">
        <MapPin className="w-6 h-6 text-brand-green" />
      </div>
      <div>
        <p className="font-bold text-surface-900 mb-1">Set your location</p>
        <p className="text-sm text-surface-500 max-w-xs">
          Tell us where you are to discover the stores closest to you
        </p>
      </div>
      <Link href="/set-location" className="btn-primary text-sm !px-5 !py-2.5">
        Set Location
      </Link>
    </div>
  );
}

// ── Scroll row with arrows ─────────────────────────────────────
function ScrollRow({ merchants, loading }: { merchants: Merchant[]; loading: boolean }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: 'left' | 'right') => {
    if (!rowRef.current) return;
    rowRef.current.scrollBy({ left: dir === 'right' ? 280 : -280, behavior: 'smooth' });
  };

  return (
    <div className="relative group/row">
      {/* Left arrow */}
      <button
        onClick={() => scroll('left')}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10
                   w-9 h-9 rounded-full bg-white shadow-card-hover border border-surface-100
                   flex items-center justify-center
                   opacity-0 group-hover/row:opacity-100 transition-opacity duration-200
                   hover:bg-surface-50"
        aria-label="Scroll left"
      >
        <ChevronRight className="w-4 h-4 text-surface-700 rotate-180" />
      </button>

      {/* Scroll container */}
      <div
        ref={rowRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 -mx-1 px-1"
      >
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <MerchantCardSkeleton key={i} />)
          : merchants.map((m, i) => (
              <MerchantCard key={m.id} merchant={m} index={i} />
            ))
        }
      </div>

      {/* Right arrow */}
      <button
        onClick={() => scroll('right')}
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10
                   w-9 h-9 rounded-full bg-white shadow-card-hover border border-surface-100
                   flex items-center justify-center
                   opacity-0 group-hover/row:opacity-100 transition-opacity duration-200
                   hover:bg-surface-50"
        aria-label="Scroll right"
      >
        <ChevronRight className="w-4 h-4 text-surface-700" />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FEATURED MERCHANTS SECTION
// ═══════════════════════════════════════════════════════════════
export default function FeaturedMerchants() {
  const { lat, lng, pincode } = useLocationStore();
  const hasCoords   = lat !== null && lng !== null;
  const hasLocation = hasCoords || !!pincode;

  const [featured, setFeatured] = useState<Merchant[]>([]);
  const [nearby,   setNearby]   = useState<Merchant[]>([]);
  const [loading,  setLoading]  = useState(true);
  const sectionRef = useRef<HTMLDivElement>(null);
  const inView     = useInView(sectionRef, { once: true, margin: '-80px' });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Featured: location-aware if coords are set, else fall back to
        // a city-level default pincode (graceful degradation per design spec)
        const featuredUrl = hasCoords
          ? `/merchants/by-coords?lat=${lat}&lng=${lng}&radius_km=5&sort_by=rating&limit=8`
          : `/merchants/by-pincode/${pincode || '410210'}?sort_by=rating&limit=8`;

        const requests: Promise<{ data: Merchant[] }>[] = [apiGet<Merchant[]>(featuredUrl)];

        // Nearby: only fetch if the user has actually shared a location
        if (hasCoords) {
          requests.push(apiGet<Merchant[]>(`/merchants/by-coords?lat=${lat}&lng=${lng}&radius_km=5&sort_by=distance&limit=8`));
        } else if (pincode) {
          requests.push(apiGet<Merchant[]>(`/merchants/by-pincode/${pincode}?sort_by=distance&limit=8`));
        }

        const results = await Promise.allSettled(requests);

        if (results[0].status === 'fulfilled') {
          setFeatured(results[0].value.data || []);
        }
        if (results[1]?.status === 'fulfilled') {
          setNearby(results[1].value.data || []);
        } else {
          setNearby([]);
        }
      } catch {
        // In dev/demo mode show skeleton
      } finally {
        setLoading(false);
      }
    })();
  }, [hasCoords, lat, lng, pincode]);

  // Use mock data if API not yet connected
  const displayFeatured = featured.length ? featured : MOCK_MERCHANTS;
  const displayNearby   = nearby.length   ? nearby   : MOCK_MERCHANTS.slice().reverse();

  return (
    <section ref={sectionRef} className="py-12 md:py-16 bg-white">
      <div className="container-mlb">

        {/* ── Featured stores ──────────────────────────────── */}
        <div className="mb-10">
          <div className="flex items-end justify-between mb-6">
            <div>
              <motion.p
                initial={{ opacity: 0 }}
                animate={inView ? { opacity: 1 } : {}}
                transition={{ duration: 0.4 }}
                className="text-xs font-bold text-brand-orange uppercase tracking-widest mb-1"
              >
                Hand-picked for you
              </motion.p>
              <motion.h2
                initial={{ opacity: 0, y: 8 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.4, delay: 0.05 }}
                className="section-heading"
              >
                ⭐ Featured Stores
              </motion.h2>
            </div>
            <Link
              href="/stores"
              className="hidden sm:flex items-center gap-1.5 text-sm font-semibold
                         text-brand-orange hover:text-orange-700 transition-colors"
            >
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <ScrollRow merchants={displayFeatured} loading={loading} />
        </div>

        {/* ── Nearest to you ───────────────────────────────── */}
        <div>
          <div className="flex items-end justify-between mb-6">
            <div>
              <motion.p
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                className="text-xs font-bold text-brand-green uppercase tracking-widest mb-1"
              >
                Near your location
              </motion.p>
              <motion.h2
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.05 }}
                className="section-heading"
              >
                📍 Nearest Stores
              </motion.h2>
            </div>
            <Link
              href="/stores?sort=distance"
              className="hidden sm:flex items-center gap-1.5 text-sm font-semibold
                         text-brand-green hover:text-green-700 transition-colors"
            >
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {hasLocation ? (
            <ScrollRow merchants={displayNearby} loading={loading} />
          ) : (
            <LocationCTA />
          )}
        </div>
      </div>
    </section>
  );
}

// ── Mock merchants for UI development (before API connection) ──
const MOCK_MERCHANTS: Merchant[] = [
  { id: '1', store_name: 'Patil Fresh Grocery', store_slug: 'patil-fresh-grocery',
    store_category: 'grocery_fmcg', rating: 4.8, total_reviews: 234,
    delivery_radius_km: 3, min_order_value: 100, is_open: true,
    accepts_cod: true, emergency_booking: false, is_featured: true,
    pincode: '410210', distance_km: 0.8 },
  { id: '2', store_name: 'TechZone Electronics', store_slug: 'techzone-electronics',
    store_category: 'electronics', rating: 4.6, total_reviews: 89,
    delivery_radius_km: 5, min_order_value: 500, is_open: true,
    accepts_cod: true, emergency_booking: false, is_featured: true,
    pincode: '410210', distance_km: 1.2 },
  { id: '3', store_name: 'Dr. Meera Clinic', store_slug: 'dr-meera-clinic',
    store_category: 'service', rating: 4.9, total_reviews: 156,
    delivery_radius_km: 8, min_order_value: 0, is_open: true,
    accepts_cod: false, emergency_booking: true, is_featured: true,
    pincode: '410210', distance_km: 0.5 },
  { id: '4', store_name: 'Style Hub Men\'s Salon', store_slug: 'style-hub-mens-salon',
    store_category: 'service', rating: 4.7, total_reviews: 311,
    delivery_radius_km: 3, min_order_value: 0, is_open: false,
    accepts_cod: false, emergency_booking: false, is_featured: false,
    pincode: '410210', distance_km: 0.3 },
  { id: '5', store_name: 'MedCare Pharmacy', store_slug: 'medcare-pharmacy',
    store_category: 'medical', rating: 4.5, total_reviews: 67,
    delivery_radius_km: 2, min_order_value: 50, is_open: true,
    accepts_cod: true, emergency_booking: true, is_featured: false,
    pincode: '410210', distance_km: 1.8 },
  { id: '6', store_name: 'Sharma Hardware & Tools', store_slug: 'sharma-hardware',
    store_category: 'hardware', rating: 4.3, total_reviews: 44,
    delivery_radius_km: 4, min_order_value: 200, is_open: true,
    accepts_cod: true, emergency_booking: false, is_featured: false,
    pincode: '410210', distance_km: 2.1 },
];
