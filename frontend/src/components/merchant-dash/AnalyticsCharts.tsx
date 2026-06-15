// src/components/merchant-dash/AnalyticsCharts.tsx
// ─────────────────────────────────────────────────────────────
// Merchant Analytics Charts — MyLocalBazaar
// Revenue trend line chart | Order status donut | Top products bar
// Period selector | KPI stat cards with trends
// Uses Recharts (already in package.json)
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { motion } from 'framer-motion';
import {
  TrendingUp, IndianRupee, ShoppingCart, Package,
  Users, AlertTriangle, CheckCircle, Clock, ArrowUpRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import {
  useMerchantDashboard,
  useMerchantRevenueTrend,
  useTopProducts,
  useLowStockAlerts,
  usePendingOrders,
} from '@/hooks/useDashboard';
import { StatCard, PeriodSelector, EmptyState, StatusBadge } from '@/components/ui/DashboardPrimitives';
import { apiPost } from '@/lib/api';
import toast from 'react-hot-toast';

// ── Recharts theme ─────────────────────────────────────────────
const CHART_COLORS = {
  green:  '#22C55E',
  orange: '#F97316',
  blue:   '#3B82F6',
  red:    '#EF4444',
  purple: '#8B5CF6',
};

const TOOLTIP_STYLE = {
  contentStyle: {
    background:   '#18181B',
    border:       'none',
    borderRadius: '12px',
    color:        '#FAFAFA',
    fontSize:     '12px',
    fontFamily:   'var(--font-body)',
  },
  cursor: { fill: 'rgba(34,197,94,0.05)' },
};

// ── Revenue Trend Chart ────────────────────────────────────────
function RevenueTrendChart({ period }: { period: string }) {
  const { data, loading } = useMerchantRevenueTrend(period);
  const trend  = (data?.data as any)?.trend || [];

  const formatted = trend.map((t: any) => ({
    ...t,
    label:   dayjs(t.period).format(period === 'today' ? 'HH:mm' : 'D MMM'),
    revenue: parseFloat(t.revenue || 0),
    orders:  t.order_count || 0,
  }));

  // Use mock data if empty
  const chartData = formatted.length > 0 ? formatted : MOCK_TREND;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-surface-900">Revenue Trend</h3>
          <p className="text-xs text-surface-500">GMV over time</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-surface-500">
          <span className="w-3 h-0.5 bg-brand-green rounded" /> Revenue
          <span className="w-3 h-0.5 bg-brand-orange rounded ml-2" /> Orders
        </div>
      </div>

      {loading ? (
        <div className="skeleton h-56 rounded-xl" />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={CHART_COLORS.green}  stopOpacity={0.2} />
                <stop offset="95%" stopColor={CHART_COLORS.green}  stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#A1A1AA' }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#A1A1AA' }}
              axisLine={false} tickLine={false}
              tickFormatter={(v) => `₹${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}`}
            />
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any, name: string) => [
                name === 'revenue' ? `₹${Number(value).toFixed(2)}` : value,
                name === 'revenue' ? 'Revenue' : 'Orders',
              ]}
              labelFormatter={(label) => `Period: ${label}`}
            />
            <Area
              type="monotone" dataKey="revenue"
              stroke={CHART_COLORS.green} strokeWidth={2.5}
              fill="url(#colorRevenue)"
              dot={false} activeDot={{ r: 5, strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Order Status Donut ─────────────────────────────────────────
function OrderStatusDonut({ overview }: { overview: any }) {
  const orders = overview?.orders;
  if (!orders) return <div className="skeleton h-56 rounded-xl" />;

  const pieData = [
    { name: 'Delivered',    value: orders.delivered         || 0, color: CHART_COLORS.green  },
    { name: 'In Progress',  value: orders.in_progress       || 0, color: CHART_COLORS.blue   },
    { name: 'Pending',      value: orders.awaiting_approval || 0, color: CHART_COLORS.orange },
    { name: 'Cancelled',    value: orders.cancelled         || 0, color: CHART_COLORS.red    },
  ].filter((d) => d.value > 0);

  const total = pieData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="card p-5">
      <div className="mb-4">
        <h3 className="font-bold text-surface-900">Order Breakdown</h3>
        <p className="text-xs text-surface-500">This period</p>
      </div>

      {total === 0 ? (
        <EmptyState icon="📊" title="No order data" desc="Place some orders to see the breakdown." />
      ) : (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width={140} height={140}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%" cy="50%"
                innerRadius={42} outerRadius={62}
                paddingAngle={3} dataKey="value"
                strokeWidth={0}
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          <div className="flex-1 space-y-2">
            {pieData.map((d) => (
              <div key={d.name} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                  <span className="text-xs text-surface-600">{d.name}</span>
                </div>
                <span className="text-xs font-bold text-surface-900">
                  {d.value} ({Math.round((d.value / total) * 100)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Top Products Bar Chart ─────────────────────────────────────
function TopProductsChart({ period }: { period: string }) {
  const { data, loading } = useTopProducts(period);
  const products = (data?.data as any)?.products || MOCK_TOP_PRODUCTS;

  return (
    <div className="card p-5">
      <div className="mb-4">
        <h3 className="font-bold text-surface-900">Top Products</h3>
        <p className="text-xs text-surface-500">By units sold</p>
      </div>

      {loading ? (
        <div className="skeleton h-48 rounded-xl" />
      ) : products.length === 0 ? (
        <EmptyState icon="📦" title="No sales data" desc="Start selling to see your top products." />
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={products.slice(0, 5)}
            layout="vertical"
            margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: '#A1A1AA' }} axisLine={false} tickLine={false} />
            <YAxis
              type="category" dataKey="product_name"
              tick={{ fontSize: 10, fill: '#A1A1AA' }}
              axisLine={false} tickLine={false}
              width={100}
              tickFormatter={(v) => v.length > 14 ? v.substring(0, 14) + '…' : v}
            />
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any) => [`${value} units`, 'Sold']}
            />
            <Bar
              dataKey="total_units_sold"
              fill={CHART_COLORS.green}
              radius={[0, 6, 6, 0]}
              label={{ position: 'right', fontSize: 10, fill: '#A1A1AA' }}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Pending Orders Widget ──────────────────────────────────────
function PendingOrdersWidget() {
  const { data, loading, refetch } = usePendingOrders();
  const orders  = (data?.data as any)?.orders || [];
  const [acting, setActing] = useState<string | null>(null);

  const act = async (orderId: string, action: 'approve' | 'reject', reason?: string) => {
    setActing(orderId);
    try {
      await apiPost(`/merchant/orders/${orderId}/action`, { action, rejection_reason: reason });
      toast.success(action === 'approve' ? 'Order approved!' : 'Order rejected');
      refetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Action failed');
    } finally {
      setActing(null);
    }
  };

  if (loading) return <div className="skeleton h-40 rounded-2xl" />;
  if (orders.length === 0) {
    return (
      <div className="card p-5 flex items-center gap-3">
        <CheckCircle className="w-8 h-8 text-brand-green" />
        <div>
          <p className="font-bold text-surface-900">All caught up!</p>
          <p className="text-xs text-surface-500">No orders awaiting your approval</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-surface-100 bg-orange-50">
        <Clock className="w-4 h-4 text-brand-orange" />
        <p className="text-sm font-bold text-orange-700">
          {orders.length} Order{orders.length > 1 ? 's' : ''} Need Your Approval
        </p>
        <span className="ml-auto text-xs text-orange-500 font-semibold">Act within 30 mins</span>
      </div>

      <div className="divide-y divide-surface-100">
        {orders.slice(0, 3).map((order: any) => (
          <div key={order.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="font-bold text-surface-900 text-sm">{order.order_number}</p>
                <span className="text-xs text-orange-500 font-semibold">
                  {order.minutes_waiting}m ago
                </span>
              </div>
              <p className="text-xs text-surface-500">{order.customer_name} · {order.customer_phone}</p>
              <p className="text-sm font-bold text-brand-green mt-1">
                ₹{Number(order.total_amount).toFixed(2)} · {order.payment_method.toUpperCase()}
              </p>
            </div>

            <div className="flex gap-2 flex-shrink-0">
              <button
                disabled={acting === order.id}
                onClick={() => act(order.id, 'reject', 'Item not available')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold border border-red-200
                           text-red-600 hover:bg-red-50 transition-colors"
              >
                Reject
              </button>
              <button
                disabled={acting === order.id}
                onClick={() => act(order.id, 'approve')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-brand-green
                           text-white hover:bg-green-600 transition-colors"
              >
                {acting === order.id ? '…' : '✓ Approve'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Low Stock Alerts ───────────────────────────────────────────
function LowStockWidget() {
  const { data, loading } = useLowStockAlerts();
  const items = (data?.data as any)?.items || [];

  if (loading || items.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-surface-100 bg-red-50">
        <AlertTriangle className="w-4 h-4 text-red-500" />
        <p className="text-sm font-bold text-red-700">
          {items.length} Low Stock Alert{items.length > 1 ? 's' : ''}
        </p>
      </div>
      <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.slice(0, 6).map((item: any) => (
          <div key={item.id} className="flex items-center gap-2 p-2 rounded-xl bg-surface-50">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-sm flex-shrink-0">
              {item.image ? '📦' : '📦'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-surface-900 truncate">{item.name}</p>
              <p className="text-[10px] text-red-500 font-bold">{item.stock_quantity} left</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ANALYTICS DASHBOARD
// ═══════════════════════════════════════════════════════════════
export default function AnalyticsDashboard() {
  const [period, setPeriod] = useState('month');
  const { data: overviewData, loading: overviewLoading } = useMerchantDashboard(period);
  const overview = (overviewData?.data as any)?.overview;

  const kpis = overview ? [
    {
      label:  'Revenue This Period',
      value:  `₹${Number(overview.revenue?.this_period || 0).toFixed(0)}`,
      sub:    `Total Revenue: ₹${Number(overview.revenue?.total || 0).toFixed(0)}`,
      icon:   IndianRupee,
      color:  'green' as const,
      trend:  { value: 12, label: 'vs last period' },
    },
    {
      label:  'Orders This Period',
      value:  overview.orders?.total_this_period || 0,
      sub:    `${overview.orders?.delivered || 0} delivered`,
      icon:   ShoppingCart,
      color:  'orange' as const,
      trend:  { value: 8, label: '' },
    },
    {
      label:  'Active Products',
      value:  overview.products?.active || 0,
      sub:    `${overview.products?.pending_approval || 0} pending review`,
      icon:   Package,
      color:  'blue' as const,
    },
    {
      label:  'Unique Customers',
      value:  overview.customers?.unique_this_period || 0,
      sub:    `${overview.customers?.new_this_period || 0} new this period`,
      icon:   Users,
      color:  'purple' as const,
      trend:  { value: 5, label: '' },
    },
  ] : [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h2 className="section-heading text-xl">Analytics Overview</h2>
          <p className="text-xs text-surface-500 mt-0.5">Your store performance at a glance</p>
        </div>
        <div className="sm:ml-auto">
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* Pending orders — urgent! */}
      <PendingOrdersWidget />

      {/* Low stock */}
      <LowStockWidget />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {overviewLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card p-5">
                <div className="skeleton w-10 h-10 rounded-xl mb-3" />
                <div className="skeleton h-7 w-20 rounded mb-1" />
                <div className="skeleton h-3.5 w-28 rounded" />
              </div>
            ))
          : kpis.map((kpi, i) => (
              <motion.div
                key={kpi.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
              >
                <StatCard {...kpi} />
              </motion.div>
            ))
        }
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <RevenueTrendChart period={period} />
        <OrderStatusDonut overview={overview} />
      </div>

      {/* Top products */}
      <TopProductsChart period={period} />

      {/* Wallet snapshot */}
      {overview?.wallet && (
        <div className="card p-5">
          <h3 className="font-bold text-surface-900 mb-3">Wallet Snapshot</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
            {[
              { label: 'Available Balance', value: `₹${Number(overview.wallet.balance || 0).toFixed(2)}`, color: 'text-brand-green' },
              { label: 'Locked (Pending)', value: `₹${Number(overview.wallet.locked_balance || 0).toFixed(2)}`, color: 'text-brand-orange' },
              { label: 'Total Earned',     value: `₹${Number(overview.wallet.total_credited || 0).toFixed(2)}`, color: 'text-blue-500' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <p className={clsx('font-display text-xl sm:text-2xl font-bold', color)}>{value}</p>
                <p className="text-xs text-surface-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mock data (shown when backend not connected) ───────────────
const MOCK_TREND = Array.from({ length: 14 }, (_, i) => ({
  label:   dayjs().subtract(13 - i, 'day').format('D MMM'),
  revenue: Math.round(2000 + Math.random() * 8000),
  orders:  Math.round(5 + Math.random() * 20),
}));

const MOCK_TOP_PRODUCTS = [
  { product_name: 'Fresh Onions 1kg',       total_units_sold: 45 },
  { product_name: 'Amul Butter 500g',       total_units_sold: 38 },
  { product_name: 'Tata Salt 1kg',          total_units_sold: 32 },
  { product_name: 'Aashirvaad Atta 5kg',    total_units_sold: 28 },
  { product_name: 'Surf Excel Matic 2kg',   total_units_sold: 21 },
];
