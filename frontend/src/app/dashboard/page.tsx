// src/app/dashboard/page.tsx
// ─────────────────────────────────────────────────────────────
// Customer Dashboard — MyLocalBazaar
// Authenticated area: Orders | Wishlist | Wallet | Profile
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { DashboardLayout, type NavItem } from '@/components/ui/DashboardLayout';
import OrdersPanel from '@/components/customer/OrdersPanel';
import { WishlistPanel, WalletPanel } from '@/components/customer/WishlistWallet';
import ProfilePanel from '@/components/customer/ProfilePanel';
import { MobileTabBar } from '@/components/customer/MobileTabBar';
import { useAuthStore } from '@/store/authStore';

// ── Nav definition ─────────────────────────────────────────────
const NAV: NavItem[] = [
  { href: '#orders',   label: 'My Orders', icon: '📦' },
  { href: '#wishlist', label: 'Wishlist',  icon: '❤️' },
  { href: '#wallet',   label: 'Wallet',    icon: '💰' },
  { href: '#profile',  label: 'Profile',   icon: '👤' },
];

// ═══════════════════════════════════════════════════════════════
// CUSTOMER DASHBOARD PAGE
// ═══════════════════════════════════════════════════════════════
export default function CustomerDashboardPage() {
  const [section, setSection] = useState('orders');
  const { user, role, isHydrated } = useAuthStore();
  const router = useRouter();

  // Redirect if not logged in or not a customer
  useEffect(() => {
    if (isHydrated && (!user || role !== 'customer')) {
      router.replace('/login?redirect=/dashboard');
    }
  }, [isHydrated, user, role, router]);

  if (!isHydrated || !user || role !== 'customer') return null;

  // Handle nav clicks (SPA tab switching)
  const handleNavClick = (href: string) => {
    setSection(href.replace('#', ''));
  };

  const renderSection = () => {
    switch (section) {
      case 'wishlist': return <WishlistPanel />;
      case 'wallet':   return <WalletPanel />;
      case 'profile':  return <ProfilePanel />;
      default:         return <OrdersPanel />;
    }
  };

  return (
    <DashboardLayout
      nav={NAV}
      title="Customer Panel"
      subtitle={`Welcome back, ${user.full_name?.split(' ')[0] || 'there'}! 👋`}
      role="customer"
      accentColor="green"
      activeHref={`#${section}`}
      onNavClick={handleNavClick}
    >
      {/* Bottom padding clears the mobile tab bar */}
      <div className="pb-20 lg:pb-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {renderSection()}
          </motion.div>
        </AnimatePresence>
      </div>

      <MobileTabBar active={section} onChange={setSection} />
    </DashboardLayout>
  );
}
