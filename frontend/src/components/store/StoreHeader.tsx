'use client';
// src/components/store/StoreHeader.tsx
// ─────────────────────────────────────────────────────────────
// Merchant Storefront Header — MyLocalBazaar.store
// Banner + logo + badges + rating + address + delivery info +
// expandable opening hours
// ─────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Star, MapPin, Clock, Zap, ShoppingBag, Truck, Package,
  ChevronDown, ChevronUp, CheckCircle2, XCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { CAT_BADGES, getBrandColor, getBrandAccent } from '@/lib/storeTheme';
import type { MerchantDetail } from '@/types';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime(time: string): string {
  const [hStr, mStr] = time.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export default function StoreHeader({ merchant }: { merchant: MerchantDetail }) {
  const [showHours, setShowHours] = useState(false);

  const badge = CAT_BADGES[merchant.store_category] || { label: 'Store', class: 'bg-surface-100 text-surface-600' };
  const todayIdx = new Date().getDay();
  const sortedHours = (merchant.opening_hours || []).slice().sort((a, b) => a.day_of_week - b.day_of_week);
  const todayHours = sortedHours.find((h) => h.day_of_week === todayIdx);

  const locationParts = [merchant.area_name, merchant.city_name, merchant.state].filter(Boolean);

  return (
    <div className="bg-white border-b border-surface-100">
      {/* ── Banner ───────────────────────────────────────────── */}
      <div className="relative h-40 sm:h-56 md:h-64 overflow-hidden">
        {merchant.store_banner_url ? (
          <Image
            src={merchant.store_banner_url}
            alt={merchant.store_name}
            fill
            priority
            className="object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${getBrandColor(merchant.store_category)} 0%, ${getBrandAccent(merchant.store_category)} 100%)`,
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center opacity-20">
              <ShoppingBag className="w-24 h-24 text-white" />
            </div>
          </div>
        )}

        {/* Status badges */}
        <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
          <span className={clsx(
            'badge text-xs font-bold shadow-sm',
            merchant.is_open ? 'bg-green-500 text-white' : 'bg-surface-800/80 text-white backdrop-blur-sm'
          )}>
            {merchant.is_open ? '● Open Now' : '○ Closed'}
          </span>
          {merchant.is_featured && (
            <span className="badge bg-brand-orange text-white text-xs shadow-sm">
              ⭐ Featured
            </span>
          )}
          {merchant.emergency_booking && (
            <span className="badge bg-red-500/90 text-white text-xs backdrop-blur-sm">
              <Zap className="w-3 h-3" /> Emergency
            </span>
          )}
        </div>
      </div>

      <div className="container-mlb">
        {/* ── Logo + name ───────────────────────────────────── */}
        <div className="relative flex flex-col sm:flex-row sm:items-end gap-4 -mt-10 sm:-mt-12 pb-5">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-4 border-white shadow-lg
                          bg-white overflow-hidden flex-shrink-0">
            {merchant.store_logo_url ? (
              <Image
                src={merchant.store_logo_url}
                alt={merchant.store_name}
                width={96}
                height={96}
                className="object-cover w-full h-full"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-white font-bold text-3xl"
                style={{ background: getBrandColor(merchant.store_category) }}
              >
                {merchant.store_name[0]}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 pt-2 sm:pt-0 sm:pb-1">
            <span className={clsx('badge text-[10px] mb-1.5', badge.class)}>
              {badge.label}
            </span>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-surface-900 leading-tight">
              {merchant.store_name}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-sm">
              <a href="#reviews" className="flex items-center gap-1.5 hover:underline">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                <span className="font-bold text-surface-800">{Number(merchant.rating || 0).toFixed(1)}</span>
                <span className="text-surface-400">({merchant.total_reviews} reviews)</span>
              </a>
              {locationParts.length > 0 && (
                <span className="flex items-center gap-1.5 text-surface-500">
                  <MapPin className="w-4 h-4" />
                  {locationParts.join(', ')}{merchant.pincode ? ` ${merchant.pincode}` : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Description ──────────────────────────────────── */}
        {merchant.store_description && (
          <p className="text-sm text-surface-600 leading-relaxed max-w-2xl pb-4">
            {merchant.store_description}
          </p>
        )}

        {/* ── Address + delivery info row ──────────────────── */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 pb-5 text-sm text-surface-600">
          {merchant.address && (
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-brand-green flex-shrink-0" />
              {merchant.address}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Truck className="w-4 h-4 text-brand-green flex-shrink-0" />
            Delivers within {merchant.delivery_radius_km} km
          </span>
          <span className="flex items-center gap-1.5">
            <Package className="w-4 h-4 text-brand-green flex-shrink-0" />
            Min order ₹{merchant.min_order_value}
          </span>
          <span className={clsx(
            'flex items-center gap-1.5',
            merchant.accepts_cod ? 'text-green-600' : 'text-surface-400'
          )}>
            {merchant.accepts_cod ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {merchant.accepts_cod ? 'Cash on Delivery available' : 'COD not available'}
          </span>
        </div>

        {/* ── Opening hours ─────────────────────────────────── */}
        <div className="pb-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-brand-green flex-shrink-0" />
              {todayHours ? (
                todayHours.is_closed ? (
                  <span className="font-semibold text-red-600">Closed today</span>
                ) : (
                  <span>
                    <span className="font-semibold text-surface-900">Today: </span>
                    {formatTime(todayHours.open_time)} – {formatTime(todayHours.close_time)}
                  </span>
                )
              ) : (
                <span className="text-surface-400">Hours not available</span>
              )}
            </div>

            {sortedHours.length > 0 && (
              <button
                onClick={() => setShowHours((s) => !s)}
                className="flex items-center gap-1 text-xs font-semibold text-brand-green
                           hover:text-green-700 transition-colors"
              >
                {showHours ? 'Hide hours' : 'View all hours'}
                {showHours ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          <AnimatePresence>
            {showHours && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-w-md">
                  {sortedHours.map((h) => (
                    <div
                      key={h.day_of_week}
                      className={clsx(
                        'flex items-center justify-between px-3 py-1.5 rounded-lg text-xs',
                        h.day_of_week === todayIdx ? 'bg-green-50 font-semibold text-green-700' : 'text-surface-500'
                      )}
                    >
                      <span>{DAY_NAMES[h.day_of_week]}</span>
                      <span>{h.is_closed ? 'Closed' : `${formatTime(h.open_time)} – ${formatTime(h.close_time)}`}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
