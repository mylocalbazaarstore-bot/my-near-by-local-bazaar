'use client';
// src/app/admin-dashboard/page.tsx
// ─────────────────────────────────────────────────────────────
// Admin Control Panel — MyLocalBazaar
// Sections: Overview | Products (queue) | Merchants | Orders
// Role-guard: redirects to /admin/login if role !== 'admin'
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import {
  LayoutDashboard, Package, Store, ShoppingCart, Users,
  LogOut, Bell, Menu, X, CheckCircle2, XCircle,
  TrendingUp, AlertTriangle, RefreshCw, ChevronRight,
  IndianRupee, ShieldCheck,
} from 'lucide-react';
import { api, apiPost, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import {
  StatCard, StatusBadge, ConfirmModal, TableSkeleton, EmptyState,
} from '@/components/ui/DashboardPrimitives';
import toast from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────────
interface Overview {
  gmv: {
    total_gmv:         number;
    period_gmv:        number;
    total_orders:      number;
    delivered_orders:  number;
    cancelled_orders:  number;
    avg_order_value:   number;
    pending_merchant_approval: number;
  };
  customers: { total: number; new: number; active: number };
  merchants: {
    total: number; active: number; pending: number;
    kyc_pending: number; new: number;
  };
  products: { active: number; pending_approval: number; out_of_stock: number };
  platform_revenue: { total: number; commission: number; delivery: number };
}

interface PendingProduct {
  id:             string;
  name:           string;
  sku:            string;
  retail_price:   number;
  mrp:            number;
  product_status: string;
  created_at:     string;
  merchant?: { store_name: string; store_slug: string };
  category?: { name: string };
}

interface PendingMerchant {
  id:              string;
  store_name:      string;
  owner_name:      string;
  phone:           string;
  store_category:  string;
  merchant_status: string;
  kyc_status:      string;
  created_at:      string;
}

// ── Nav items ──────────────────────────────────────────────────
const NAV = [
  { key: 'overview',   label: 'Overview',   icon: <LayoutDashboard className="w-4 h-4" /> },
  { key: 'products',   label: 'Products',   icon: <Package className="w-4 h-4" /> },
  { key: 'merchants',  label: 'Merchants',  icon: <Store className="w-4 h-4" /> },
  { key: 'orders',     label: 'Orders',     icon: <ShoppingCart className="w-4 h-4" /> },
  { key: 'customers',  label: 'Customers',  icon: <Users className="w-4 h-4" /> },
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

// ── Overview section ───────────────────────────────────────────
function OverviewSection() {
  const [data,    setData]    = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [period,  setPeriod]  = useState('month');

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/admin/analytics/overview?period=${period}`)
      .then((r) => setData((r.data as any).data?.overview ?? null))
      .catch(() => toast.error('Failed to load overview'))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const periods = ['today', 'week', 'month', 'quarter', 'year'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="section-heading text-xl">Platform Overview</h2>
          <p className="text-xs text-surface-500 mt-0.5">System-wide marketplace metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-surface-100 rounded-xl p-1">
            {periods.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                  period === p
                    ? 'bg-white text-surface-900 shadow-sm'
                    : 'text-surface-500 hover:text-surface-700'
                )}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <button
            onClick={load} disabled={loading}
            className="p-2 rounded-xl hover:bg-surface-100 transition-colors"
          >
            <RefreshCw className={clsx('w-4 h-4 text-surface-500', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Merchants"
          value={loading ? '—' : (data?.merchants.active ?? 0)}
          sub={loading ? '' : `${data?.merchants.pending ?? 0} pending approval`}
          icon={Store} color="green" loading={loading}
        />
        <StatCard
          label="Total Customers"
          value={loading ? '—' : (data?.customers.total ?? 0)}
          sub={loading ? '' : `${data?.customers.new ?? 0} new this period`}
          icon={Users} color="blue" loading={loading}
        />
        <StatCard
          label="Products Pending"
          value={loading ? '—' : (data?.products.pending_approval ?? 0)}
          sub={loading ? '' : `${data?.products.active ?? 0} active listings`}
          icon={Package} color="orange" loading={loading}
        />
        <StatCard
          label="Total Orders"
          value={loading ? '—' : (data?.gmv.total_orders ?? 0)}
          sub={loading ? '' : `${data?.gmv.delivered_orders ?? 0} delivered`}
          icon={ShoppingCart} color="purple" loading={loading}
        />
      </div>

      {/* Revenue row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Gross GMV"
          value={loading ? '—' : `₹${Number(data?.gmv.period_gmv ?? 0).toLocaleString('en-IN')}`}
          sub="Period gross merchandise value"
          icon={IndianRupee} color="green" loading={loading}
        />
        <StatCard
          label="Platform Revenue"
          value={loading ? '—' : `₹${Number(data?.platform_revenue.total ?? 0).toLocaleString('en-IN')}`}
          sub={loading ? '' : `₹${Number(data?.platform_revenue.commission ?? 0).toLocaleString('en-IN')} commission`}
          icon={TrendingUp} color="blue" loading={loading}
        />
        <StatCard
          label="KYC Pending"
          value={loading ? '—' : (data?.merchants.kyc_pending ?? 0)}
          sub="Merchants awaiting KYC review"
          icon={AlertTriangle} color="yellow" loading={loading}
        />
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-bold text-surface-900 text-sm mb-3">Quick Actions</h3>
          <div className="space-y-2">
            {[
              { label: 'Review pending products',   badge: data?.products.pending_approval,  section: 'products'  },
              { label: 'Approve pending merchants', badge: data?.merchants.pending,          section: 'merchants' },
              { label: 'View all orders',            badge: data?.gmv.total_orders,           section: 'orders'    },
            ].map(({ label, badge, section }) => (
              <button
                key={label}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl
                           hover:bg-surface-50 transition-colors text-sm text-surface-700 font-semibold"
              >
                <span>{label}</span>
                {badge !== undefined && badge > 0 && (
                  <span className="text-xs font-black px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-bold text-surface-900 text-sm mb-3">Marketplace Health</h3>
          <div className="space-y-3">
            {[
              {
                label: 'Order Fill Rate',
                value: data ? `${data.gmv.total_orders > 0
                  ? Math.round((data.gmv.delivered_orders / data.gmv.total_orders) * 100) : 0}%`
                  : '—',
                good: true,
              },
              {
                label: 'Cancellation Rate',
                value: data ? `${data.gmv.total_orders > 0
                  ? Math.round((data.gmv.cancelled_orders / data.gmv.total_orders) * 100) : 0}%`
                  : '—',
                good: false,
              },
              {
                label: 'Avg Order Value',
                value: data ? `₹${Math.round(data.gmv.avg_order_value)}` : '—',
                good: true,
              },
            ].map(({ label, value, good }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs font-semibold text-surface-500">{label}</span>
                <span className={clsx(
                  'text-sm font-bold',
                  loading ? 'text-surface-400' : good ? 'text-green-600' : 'text-orange-500'
                )}>
                  {loading ? '—' : value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Products pending approval ──────────────────────────────────
function ProductsSection({ onCountChange }: { onCountChange: (n: number) => void }) {
  const [products,   setProducts]   = useState<PendingProduct[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [confirmId,  setConfirmId]  = useState<string | null>(null);
  const [action,     setAction]     = useState<'approve' | 'reject'>('approve');
  const [notes,      setNotes]      = useState('');
  const [acting,     setActing]     = useState(false);
  const [filter,     setFilter]     = useState<'pending_approval' | 'active' | 'rejected'>('pending_approval');

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/admin/products?status=${filter}&limit=50`)
      .then((r) => {
        const rows: PendingProduct[] = (r.data as any).data?.products ?? [];
        setProducts(rows);
        if (filter === 'pending_approval') onCountChange(rows.length);
      })
      .catch(() => toast.error('Failed to load products'))
      .finally(() => setLoading(false));
  }, [filter, onCountChange]);

  useEffect(() => { load(); }, [load]);

  const openConfirm = (id: string, act: 'approve' | 'reject') => {
    setConfirmId(id);
    setAction(act);
    setNotes('');
  };

  const execute = async () => {
    if (!confirmId) return;
    setActing(true);
    try {
      const endpoint = `/admin/products/${confirmId}/${action}`;
      const body = action === 'approve'
        ? { notes: notes || 'Approved by admin' }
        : { reason: notes || 'Does not meet listing guidelines' };
      await apiPost(endpoint, body);
      toast.success(`Product ${action === 'approve' ? 'approved' : 'rejected'} successfully`);
      setConfirmId(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setActing(false);
    }
  };

  const confirmTarget = products.find((p) => p.id === confirmId);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="section-heading text-xl">Product Management</h2>
          <p className="text-xs text-surface-500 mt-0.5">Review and approve product listings</p>
        </div>
        <div className="flex gap-2 items-center">
          {(['pending_approval', 'active', 'rejected'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={clsx(
                'px-3 py-1.5 rounded-xl text-xs font-bold transition-all border',
                filter === s
                  ? 'bg-surface-900 text-white border-surface-900'
                  : 'bg-white text-surface-600 border-surface-200 hover:border-surface-400'
              )}
            >
              {s === 'pending_approval' ? 'Pending' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <button
            onClick={load} disabled={loading}
            className="p-2 rounded-xl hover:bg-surface-100 border border-surface-200 transition-colors"
          >
            <RefreshCw className={clsx('w-4 h-4 text-surface-500', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card p-5"><TableSkeleton rows={6} cols={5} /></div>
      ) : products.length === 0 ? (
        <EmptyState
          icon="📦"
          title={filter === 'pending_approval' ? 'No products pending review' : 'No products found'}
          desc={filter === 'pending_approval'
            ? 'All product submissions have been reviewed.'
            : 'No products match this filter.'}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-100">
                  {['Product', 'Store', 'Category', 'Price', 'Status', 'Submitted', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {products.map((p) => (
                  <motion.tr
                    key={p.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-surface-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-surface-900 text-sm max-w-[200px] truncate">{p.name}</p>
                      <p className="text-[11px] text-surface-400 font-mono">{p.sku}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-surface-700 whitespace-nowrap">
                        {p.merchant?.store_name ?? '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-surface-600 whitespace-nowrap">
                        {p.category?.name ?? '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-bold text-surface-900 text-sm">₹{Number(p.retail_price).toFixed(0)}</p>
                      {p.mrp > p.retail_price && (
                        <p className="text-[11px] text-surface-400 line-through">₹{Number(p.mrp).toFixed(0)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.product_status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs text-surface-500">
                        {new Date(p.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {p.product_status === 'pending_approval' && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => openConfirm(p.id, 'approve')}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-500
                                       text-white text-xs font-bold hover:bg-green-600 transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            onClick={() => openConfirm(p.id, 'reject')}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-100
                                       text-red-600 text-xs font-bold hover:bg-red-200 transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirm modal with optional notes field */}
      <ConfirmModal
        open={!!confirmId}
        title={action === 'approve' ? 'Approve Product' : 'Reject Product'}
        desc={`"${confirmTarget?.name ?? ''}" from ${confirmTarget?.merchant?.store_name ?? 'this store'}`}
        confirmLabel={action === 'approve' ? 'Approve' : 'Reject'}
        danger={action === 'reject'}
        loading={acting}
        onConfirm={execute}
        onClose={() => setConfirmId(null)}
      />
    </div>
  );
}

// ── Merchants section ──────────────────────────────────────────
function MerchantsSection() {
  const [merchants, setMerchants] = useState<PendingMerchant[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState<'pending' | 'active' | 'disabled'>('pending');

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/admin/merchants?status=${filter}&limit=50`)
      .then((r) => setMerchants((r.data as any).data?.merchants ?? []))
      .catch(() => toast.error('Failed to load merchants'))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="section-heading text-xl">Merchant Management</h2>
          <p className="text-xs text-surface-500 mt-0.5">Onboard and manage store owners</p>
        </div>
        <div className="flex gap-2 items-center">
          {(['pending', 'active', 'disabled'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={clsx(
                'px-3 py-1.5 rounded-xl text-xs font-bold transition-all border',
                filter === s
                  ? 'bg-surface-900 text-white border-surface-900'
                  : 'bg-white text-surface-600 border-surface-200 hover:border-surface-400'
              )}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <button
            onClick={load} disabled={loading}
            className="p-2 rounded-xl hover:bg-surface-100 border border-surface-200 transition-colors"
          >
            <RefreshCw className={clsx('w-4 h-4 text-surface-500', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card p-5"><TableSkeleton rows={6} cols={5} /></div>
      ) : merchants.length === 0 ? (
        <EmptyState
          icon="🏪"
          title="No merchants found"
          desc={`No ${filter} merchants at this time.`}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-100">
                  {['Store', 'Owner', 'Phone', 'Category', 'Status', 'KYC', 'Joined'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {merchants.map((m) => (
                  <motion.tr
                    key={m.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-surface-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-surface-900 text-sm">{m.store_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-surface-700">{m.owner_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-mono text-surface-600">{m.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-surface-600 whitespace-nowrap">{m.store_category}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={m.merchant_status} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={m.kyc_status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs text-surface-500">
                        {new Date(m.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </p>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Orders section ─────────────────────────────────────────────
function OrdersSection() {
  const [orders,  setOrders]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status,  setStatus]  = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const q = status ? `?status=${status}&limit=50` : '?limit=50';
    api.get(`/admin/orders${q}`)
      .then((r) => setOrders((r.data as any).data?.orders ?? []))
      .catch(() => toast.error('Failed to load orders'))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const ORDER_STATUSES = [
    { value: '',                   label: 'All'        },
    { value: 'payment_processed',  label: 'New'        },
    { value: 'accepted',           label: 'Accepted'   },
    { value: 'out_for_delivery',   label: 'Delivery'   },
    { value: 'delivered',          label: 'Delivered'  },
    { value: 'cancelled',          label: 'Cancelled'  },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="section-heading text-xl">Order Governance</h2>
          <p className="text-xs text-surface-500 mt-0.5">Monitor and manage marketplace orders</p>
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          {ORDER_STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={clsx(
                'px-3 py-1.5 rounded-xl text-xs font-bold transition-all border',
                status === s.value
                  ? 'bg-surface-900 text-white border-surface-900'
                  : 'bg-white text-surface-600 border-surface-200 hover:border-surface-400'
              )}
            >
              {s.label}
            </button>
          ))}
          <button
            onClick={load} disabled={loading}
            className="p-2 rounded-xl hover:bg-surface-100 border border-surface-200 transition-colors"
          >
            <RefreshCw className={clsx('w-4 h-4 text-surface-500', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card p-5"><TableSkeleton rows={6} cols={5} /></div>
      ) : orders.length === 0 ? (
        <EmptyState icon="🛒" title="No orders found" desc="No orders match this filter." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-100">
                  {['Order #', 'Customer', 'Store', 'Amount', 'Status', 'Date'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {orders.map((o: any) => (
                  <motion.tr
                    key={o.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-surface-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-mono font-bold text-surface-900 text-xs">{o.order_number}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-surface-700">{o.customer?.full_name ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-surface-700">{o.merchant?.store_name ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-surface-900 text-sm">₹{Number(o.total_amount ?? 0).toFixed(0)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.order_status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs text-surface-500">
                        {new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </p>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Customers section (summary) ────────────────────────────────
function CustomersSection() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    api.get('/admin/customers?limit=50')
      .then((r) => setCustomers((r.data as any).data?.customers ?? []))
      .catch(() => toast.error('Failed to load customers'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="section-heading text-xl">Customer Management</h2>
        <p className="text-xs text-surface-500 mt-0.5">View and manage registered customers</p>
      </div>

      {loading ? (
        <div className="card p-5"><TableSkeleton rows={6} cols={4} /></div>
      ) : customers.length === 0 ? (
        <EmptyState icon="👥" title="No customers yet" desc="Registered customers will appear here." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-100">
                  {['Customer', 'Phone', 'Wallet', 'Orders', 'Status', 'Joined'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {customers.map((c: any) => (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-surface-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-surface-900 text-sm">{c.full_name}</p>
                      <p className="text-[11px] text-surface-400">{c.email || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-mono text-surface-600">{c.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-surface-900">
                        ₹{Number(c.wallet_balance ?? 0).toFixed(0)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-surface-700">{c.total_orders ?? 0}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold',
                        c.is_blocked
                          ? 'bg-red-100 text-red-600'
                          : 'bg-green-100 text-green-700'
                      )}>
                        {c.is_blocked ? 'Blocked' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs text-surface-500">
                        {new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </p>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
      case 'overview':  return <OverviewSection />;
      case 'products':  return <ProductsSection onCountChange={setPendingCount} />;
      case 'merchants': return <MerchantsSection />;
      case 'orders':    return <OrdersSection />;
      case 'customers': return <CustomersSection />;
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
