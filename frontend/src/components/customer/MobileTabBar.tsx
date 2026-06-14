// src/components/customer/MobileTabBar.tsx
// ─────────────────────────────────────────────────────────────
// Mobile Bottom Tab Bar — Customer Dashboard
// Fixed bottom nav for the 4 dashboard sections on small screens
// ─────────────────────────────────────────────────────────────

'use client';
import React from 'react';
import { Package, Heart, Wallet, User } from 'lucide-react';
import { clsx } from 'clsx';

const TABS = [
  { key: 'orders',   label: 'Orders',   icon: Package },
  { key: 'wishlist', label: 'Wishlist', icon: Heart },
  { key: 'wallet',   label: 'Wallet',   icon: Wallet },
  { key: 'profile',  label: 'Profile',  icon: User },
] as const;

export function MobileTabBar({
  active, onChange,
}: {
  active:   string;
  onChange: (key: string) => void;
}) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 lg:hidden bg-white border-t border-surface-100
                     flex items-stretch pb-[env(safe-area-inset-bottom)]">
      {TABS.map(({ key, label, icon: Icon }) => {
        const active_ = active === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={clsx(
              'flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5',
              'text-[11px] font-bold transition-colors',
              active_ ? 'text-brand-green' : 'text-surface-400'
            )}
          >
            <Icon className="w-5 h-5" />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
