// src/components/admin-dash/OverviewSection.tsx
// ─────────────────────────────────────────────────────────────
// Admin Dashboard — Platform Overview (landing section)
// KPI cards | 30-day revenue trend | KYC & order override queues
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import {
  Store, Users, Package, ShoppingCart, IndianRupee, TrendingUp,
  AlertTriangle, RefreshCw, ArrowRight, ShieldCheck, ClipboardCheck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { StatCard, PeriodSelector, EmptyState } from '@/components/ui/DashboardPrimitives';
import toast from 'react-hot-toast';

const CHART_COLORS = { green: '#22C55E', orange: '#F97316' };
const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#18181B', border: 'none', borderRadius: '12px',
    color: '#FAFAFA', fontSize: '12px',
  },
  cursor: { fill: 'rgba(34,197,94,0.05)' },
};

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

interface RevenuePoint {
  period:           string;
  gmv:              number;
  platform_revenue: number;
}

type NavTarget = 'kyc' | 'orders' | 'merchants' | 'products';

export default function OverviewSection({ onNavigate }: { onNavigate: (s: NavTarget) => void }) {
  const [data,    setData]    = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [period,  setPeriod]  = useState('month');

  const [trend,        setTrend]        = useState<RevenuePoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);

  const [kycPending,   setKycPending]   = useState<number | null>(null);
  const [overridePending, setOverridePending] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/admin/analytics/overview?period=${period}`)
      .then((r) => setData((r.data as any).data?.overview ?? null))
      .catch(() => toast.error('Failed to load overview'))
      .finally(() => setLoading(false));
  }, [period]);

  const loadQueues = useCallback(() => {
    api.get('/admin/merchants?kyc_status=submitted&limit=1')
      .then((r) => setKycPending((r.data as any).meta?.total ?? 0))
      .catch(() => setKycPending(null));
    api.get('/admin/orders?status=payment_processed&limit=1')
      .then((r) => setOverridePending((r.data as any).meta?.total ?? 0))
      .catch(() => setOverridePending(null));
  }, []);

  const loadTrend = useCallback(() => {
    setTrendLoading(true);
    api.get('/admin/analytics/revenue-trend?period=month')
      .then((r) => setTrend((r.data as any).data?.trend || []))
      .catch(() => toast.error('Failed to load revenue trend'))
      .finally(() => setTrendLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadQueues(); }, [loadQueues]);
  useEffect(() => { loadTrend(); }, [loadTrend]);

  const chartData = trend.map((d) => ({ ...d, label: dayjs(d.period).format('D MMM') }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="section-heading text-xl">Platform Overview</h2>
          <p className="text-xs text-surface-500 mt-0.5">System-wide marketplace metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelector value={period} onChange={setPeriod} />
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

      {/* Revenue trend chart (last 30 days) */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-surface-900">Revenue Trend</h3>
            <p className="text-xs text-surface-500">GMV vs. platform revenue — last 30 days</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-surface-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-brand-green rounded" /> GMV</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-brand-orange rounded" /> Platform Revenue</span>
          </div>
        </div>

        {trendLoading ? (
          <div className="skeleton h-64 rounded-xl" />
        ) : chartData.length === 0 ? (
          <EmptyState icon="📈" title="No revenue data" desc="No orders found in the last 30 days." />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="ovGmv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={CHART_COLORS.green} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={CHART_COLORS.green} stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="ovRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={CHART_COLORS.orange} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={CHART_COLORS.orange} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#A1A1AA' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 10, fill: '#A1A1AA' }}
                axisLine={false} tickLine={false}
                tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any, name: string) => [
                  `₹${Number(value).toFixed(2)}`,
                  name === 'gmv' ? 'GMV' : 'Platform Revenue',
                ]}
                labelFormatter={(label) => `Date: ${label}`}
              />
              <Area type="monotone" dataKey="gmv" stroke={CHART_COLORS.green} strokeWidth={2.5} fill="url(#ovGmv)" dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />
              <Area type="monotone" dataKey="platform_revenue" stroke={CHART_COLORS.orange} strokeWidth={2.5} fill="url(#ovRevenue)" dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Quick action panels + marketplace health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 flex flex-col">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-4.5 h-4.5 text-red-500" />
            </div>
            <h3 className="font-bold text-surface-900 text-sm">KYC Review Queue</h3>
          </div>
          <p className="font-display text-3xl font-bold text-surface-900 mb-1">
            {kycPending === null ? '—' : kycPending}
          </p>
          <p className="text-xs text-surface-500 mb-4 flex-1">Merchants awaiting document verification</p>
          <button
            onClick={() => onNavigate('kyc')}
            className="btn-primary text-xs w-full flex items-center justify-center gap-1.5"
          >
            Review Now <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="card p-5 flex flex-col">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <ClipboardCheck className="w-4.5 h-4.5 text-blue-500" />
            </div>
            <h3 className="font-bold text-surface-900 text-sm">Pending Order Overrides</h3>
          </div>
          <p className="font-display text-3xl font-bold text-surface-900 mb-1">
            {overridePending === null ? '—' : overridePending}
          </p>
          <p className="text-xs text-surface-500 mb-4 flex-1">Orders awaiting payment confirmation review</p>
          <button
            onClick={() => onNavigate('orders')}
            className="btn-primary text-xs w-full flex items-center justify-center gap-1.5"
          >
            View <ArrowRight className="w-3.5 h-3.5" />
          </button>
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
              {
                label: 'Pending Merchants',
                value: data ? `${data.merchants.pending}` : '—',
                good: false,
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
