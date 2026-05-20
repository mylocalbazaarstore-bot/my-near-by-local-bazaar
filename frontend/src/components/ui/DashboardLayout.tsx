// src/components/ui/DashboardLayout.tsx
// ─────────────────────────────────────────────────────────────
// Dashboard Shell Layout — MyLocalBazaar
// Sidebar + main content area, mobile-responsive drawer
// Used by both Customer and Merchant dashboard pages
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, LogOut, ChevronRight, Bell } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '@/store/authStore';

export interface NavItem {
  href:     string;
  label:    string;
  icon:     string;
  badge?:   number | string;
  accent?:  string;
}

export function DashboardLayout({
  children,
  nav,
  title,
  subtitle,
  role,
  accentColor = 'green',
  onNavClick,
  activeHref,
}: {
  children:      React.ReactNode;
  nav:           NavItem[];
  title:         string;
  subtitle:      string;
  role:          'customer' | 'merchant';
  accentColor?:  'green' | 'orange' | 'blue';
  onNavClick?:   (href: string) => void;
  activeHref?:   string;
}) {
  const pathname  = usePathname();
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuthStore();

  const accent = {
    green:  { bar: 'bg-brand-green',  dot: 'bg-green-500',  ring: 'ring-green-500/20' },
    orange: { bar: 'bg-brand-orange', dot: 'bg-orange-500', ring: 'ring-orange-500/20' },
    blue:   { bar: 'bg-blue-500',     dot: 'bg-blue-500',   ring: 'ring-blue-500/20'  },
  }[accentColor];

  // Sidebar component (shared by desktop sidebar + mobile drawer)
  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="p-5 border-b border-surface-100">
        <Link href="/" className="flex items-center gap-2.5 mb-4">
          <div className={clsx(
            'w-8 h-8 rounded-xl flex items-center justify-center',
            'bg-gradient-to-br from-brand-green to-brand-orange shadow-sm'
          )}>
            <span className="text-white font-display font-black text-sm">M</span>
          </div>
          <span className="font-display font-extrabold text-surface-900 text-base leading-none">
            MyLocalBazaar
          </span>
        </Link>

        {/* User avatar + info */}
        <div className={clsx('flex items-center gap-3 p-3 rounded-2xl', 'bg-surface-50 border border-surface-100')}>
          <div className={clsx(
            'w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0',
            accentColor === 'green' ? 'bg-gradient-to-br from-brand-green to-green-600' : 'bg-gradient-to-br from-brand-orange to-orange-600'
          )}>
            {user?.full_name?.[0] || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-surface-900 text-sm truncate">
              {user?.full_name || 'User'}
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              <span className={clsx('w-1.5 h-1.5 rounded-full', accent.dot)} />
              <span className="text-[11px] font-semibold text-surface-400 capitalize">{role}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 p-3 overflow-y-auto">
        <p className="px-3 mb-2 text-[10px] font-bold text-surface-400 uppercase tracking-widest">
          {title}
        </p>
        <div className="space-y-0.5">
          {nav.map((item) => {
            // Use activeHref when provided (hash-based SPA tabs); fall back to
            // pathname comparison for real page routes.
            const active = activeHref !== undefined
              ? activeHref === item.href
              : pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => { setOpen(false); onNavClick?.(item.href); }}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold',
                  'transition-all duration-200 group',
                  active
                    ? 'bg-brand-green/10 text-brand-green'
                    : 'text-surface-600 hover:bg-surface-50 hover:text-surface-900'
                )}
              >
                <span className="text-base w-5 text-center">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.badge !== undefined && (
                  <span className={clsx(
                    'text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center',
                    active ? 'bg-brand-green text-white' : 'bg-surface-200 text-surface-600'
                  )}>
                    {item.badge}
                  </span>
                )}
                {active && <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom: logout */}
      <div className="p-3 border-t border-surface-100">
        <button
          onClick={logout}
          className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl
                     text-sm font-semibold text-surface-500 hover:bg-red-50
                     hover:text-red-600 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-50 flex">

      {/* ── Desktop Sidebar ─────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-surface-100
                         flex-shrink-0 fixed h-full z-20">
        <SidebarContent />
      </aside>

      {/* ── Mobile Drawer ────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-30 lg:hidden"
              onClick={() => setOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed left-0 top-0 bottom-0 w-72 bg-white z-40 shadow-2xl lg:hidden"
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Main content area ─────────────────────────────────── */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">

        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-surface-100">
          <div className="flex items-center gap-3 px-4 py-3 md:px-6">
            {/* Mobile menu */}
            <button
              onClick={() => setOpen(true)}
              className="lg:hidden p-2 rounded-xl hover:bg-surface-100 transition-colors -ml-1"
            >
              <Menu className="w-5 h-5 text-surface-700" />
            </button>

            <div className="flex-1 min-w-0">
              <h1 className="font-display font-bold text-surface-900 text-lg leading-tight truncate">
                {subtitle}
              </h1>
            </div>

            {/* Notifications */}
            <button className="relative p-2 rounded-xl hover:bg-surface-100 transition-colors">
              <Bell className="w-5 h-5 text-surface-600" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>

            {/* Wallet badge (customer only) */}
            {role === 'customer' && user?.wallet_balance !== undefined && (
              <div className="hidden sm:flex items-center gap-1.5 bg-green-50 border border-green-100
                              rounded-xl px-3 py-1.5">
                <span className="text-[11px] font-bold text-green-700">Wallet</span>
                <span className="text-sm font-black text-green-700">
                  ₹{Number(user.wallet_balance).toFixed(0)}
                </span>
              </div>
            )}

            {/* Back to store */}
            <Link
              href="/"
              className="hidden sm:flex btn-ghost text-xs !px-3 !py-1.5"
            >
              ← Store
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
