'use client';
// src/components/layout/Header.tsx
// ─────────────────────────────────────────────────────────────
// Site Header — MyLocalBazaar.store
// Features: Logo | Location selector | Search | Cart | Auth | Mobile nav
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  MapPin, Search, ShoppingCart, Heart, Bell,
  Wallet, User, ChevronDown, Menu, X, Store,
  Shield, LogIn,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';

// ── Location Pill ──────────────────────────────────────────────
function LocationPill() {
  const [area, setArea] = useState<string | null>(null);
  const [pincode, setPincode] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('mlb_selected_area');
    if (saved) {
      const parsed = JSON.parse(saved);
      setArea(parsed.name);
      setPincode(parsed.pincode);
    }
  }, []);

  return (
    <Link
      href="/set-location"
      className={clsx(
        'flex items-center gap-1.5 rounded-xl px-3 py-2',
        'bg-green-50 hover:bg-green-100 border border-green-200',
        'transition-colors duration-200 min-w-0 max-w-[200px]'
      )}
      title="Change delivery location"
    >
      <span className="relative flex-shrink-0">
        <MapPin className="w-4 h-4 text-brand-green" />
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-brand-green rounded-full animate-pulse-ring" />
      </span>
      <span className="flex flex-col min-w-0">
        <span className="text-[10px] font-semibold text-green-700 uppercase tracking-wider leading-none">
          Deliver to
        </span>
        <span className="text-xs font-bold text-surface-900 truncate leading-tight mt-0.5">
          {area ?? 'Set Location'}&nbsp;
          {pincode && <span className="text-surface-500 font-normal">{pincode}</span>}
        </span>
      </span>
      <ChevronDown className="w-3.5 h-3.5 text-surface-400 flex-shrink-0" />
    </Link>
  );
}

// ── Search Bar ─────────────────────────────────────────────────
function HeaderSearch({ mobile = false }: { mobile?: boolean }) {
  const [query, setQuery]         = useState('');
  const [focused, setFocused]     = useState(false);
  const [suggestions, setSugs]    = useState<string[]>([]);
  const inputRef                  = useRef<HTMLInputElement>(null);

  const recent = ['Onion 1kg', 'AC Repair', 'Dr. Sharma', 'Chaat'];

  return (
    <div className={clsx('relative', mobile ? 'w-full' : 'flex-1 max-w-xl')}>
      <div
        className={clsx(
          'flex items-center gap-2 rounded-xl border-2 bg-surface-50',
          'px-3 py-2.5 transition-all duration-200',
          focused
            ? 'border-brand-green shadow-lg shadow-green-100'
            : 'border-surface-200 hover:border-surface-300'
        )}
      >
        <Search className="w-4 h-4 text-surface-400 flex-shrink-0" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Search products, stores, services…"
          className="flex-1 bg-transparent text-sm text-surface-900 placeholder-surface-400
                     focus:outline-none min-w-0"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
            className="p-0.5 rounded-full hover:bg-surface-200 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-surface-400" />
          </button>
        )}
        <button
          className="flex-shrink-0 bg-brand-green text-white text-xs font-bold
                     px-3 py-1.5 rounded-lg hover:bg-green-600 transition-colors"
          onClick={() => query && (window.location.href = `/search?q=${encodeURIComponent(query)}`)}
        >
          Search
        </button>
      </div>

      {/* Suggestions dropdown */}
      <AnimatePresence>
        {focused && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl
                       shadow-card-hover border border-surface-100 z-50 overflow-hidden"
          >
            <div className="p-3">
              <p className="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-2">
                Recent Searches
              </p>
              {recent.map((item) => (
                <button
                  key={item}
                  onClick={() => {
                    setQuery(item);
                    window.location.href = `/search?q=${encodeURIComponent(item)}`;
                  }}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg
                             text-sm text-surface-700 hover:bg-surface-50 transition-colors text-left"
                >
                  <Search className="w-3.5 h-3.5 text-surface-400" />
                  {item}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Cart Icon ──────────────────────────────────────────────────
function CartIcon() {
  const { itemCount, openDrawer } = useCartStore();
  return (
    <button
      onClick={openDrawer}
      className="relative flex items-center justify-center w-10 h-10
                 rounded-xl hover:bg-surface-100 transition-colors group"
    >
      <ShoppingCart className="w-5 h-5 text-surface-700 group-hover:text-brand-green transition-colors" />
      {itemCount > 0 && (
        <motion.span
          key={itemCount}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-0.5 -right-0.5 bg-brand-orange
                     text-white text-[10px] font-black rounded-full flex items-center
                     justify-center leading-none min-w-[18px] min-h-[18px] px-1"
        >
          {itemCount > 99 ? '99+' : itemCount}
        </motion.span>
      )}
    </button>
  );
}

// ── Auth Actions ───────────────────────────────────────────────
function AuthActions() {
  const { user, logout } = useAuthStore();
  const isLoggedIn = !!user;
  const [open, setOpen] = useState(false);

  if (isLoggedIn) {
    return (
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl
                     hover:bg-surface-100 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-green to-brand-orange
                          flex items-center justify-center text-white text-xs font-bold">
            {user?.full_name?.[0] || '?'}
          </div>
          <ChevronDown className="w-4 h-4 text-surface-500" />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              className="absolute right-0 top-full mt-1 w-48 bg-white rounded-2xl shadow-card-hover
                         border border-surface-100 overflow-hidden z-50"
            >
              <div className="px-4 py-3 border-b border-surface-100">
                <p className="text-sm font-bold text-surface-900 truncate">{user?.full_name}</p>
                <p className="text-xs text-surface-400 truncate">{user?.phone}</p>
              </div>
              <Link href="/dashboard" onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-surface-700 hover:bg-surface-50">
                <User className="w-4 h-4" /> My Dashboard
              </Link>
              <button
                onClick={() => { setOpen(false); logout(); }}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-red-600
                           hover:bg-red-50 w-full text-left"
              >
                <LogIn className="w-4 h-4" /> Sign Out
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/login"
        className="btn-ghost text-xs !px-4 !py-2"
      >
        <LogIn className="w-4 h-4" /> Login
      </Link>
      <Link
        href="/merchant/register"
        className="hidden sm:flex items-center gap-1.5 text-xs font-semibold
                   text-brand-green border border-brand-green/30 rounded-xl px-4 py-2
                   hover:bg-green-50 transition-colors"
      >
        <Store className="w-3.5 h-3.5" /> Sell Here
      </Link>
    </div>
  );
}

// ── Mobile Navigation Drawer ───────────────────────────────────
function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navLinks = [
    { href: '/',                  label: 'Home',           icon: '🏠' },
    { href: '/categories',        label: 'All Categories', icon: '📦' },
    { href: '/merchant/register', label: 'Sell on MLB',    icon: '🏪' },
    { href: '/merchant/login',    label: 'Merchant Login', icon: '🔐' },
    { href: '/admin/login',       label: 'Admin',          icon: '🛡️' },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-0 top-0 bottom-0 w-72 bg-white z-50 shadow-2xl
                       flex flex-col lg:hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-surface-100">
              <div>
                <p className="font-display text-xl font-bold text-gradient">MyLocalBazaar</p>
                <p className="text-[11px] text-surface-500 mt-0.5">Your Local Market, Digitally Connected</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-surface-100 transition-colors"
              >
                <X className="w-5 h-5 text-surface-600" />
              </button>
            </div>

            {/* Location */}
            <div className="p-4 border-b border-surface-100">
              <LocationPill />
            </div>

            {/* Nav links */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl
                             text-surface-700 hover:bg-surface-50 hover:text-surface-900
                             transition-colors font-medium"
                >
                  <span className="text-xl">{link.icon}</span>
                  <span>{link.label}</span>
                </Link>
              ))}
            </nav>

            {/* Bottom CTA */}
            <div className="p-4 border-t border-surface-100">
              <Link href="/login" onClick={onClose} className="btn-primary w-full">
                <User className="w-4 h-4" /> Login / Register
              </Link>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN HEADER
// ═══════════════════════════════════════════════════════════════
export default function Header() {
  const [scrolled, setScrolled]   = useState(false);
  const [mobileOpen, setMobile]   = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <>
      <header
        className={clsx(
          'fixed top-0 left-0 right-0 z-30 bg-white transition-shadow duration-300',
          scrolled ? 'shadow-md' : 'shadow-sm'
        )}
      >
        {/* ── Top bar — promo strip ──────────────────────────── */}
        <div className="bg-brand-dark text-white text-[11px] font-medium text-center py-1.5 px-4
                        flex items-center justify-center gap-4">
          <span>🎉 Free delivery on orders above ₹500</span>
          <span className="hidden sm:inline text-white/40">|</span>
          <span className="hidden sm:inline">📍 Now serving Kharghar, Navi Mumbai</span>
        </div>

        {/* ── Main header row ────────────────────────────────── */}
        <div className="container-mlb">
          <div className="flex items-center gap-3 py-3">

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobile(true)}
              className="lg:hidden p-2 rounded-xl hover:bg-surface-100 transition-colors -ml-1"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5 text-surface-700" />
            </button>

            {/* Logo */}
            <Link href="/" className="flex-shrink-0 flex items-center gap-2 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-green to-brand-orange
                              flex items-center justify-center shadow-sm
                              group-hover:shadow-glow-green transition-shadow duration-300">
                <span className="text-white font-display font-black text-base leading-none">M</span>
              </div>
              <div className="hidden sm:block">
                <p className="font-display text-lg font-extrabold text-gradient leading-none">
                  MyLocalBazaar
                </p>
                <p className="text-[9px] font-semibold text-surface-400 uppercase tracking-widest leading-none mt-0.5">
                  .store
                </p>
              </div>
            </Link>

            {/* Location pill — hidden on very small screens */}
            <div className="hidden md:block flex-shrink-0">
              <LocationPill />
            </div>

            {/* Search bar — expands in middle */}
            <div className="hidden sm:flex flex-1">
              <HeaderSearch />
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-1 ml-auto">
              {/* Wishlist */}
              <Link href="/wishlist"
                className="hidden md:flex items-center justify-center w-10 h-10
                           rounded-xl hover:bg-surface-100 transition-colors group">
                <Heart className="w-5 h-5 text-surface-600 group-hover:text-red-500 transition-colors" />
              </Link>

              {/* Cart */}
              <CartIcon />

              {/* Auth */}
              <div className="hidden sm:flex">
                <AuthActions />
              </div>

              {/* Admin link */}
              <Link href="/admin/login"
                className="hidden lg:flex items-center justify-center w-10 h-10
                           rounded-xl hover:bg-surface-100 transition-colors"
                title="Admin Panel">
                <Shield className="w-4.5 h-4.5 text-surface-500" />
              </Link>
            </div>
          </div>

          {/* Mobile search bar — below main row */}
          <div className="sm:hidden pb-3">
            <HeaderSearch mobile />
          </div>

          {/* ── Category navigation strip ──────────────────── */}
          <nav className="hidden lg:flex items-center gap-1 pb-2 overflow-x-auto scrollbar-hide">
            {[
              ['/', 'Home'],
              ['/categories/grocery-fmcg', '🛒 Grocery'],
              ['/categories/electronics', '📱 Electronics'],
              ['/categories/medical', '💊 Medical'],
              ['/categories/doctor-booking', '👨‍⚕️ Doctor'],
              ['/categories/mens-salon', '💈 Men\'s Salon'],
              ['/categories/womens-salon', '💅 Women\'s Salon'],
              ['/categories/home-services', '🔨 Home Services'],
              ['/categories/food', '🍜 Food'],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold
                           text-surface-600 hover:text-brand-green hover:bg-green-50
                           transition-colors whitespace-nowrap"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Spacer for fixed header */}
      <div className="h-[var(--header-h)]" style={{ height: 'calc(72px + 32px)' }} />

      {/* Mobile drawer */}
      <MobileDrawer open={mobileOpen} onClose={() => setMobile(false)} />
    </>
  );
}
