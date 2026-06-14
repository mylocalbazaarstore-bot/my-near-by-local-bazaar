// src/components/admin-dash/PlatformAnalytics.tsx
// ─────────────────────────────────────────────────────────────
// Admin Platform Analytics — MyLocalBazaar
// Revenue trend | Top merchants | Geographic coverage | Fraud signals
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  ComposedChart, Area, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { RefreshCw, AlertTriangle, TrendingUp, Users, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { EmptyState, TableSkeleton, PeriodSelector } from '@/components/ui/DashboardPrimitives';
import toast from 'react-hot-toast';

const CHART_COLORS = {
  green:  '#22C55E',
  orange: '#F97316',
  blue:   '#3B82F6',
  red:    '#EF4444',
};

const TOOLTIP_STYLE = {
  contentStyle: {
    background:   '#18181B',
    border:       'none',
    borderRadius: '12px',
    color:        '#FAFAFA',
    fontSize:     '12px',
  },
  cursor: { fill: 'rgba(239,68,68,0.05)' },
};

interface RevenuePoint {
  period:           string;
  order_count:      number;
  gmv:              number;
  platform_revenue: number;
  delivery_revenue: number;
  refunds:          number;
  cancellations:    number;
}

interface TopMerchant {
  id:               string;
  store_name:       string;
  store_category:   string;
  merchant_status:  string;
  order_count:      number;
  revenue:          number;
  delivered_count:  number;
  fulfillment_rate: number | null;
}

interface GeoRow {
  area_id:          string;
  area_name:        string;
  pincode:          string;
  city_name:        string;
  merchant_count:   number;
  active_merchants: number;
  unique_customers: number;
  total_orders:     number;
  area_gmv:         number;
  coverage_score:   'high' | 'medium' | 'low';
}

interface FraudSignals {
  high_value_refunds:  { id: string; full_name: string; phone: string; refund_count: number; refund_total: number }[];
  rapid_order_users:   { user_id: string; order_count: number; first_order: string; last_order: string }[];
  new_user_high_value: { id: string; full_name: string; phone: string; registered_at: string; order_number: string; total_amount: number; payment_method: string }[];
  generated_at: string;
}

const COVERAGE_STYLES: Record<string, string> = {
  high:   'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low:    'bg-red-100 text-red-600',
};

export default function PlatformAnalytics() {
  const [period, setPeriod] = useState('month');

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h2 className="section-heading text-xl">Platform Analytics</h2>
          <p className="text-xs text-surface-500 mt-0.5">Marketplace performance, growth and risk signals</p>
        </div>
        <div className="sm:ml-auto">
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      <RevenueTrendChart period={period} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TopMerchantsChart period={period} />
        <FraudSignalsPanel />
      </div>

      <GeographicTable />
    </div>
  );
}

// ── Revenue trend (composed area + line) ──────────────────────────
function RevenueTrendChart({ period }: { period: string }) {
  const [data,    setData]    = useState<RevenuePoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/admin/analytics/revenue-trend?period=${period}`)
      .then((r) => setData((r.data as any).data?.trend || []))
      .catch(() => toast.error('Failed to load revenue trend'))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const chartData = data.map((d) => ({
    ...d,
    label: dayjs(d.period).format(period === 'today' ? 'HH:mm' : 'D MMM'),
  }));

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-surface-900">Revenue Trend</h3>
          <p className="text-xs text-surface-500">GMV vs. platform revenue</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-surface-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-brand-green rounded" /> GMV</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-brand-orange rounded" /> Platform Revenue</span>
        </div>
      </div>

      {loading ? (
        <div className="skeleton h-64 rounded-xl" />
      ) : chartData.length === 0 ? (
        <EmptyState icon="📈" title="No revenue data" desc="No orders found for this period yet." />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="colorGmv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={CHART_COLORS.green} stopOpacity={0.2} />
                <stop offset="95%" stopColor={CHART_COLORS.green} stopOpacity={0.01} />
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
                name === 'gmv' ? 'GMV' : name === 'platform_revenue' ? 'Platform Revenue' : name,
              ]}
              labelFormatter={(label) => `Period: ${label}`}
            />
            <Area type="monotone" dataKey="gmv" stroke={CHART_COLORS.green} strokeWidth={2.5} fill="url(#colorGmv)" dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />
            <Line type="monotone" dataKey="platform_revenue" stroke={CHART_COLORS.orange} strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Top 10 merchants by revenue ────────────────────────────────────
function TopMerchantsChart({ period }: { period: string }) {
  const [merchants, setMerchants] = useState<TopMerchant[]>([]);
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/admin/analytics/top-merchants?period=${period}`)
      .then((r) => setMerchants((r.data as any).data?.merchants || []))
      .catch(() => toast.error('Failed to load top merchants'))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-surface-900">Top 10 Merchants</h3>
          <p className="text-xs text-surface-500">By revenue this period</p>
        </div>
        <TrendingUp className="w-4 h-4 text-brand-green" />
      </div>

      {loading ? (
        <div className="skeleton h-64 rounded-xl" />
      ) : merchants.length === 0 ? (
        <EmptyState icon="🏪" title="No revenue yet" desc="No merchants have generated revenue this period." />
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(220, merchants.length * 32)}>
          <BarChart
            data={merchants.slice(0, 10)}
            layout="vertical"
            margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: '#A1A1AA' }} axisLine={false} tickLine={false}
                   tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} />
            <YAxis
              type="category" dataKey="store_name"
              tick={{ fontSize: 10, fill: '#A1A1AA' }}
              axisLine={false} tickLine={false}
              width={110}
              tickFormatter={(v) => v.length > 16 ? `${v.substring(0, 16)}…` : v}
            />
            <Tooltip {...TOOLTIP_STYLE} formatter={(value: any) => [`₹${Number(value).toFixed(2)}`, 'Revenue']} />
            <Bar dataKey="revenue" fill={CHART_COLORS.green} radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Fraud signals panel ─────────────────────────────────────────────
function FraudSignalsPanel() {
  const [signals, setSignals] = useState<FraudSignals | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/admin/analytics/fraud-signals')
      .then((r) => setSignals((r.data as any).data?.signals || null))
      .catch(() => toast.error('Failed to load fraud signals'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = signals
    ? signals.high_value_refunds.length + signals.rapid_order_users.length + signals.new_user_high_value.length
    : 0;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-surface-900">Fraud Signals</h3>
          <p className="text-xs text-surface-500">Accounts flagged for review</p>
        </div>
        <button onClick={load} disabled={loading} className="p-2 rounded-xl hover:bg-surface-100 transition-colors">
          <RefreshCw className={clsx('w-4 h-4 text-surface-500', loading && 'animate-spin')} />
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={4} cols={1} />
      ) : !signals || total === 0 ? (
        <EmptyState icon="✅" title="No fraud signals" desc="No suspicious activity detected right now." />
      ) : (
        <div className="space-y-4 max-h-80 overflow-y-auto">
          {signals.high_value_refunds.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-surface-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> High-Value Refunds (7d)
              </p>
              <div className="space-y-1.5">
                {signals.high_value_refunds.map((u) => (
                  <div key={u.id} className="flex items-center justify-between text-sm bg-red-50 rounded-xl px-3 py-2">
                    <div>
                      <p className="font-semibold text-surface-900">{u.full_name}</p>
                      <p className="text-[11px] text-surface-400">{u.phone}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-red-600">₹{Number(u.refund_total).toFixed(0)}</p>
                      <p className="text-[11px] text-surface-400">{u.refund_count} refunds</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {signals.rapid_order_users.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-surface-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-orange-500" /> Rapid Order Bursts (24h)
              </p>
              <div className="space-y-1.5">
                {signals.rapid_order_users.map((u, i) => (
                  <div key={`${u.user_id}-${i}`} className="flex items-center justify-between text-sm bg-orange-50 rounded-xl px-3 py-2">
                    <p className="font-mono text-[11px] text-surface-600">{u.user_id.slice(0, 8)}…</p>
                    <div className="text-right">
                      <p className="font-bold text-orange-600">{u.order_count} orders</p>
                      <p className="text-[11px] text-surface-400">
                        {dayjs(u.first_order).format('HH:mm')} – {dayjs(u.last_order).format('HH:mm')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {signals.new_user_high_value.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-surface-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-purple-500" /> New Users, High-Value Orders
              </p>
              <div className="space-y-1.5">
                {signals.new_user_high_value.map((u) => (
                  <div key={u.order_number} className="flex items-center justify-between text-sm bg-purple-50 rounded-xl px-3 py-2">
                    <div>
                      <p className="font-semibold text-surface-900">{u.full_name}</p>
                      <p className="text-[11px] text-surface-400 font-mono">{u.order_number}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-purple-600">₹{Number(u.total_amount).toFixed(0)}</p>
                      <p className="text-[11px] text-surface-400">{u.payment_method.toUpperCase()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Geographic coverage table ─────────────────────────────────────
function GeographicTable() {
  const [rows,    setRows]    = useState<GeoRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/admin/analytics/geographic')
      .then((r) => setRows((r.data as any).data?.heatmap || []))
      .catch(() => toast.error('Failed to load geographic report'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
        <div>
          <h3 className="font-bold text-surface-900">Geographic Coverage</h3>
          <p className="text-xs text-surface-500">Order volume and merchant density by area</p>
        </div>
        <button onClick={load} disabled={loading} className="p-2 rounded-xl hover:bg-surface-100 transition-colors">
          <RefreshCw className={clsx('w-4 h-4 text-surface-500', loading && 'animate-spin')} />
        </button>
      </div>

      {loading ? (
        <div className="p-5"><TableSkeleton rows={6} cols={6} /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon="🗺️" title="No geographic data" desc="No active service areas found." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-50 border-b border-surface-100">
                {['Area', 'City', 'Pincode', 'Merchants', 'Customers', 'Orders', 'GMV', 'Coverage'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-50">
              {rows.map((r) => (
                <tr key={r.area_id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-semibold text-surface-900 whitespace-nowrap">{r.area_name}</td>
                  <td className="px-4 py-3 text-sm text-surface-600 whitespace-nowrap">{r.city_name}</td>
                  <td className="px-4 py-3 text-sm font-mono text-surface-600">{r.pincode}</td>
                  <td className="px-4 py-3 text-sm text-surface-700">{r.active_merchants}/{r.merchant_count}</td>
                  <td className="px-4 py-3 text-sm text-surface-700">{r.unique_customers}</td>
                  <td className="px-4 py-3 text-sm text-surface-700">{r.total_orders}</td>
                  <td className="px-4 py-3 text-sm font-bold text-surface-900">₹{Number(r.area_gmv).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3">
                    <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize', COVERAGE_STYLES[r.coverage_score])}>
                      {r.coverage_score}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
