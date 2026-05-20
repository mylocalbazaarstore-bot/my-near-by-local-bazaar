// src/app/dashboard/page.tsx
// ─────────────────────────────────────────────────────────────
// Customer Dashboard — MyLocalBazaar
// Authenticated area: Orders | Wishlist | Wallet | Profile
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, Heart, Wallet, User, MapPin,
  Bell, TicketPercent, Star, HelpCircle,
} from 'lucide-react';
import { DashboardLayout, type NavItem } from '@/components/ui/DashboardLayout';
import { StatCard } from '@/components/ui/DashboardPrimitives';
import OrdersPanel from '@/components/customer/OrdersPanel';
import { WishlistPanel, WalletPanel } from '@/components/customer/WishlistWallet';
import { useAuthStore } from '@/store/authStore';
import { apiGet } from '@/lib/api';
import dayjs from 'dayjs';

// ── Nav definition ─────────────────────────────────────────────
const NAV: NavItem[] = [
  { href: '#orders',       label: 'My Orders',       icon: '📦' },
  { href: '#wishlist',     label: 'Wishlist',        icon: '❤️' },
  { href: '#wallet',       label: 'Wallet',          icon: '💰' },
  { href: '#profile',      label: 'Profile',         icon: '👤' },
  { href: '#addresses',    label: 'Addresses',       icon: '📍' },
  { href: '#reviews',      label: 'My Reviews',      icon: '⭐' },
  { href: '#coupons',      label: 'Coupons',         icon: '🎟️' },
  { href: '#support',      label: 'Help & Support',  icon: '🆘' },
  { href: '#notifications',label: 'Notifications',   icon: '🔔' },
];

// ── Mini Overview Cards ────────────────────────────────────────
function OverviewCards({ userId }: { userId: string }) {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    apiGet<any>('/orders?limit=1')
      .then((res) => setStats(res.data))
      .catch(() => {});
  }, [userId]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatCard
        label="Total Orders"
        value={stats?.meta?.total ?? '—'}
        icon={Package}
        color="green"
        sub="All time"
      />
      <StatCard
        label="Wishlist Items"
        value="—"
        icon={Heart}
        color="red"
        sub="Saved products"
      />
      <StatCard
        label="Wallet Balance"
        value="—"
        icon={Wallet}
        color="blue"
        sub="Available"
      />
      <StatCard
        label="Reviews Given"
        value="—"
        icon={Star}
        color="yellow"
        sub="Verified purchases"
      />
    </div>
  );
}

// ── Profile Form ───────────────────────────────────────────────
function ProfilePanel() {
  const { user } = useAuthStore();
  const [form, setForm] = useState({
    full_name:     user?.full_name    || '',
    email:         user?.email        || '',
    gender:        '',
    date_of_birth: '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const { apiPatch } = await import('@/lib/api');
      await apiPatch('/auth/customer/complete-profile', form);
      const toast = (await import('react-hot-toast')).default;
      toast.success('Profile updated!');
    } catch {
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-lg">
      <h2 className="section-heading text-xl">My Profile</h2>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-green to-brand-orange
                        flex items-center justify-center text-white font-display font-black text-3xl">
          {user?.full_name?.[0] || '?'}
        </div>
        <div>
          <p className="font-bold text-surface-900">{user?.full_name}</p>
          <p className="text-sm text-surface-500">{user?.phone}</p>
          <p className="text-xs text-brand-green mt-0.5">Verified Customer ✓</p>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        {[
          { label: 'Full Name',     key: 'full_name',     type: 'text',  placeholder: 'Your full name' },
          { label: 'Email',         key: 'email',         type: 'email', placeholder: 'your@email.com' },
          { label: 'Date of Birth', key: 'date_of_birth', type: 'date',  placeholder: '' },
        ].map(({ label, key, type, placeholder }) => (
          <div key={key}>
            <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
              {label}
            </label>
            <input
              type={type}
              value={(form as any)[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder}
              className="input-field"
            />
          </div>
        ))}

        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
            Gender
          </label>
          <select
            value={form.gender}
            onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
            className="input-field"
          >
            <option value="">Prefer not to say</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>

        <button onClick={save} disabled={saving} className="btn-primary w-full">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* Read-only info */}
      <div className="card p-4">
        <div className="flex items-center justify-between py-2 border-b border-surface-100">
          <span className="text-sm text-surface-500">Mobile Number</span>
          <span className="text-sm font-semibold text-surface-900">{user?.phone}</span>
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-surface-500">Referral Code</span>
          <span className="text-sm font-mono font-black text-brand-green">{user?.referral_code}</span>
        </div>
      </div>
    </div>
  );
}

// ── Coming Soon placeholder ────────────────────────────────────
function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-5xl mb-4">🚧</div>
      <h3 className="font-display text-xl font-bold text-surface-900 mb-2">{label}</h3>
      <p className="text-sm text-surface-500">This section is coming soon in the next update.</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMER DASHBOARD PAGE
// ═══════════════════════════════════════════════════════════════
export default function CustomerDashboardPage() {
  const [section, setSection] = useState('overview');
  const { user, isHydrated }  = useAuthStore();
  const router                = useRouter();

  // Redirect if not logged in
  useEffect(() => {
    if (isHydrated && !user) {
      router.replace('/login?redirect=/dashboard');
    }
  }, [isHydrated, user, router]);

  if (!isHydrated || !user) return null;

  // Override nav href to use state instead of routes (SPA tab switching)
  const nav: NavItem[] = NAV.map((item) => ({
    ...item,
    href: item.href,
  }));

  // Handle nav clicks
  const handleNavClick = (href: string) => {
    setSection(href.replace('#', ''));
  };

  const renderSection = () => {
    switch (section) {
      case 'overview': case 'orders': return <OrdersPanel />;
      case 'wishlist':  return <WishlistPanel />;
      case 'wallet':    return <WalletPanel />;
      case 'profile':   return <ProfilePanel />;
      default:          return <ComingSoon label={section.replace(/-/g, ' ')} />;
    }
  };

  return (
    <DashboardLayout
      nav={nav.map((n) => ({
        ...n,
        href: `#${n.href.replace('#', '')}`,
      }))}
      title="Customer Panel"
      subtitle={`Welcome back, ${user.full_name?.split(' ')[0] || 'there'}! 👋`}
      role="customer"
      accentColor="green"
      activeHref={`#${section}`}
      onNavClick={handleNavClick}
    >
      {/* Overview stats */}
      {section === 'overview' && (
        <OverviewCards userId={user.id} />
      )}

      {/* Active section */}
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
    </DashboardLayout>
  );
}
