'use client';
// src/app/admin-dashboard/page.tsx
// ─────────────────────────────────────────────────────────────
// Admin Control Panel — MyLocalBazaar
// Sections: Overview | KYC | Merchants | Products | Orders | Customers | Analytics
// Role-guard: redirects to /admin/login if role !== 'admin'
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import {
  LayoutDashboard, Package, Store, ShoppingCart, Users,
  LogOut, Bell, Menu, ChevronRight, ShieldCheck, BarChart3,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

import OverviewSection from '@/components/admin-dash/OverviewSection';
import KYCManagement from '@/components/admin-dash/KYCManagement';
import MerchantsManagement from '@/components/admin-dash/MerchantsManagement';
import ProductsManagement from '@/components/admin-dash/ProductsManagement';
import OrdersManagement from '@/components/admin-dash/OrdersManagement';
import CustomersManagement from '@/components/admin-dash/CustomersManagement';
import PlatformAnalytics from '@/components/admin-dash/PlatformAnalytics';

// ── Nav items ──────────────────────────────────────────────────
const NAV = [
  { key: 'overview',  label: 'Overview',  icon: <LayoutDashboard className="w-4 h-4" /> },
  { key: 'kyc',       label: 'KYC',       icon: <ShieldCheck className="w-4 h-4" /> },
  { key: 'merchants', label: 'Merchants', icon: <Store className="w-4 h-4" /> },
  { key: 'products',  label: 'Products',  icon: <Package className="w-4 h-4" /> },
  { key: 'orders',    label: 'Orders',    icon: <ShoppingCart className="w-4 h-4" /> },
  { key: 'customers', label: 'Customers', icon: <Users className="w-4 h-4" /> },
  { key: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" /> },
] as const;

type Section = typeof NAV[number]['key'];

// ── Standalone admin sidebar shell ─────────────────────────────
function AdminShell({
  children,
  section,
  setSection,
  pendingCount,
}: {
  children:     React.ReactNode;
  section:      Section;
  setSection:   (s: Section) => void;
  pendingCount: number;
}) {
  const { user, logout } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="p-5 border-b border-surface-100">
        <Link href="/" className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-green to-brand-orange
                          flex items-center justify-center shadow-sm">
            <span className="text-white font-display font-black text-sm">M</span>
          </div>
          <span className="font-display font-extrabold text-surface-900 text-base leading-none">
            MyLocalBazaar
          </span>
        </Link>

        {/* Admin badge */}
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-red-50 border border-red-100">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-700
                          flex items-center justify-center text-white font-bold flex-shrink-0">
            {user?.full_name?.[0] || 'A'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-surface-900 text-sm truncate">{user?.full_name || 'Admin'}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <ShieldCheck className="w-3 h-3 text-red-500" />
              <span className="text-[11px] font-semibold text-red-500">Superadmin</span>
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 overflow-y-auto">
        <p className="px-3 mb-2 text-[10px] font-bold text-surface-400 uppercase tracking-widest">
          Control Panel
        </p>
        <div className="space-y-0.5">
          {NAV.map((item) => {
            const active = section === item.key;
            return (
              <button
                key={item.key}
                onClick={() => { setSection(item.key); setMobileOpen(false); }}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold',
                  'transition-all duration-200',
                  active
                    ? 'bg-red-500/10 text-red-600'
                    : 'text-surface-600 hover:bg-surface-50 hover:text-surface-900'
                )}
              >
                <span className={active ? 'text-red-500' : 'text-surface-400'}>{item.icon}</span>
                <span className="flex-1 text-left">{item.label}</span>
                {item.key === 'products' && pendingCount > 0 && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px]
                                   text-center bg-red-500 text-white">
                    {pendingCount}
                  </span>
                )}
                {active && <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Sign out */}
      <div className="p-3 border-t border-surface-100">
        <button
          onClick={logout}
          className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm
                     font-semibold text-surface-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-50 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-surface-100
                        flex-shrink-0 fixed h-full z-20">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-30 lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed left-0 top-0 bottom-0 w-72 bg-white z-40 shadow-2xl lg:hidden"
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-surface-100">
          <div className="flex items-center gap-3 px-4 py-3 md:px-6">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-xl hover:bg-surface-100 transition-colors -ml-1"
            >
              <Menu className="w-5 h-5 text-surface-700" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="font-display font-bold text-surface-900 text-lg leading-tight">
                Admin Dashboard
              </h1>
            </div>
            <button className="relative p-2 rounded-xl hover:bg-surface-100 transition-colors">
              <Bell className="w-5 h-5 text-surface-600" />
              {pendingCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </button>
            <Link href="/" className="hidden sm:flex btn-ghost text-xs !px-3 !py-1.5">
              ← Store
            </Link>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PAGE — role-guarded entry point
// ═══════════════════════════════════════════════════════════════
export default function AdminDashboardPage() {
  const { user, role, isHydrated } = useAuthStore();
  const router = useRouter();
  const [section,      setSection]      = useState<Section>('overview');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (isHydrated && (!user || role !== 'admin')) {
      router.replace('/admin/login');
    }
  }, [isHydrated, user, role, router]);

  if (!isHydrated || !user || role !== 'admin') return null;

  const renderSection = () => {
    switch (section) {
      case 'overview':  return <OverviewSection onNavigate={setSection} />;
      case 'kyc':       return <KYCManagement />;
      case 'merchants': return <MerchantsManagement />;
      case 'products':  return <ProductsManagement onCountChange={setPendingCount} />;
      case 'orders':    return <OrdersManagement />;
      case 'customers': return <CustomersManagement />;
      case 'analytics': return <PlatformAnalytics />;
    }
  };

  return (
    <AdminShell section={section} setSection={setSection} pendingCount={pendingCount}>
      <AnimatePresence mode="wait">
        <motion.div
          key={section}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {renderSection()}
        </motion.div>
      </AnimatePresence>
    </AdminShell>
  );
}
