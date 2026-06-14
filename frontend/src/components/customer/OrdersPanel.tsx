// src/components/customer/OrdersPanel.tsx
// ─────────────────────────────────────────────────────────────
// Customer Orders Panel — MyLocalBazaar
// Features: Paginated order list | Status filter tabs |
//           Order detail slide-over | Status timeline |
//           Return request trigger
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, ChevronRight, X, Clock, CheckCircle2,
  Truck, AlertCircle, RotateCcw, Search,
  MapPin, Phone, CreditCard, Filter,
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useCustomerOrders, useOrderDetail } from '@/hooks/useDashboard';
import { StatusBadge, EmptyState, TableSkeleton } from '@/components/ui/DashboardPrimitives';
import { apiPost } from '@/lib/api';
import toast from 'react-hot-toast';

dayjs.extend(relativeTime);

// ── Status filter tabs ─────────────────────────────────────────
const STATUS_TABS = [
  { key: '',              label: 'All',       icon: '📦' },
  { key: 'payment_processed', label: 'Confirmed', icon: '✅' },
  { key: 'out_for_delivery',  label: 'En Route',  icon: '🚴' },
  { key: 'delivered',         label: 'Delivered',  icon: '🎉' },
  { key: 'cancelled',         label: 'Cancelled',  icon: '❌' },
  { key: 'return_requested',  label: 'Returned',   icon: '↩️' },
];

// ── Status timeline for order detail ──────────────────────────
const TIMELINE_STEPS = [
  { status: 'payment_processed', label: 'Payment Confirmed', icon: CreditCard },
  { status: 'merchant_approved', label: 'Merchant Approved', icon: CheckCircle2 },
  { status: 'packed',            label: 'Order Packed',       icon: Package },
  { status: 'out_for_delivery',  label: 'Out for Delivery',   icon: Truck },
  { status: 'delivered',         label: 'Delivered',          icon: CheckCircle2 },
];

const STATUS_ORDER = [
  'payment_pending','payment_processed','merchant_approved','accepted',
  'packed','out_for_delivery','delivered',
];

function OrderTimeline({ timeline, currentStatus }: { timeline: any[]; currentStatus: string }) {
  const currentIdx = STATUS_ORDER.indexOf(currentStatus);

  return (
    <div className="space-y-0">
      {TIMELINE_STEPS.map((step, i) => {
        const stepIdx   = STATUS_ORDER.indexOf(step.status);
        const done      = stepIdx <= currentIdx;
        const active    = step.status === currentStatus;
        const Icon      = step.icon;
        // Find matching timeline entry
        const entry     = timeline.find((t) => t.to_status === step.status);

        return (
          <div key={step.status} className="flex gap-3">
            {/* Line + circle */}
            <div className="flex flex-col items-center">
              <div className={clsx(
                'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all',
                done
                  ? 'bg-brand-green text-white shadow-glow-green'
                  : 'bg-surface-100 text-surface-400'
              )}>
                <Icon className="w-4 h-4" />
              </div>
              {i < TIMELINE_STEPS.length - 1 && (
                <div className={clsx(
                  'w-0.5 flex-1 min-h-[24px] my-1 transition-colors',
                  done ? 'bg-brand-green' : 'bg-surface-200'
                )} />
              )}
            </div>

            {/* Content */}
            <div className={clsx('pb-4 flex-1', i === TIMELINE_STEPS.length - 1 && 'pb-0')}>
              <p className={clsx(
                'text-sm font-semibold',
                done ? 'text-surface-900' : 'text-surface-400'
              )}>
                {step.label}
                {active && (
                  <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold
                                   bg-brand-green/10 text-brand-green px-2 py-0.5 rounded-full">
                    Current
                  </span>
                )}
              </p>
              {entry && (
                <p className="text-[11px] text-surface-400 mt-0.5">
                  {dayjs(entry.created_at).fromNow()} · {entry.note || `by ${entry.changed_by_role}`}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Order Detail Slide-Over ────────────────────────────────────
function OrderDetail({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { data, loading } = useOrderDetail(orderId);
  const [returning, setReturning] = useState(false);
  const [returnReason, setReturnReason] = useState('');

  const order = (data?.data as any)?.order;

  const handleReturn = async () => {
    if (!returnReason.trim()) { toast.error('Please provide a reason'); return; }
    try {
      await apiPost(`/orders/${orderId}/return`, {
        reason:       returnReason,
        return_items: order.items.map((item: any) => ({
          order_item_id: item.id,
          quantity:      item.quantity,
        })),
      });
      toast.success('Return request submitted!');
      setReturning(false);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to submit return');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white z-50
                   shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-100">
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-100 transition-colors">
            <X className="w-5 h-5 text-surface-600" />
          </button>
          <div className="flex-1">
            <h2 className="font-display font-bold text-surface-900">Order Details</h2>
            {order && (
              <p className="text-xs text-surface-500 font-mono">{order.order_number}</p>
            )}
          </div>
          {order && <StatusBadge status={order.order_status} />}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <TableSkeleton rows={6} cols={1} />
          ) : order ? (
            <>
              {/* Items */}
              <div className="card p-4">
                <p className="text-xs font-bold text-surface-400 uppercase tracking-wider mb-3">
                  Items Ordered
                </p>
                <div className="space-y-3">
                  {order.items?.map((item: any) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-surface-100 overflow-hidden flex-shrink-0">
                        {item.image ? (
                          <Image src={item.image} alt={item.product_name}
                                 width={48} height={48} className="object-cover w-full h-full" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl">📦</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-surface-900 line-clamp-1">
                          {item.product_name}
                        </p>
                        {item.variant_name && (
                          <p className="text-xs text-surface-400">{item.variant_name}</p>
                        )}
                        <p className="text-xs text-surface-500">Qty: {item.quantity}</p>
                      </div>
                      <p className="text-sm font-bold text-surface-900 flex-shrink-0">
                        ₹{Number(item.line_total).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Price breakdown */}
              <div className="card p-4">
                <p className="text-xs font-bold text-surface-400 uppercase tracking-wider mb-3">
                  Price Breakdown
                </p>
                <div className="space-y-1.5 text-sm">
                  {[
                    ['Subtotal',          `₹${Number(order.subtotal).toFixed(2)}`],
                    ['Delivery',          order.delivery_charge > 0 ? `₹${order.delivery_charge}` : 'Free'],
                    order.discount_amount > 0 ? ['Discount', `-₹${order.discount_amount}`] : null,
                    ['GST',               `₹${Number(order.gst_amount || 0).toFixed(2)}`],
                  ].filter(Boolean).map(([label, value]) => (
                    <div key={label as string} className="flex justify-between">
                      <span className="text-surface-500">{label}</span>
                      <span className={clsx(
                        'font-semibold',
                        (value as string).startsWith('-') ? 'text-green-600' : 'text-surface-900'
                      )}>{value}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 border-t border-surface-100 font-bold text-base">
                    <span>Total Paid</span>
                    <span className="text-brand-green">₹{Number(order.total_amount).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Delivery address */}
              {order.delivery_address && (
                <div className="card p-4">
                  <p className="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2">
                    Delivery Address
                  </p>
                  <div className="flex gap-2 text-sm text-surface-700">
                    <MapPin className="w-4 h-4 text-brand-green flex-shrink-0 mt-0.5" />
                    <span>{order.delivery_address.address_line1}, {order.delivery_address.pincode}</span>
                  </div>
                  {order.delivery_address.phone && (
                    <div className="flex gap-2 text-sm text-surface-500 mt-1">
                      <Phone className="w-4 h-4 flex-shrink-0" />
                      <span>{order.delivery_address.phone}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Status timeline */}
              <div className="card p-4">
                <p className="text-xs font-bold text-surface-400 uppercase tracking-wider mb-4">
                  Order Timeline
                </p>
                <OrderTimeline
                  timeline={order.status_timeline || []}
                  currentStatus={order.order_status}
                />
              </div>

              {/* Delivery OTP */}
              {order.order_status === 'out_for_delivery' && order.delivery_otp && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="card p-4 border-2 border-brand-green bg-green-50"
                >
                  <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-1">
                    Delivery OTP — Share with delivery partner only
                  </p>
                  <p className="font-display text-4xl font-black text-brand-green tracking-widest">
                    {order.delivery_otp}
                  </p>
                </motion.div>
              )}

              {/* Return button */}
              {order.order_status === 'delivered' && (
                <div>
                  {!returning ? (
                    <button
                      onClick={() => setReturning(true)}
                      className="flex items-center gap-2 text-sm font-semibold text-orange-600
                                 hover:text-orange-700 border border-orange-200 hover:bg-orange-50
                                 px-4 py-2.5 rounded-xl transition-colors w-full justify-center"
                    >
                      <RotateCcw className="w-4 h-4" /> Request Return
                    </button>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="card p-4 space-y-3"
                    >
                      <p className="text-sm font-bold text-surface-900">Return Reason</p>
                      <textarea
                        value={returnReason}
                        onChange={(e) => setReturnReason(e.target.value)}
                        placeholder="Describe why you want to return this order…"
                        rows={3}
                        className="input-field resize-none text-sm"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => setReturning(false)} className="btn-ghost flex-1 text-sm">
                          Cancel
                        </button>
                        <button onClick={handleReturn} className="btn-accent flex-1 text-sm">
                          Submit Return
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </>
          ) : (
            <EmptyState icon="❓" title="Order not found" desc="We couldn't load this order." />
          )}
        </div>
      </motion.div>
    </>
  );
}

// ── Order Row ──────────────────────────────────────────────────
function OrderRow({ order, onClick }: { order: any; onClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ x: 2 }}
      onClick={onClick}
      className="card p-4 cursor-pointer hover:border-brand-green/30 transition-all"
    >
      <div className="flex items-start gap-3">
        {/* Thumb */}
        <div className="w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center flex-shrink-0">
          {order.preview_image ? (
            <Image src={order.preview_image} alt="" width={48} height={48}
                   className="object-cover rounded-xl" />
          ) : (
            <span className="text-2xl">🛍️</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="font-bold text-surface-900 text-sm truncate">{order.store_name}</p>
            <StatusBadge status={order.order_status} />
          </div>
          <p className="text-xs text-surface-500 font-mono">{order.order_number}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-sm font-bold text-surface-900">
              ₹{Number(order.total_amount).toFixed(2)}
            </span>
            <span className="text-surface-300">·</span>
            <span className="text-xs text-surface-500">
              {order.item_count} item{order.item_count !== 1 ? 's' : ''}
            </span>
            <span className="text-surface-300">·</span>
            <span className="text-xs text-surface-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {dayjs(order.created_at).fromNow()}
            </span>
          </div>
        </div>

        <ChevronRight className="w-4 h-4 text-surface-300 flex-shrink-0 mt-1" />
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ORDERS PANEL
// ═══════════════════════════════════════════════════════════════
export default function OrdersPanel() {
  const [activeTab,    setActiveTab]    = useState('');
  const [search,       setSearch]       = useState('');
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [page,         setPage]         = useState(1);

  const params: Record<string, string | number> = { page, limit: 10 };
  if (activeTab) params.status = activeTab;

  const { data, loading } = useCustomerOrders(params);
  const orders = (data?.data as any[]) || [];
  const meta   = (data as any)?.meta || {};

  const filtered = search
    ? orders.filter((o: any) =>
        o.order_number.toLowerCase().includes(search.toLowerCase()) ||
        o.store_name.toLowerCase().includes(search.toLowerCase())
      )
    : orders;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h2 className="section-heading text-xl">My Orders</h2>
          <p className="text-xs text-surface-500 mt-0.5">Track and manage all your orders</p>
        </div>

        {/* Search */}
        <div className="sm:ml-auto flex items-center gap-2 bg-white border border-surface-200
                        rounded-xl px-3 py-2.5 w-full sm:w-64">
          <Search className="w-4 h-4 text-surface-400 flex-shrink-0" />
          <input
            type="search" value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search orders…"
            className="flex-1 bg-transparent text-sm text-surface-900 placeholder-surface-400
                       focus:outline-none"
          />
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setPage(1); }}
            className={clsx(
              'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold',
              'whitespace-nowrap transition-all duration-200',
              activeTab === tab.key
                ? 'bg-brand-green text-white shadow-sm'
                : 'bg-white text-surface-600 border border-surface-200 hover:border-surface-300'
            )}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {/* Orders list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4">
              <div className="flex gap-3">
                <div className="skeleton w-12 h-12 rounded-xl flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-1/2 rounded" />
                  <div className="skeleton h-3 w-1/3 rounded" />
                  <div className="skeleton h-3 w-2/3 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="📦"
          title="No orders yet"
          desc="When you place your first order, it will appear here."
          action={{ label: 'Start Shopping', href: '/' }}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((order: any) => (
            <OrderRow key={order.id} order={order} onClick={() => setSelectedId(order.id)} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={!meta.hasPrev}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="btn-ghost text-xs !px-4 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-xs text-surface-500">
            Page {meta.page} of {meta.totalPages}
          </span>
          <button
            disabled={!meta.hasNext}
            onClick={() => setPage((p) => p + 1)}
            className="btn-ghost text-xs !px-4 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}

      {/* Order detail slide-over */}
      <AnimatePresence>
        {selectedId && (
          <OrderDetail orderId={selectedId} onClose={() => setSelectedId(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
