// src/components/merchant-dash/OrdersManagement.tsx
// ─────────────────────────────────────────────────────────────
// Merchant Orders Management — MyLocalBazaar
// View + approve/reject orders | Update lifecycle status |
// Track returns and return responses
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle, XCircle, Package, Truck, Clock,
  ChevronRight, Search, AlertCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useMerchantOrders } from '@/hooks/useDashboard';
import { StatusBadge, EmptyState, TableSkeleton, ConfirmModal } from '@/components/ui/DashboardPrimitives';
import { apiPost, apiPatch } from '@/lib/api';
import toast from 'react-hot-toast';

dayjs.extend(relativeTime);

// Status lifecycle buttons
const STATUS_ACTIONS: Record<string, { next: string; label: string; icon: React.ElementType; color: string }> = {
  merchant_approved: { next: 'accepted',        label: 'Mark Accepted',      icon: CheckCircle, color: 'bg-teal-500' },
  accepted:          { next: 'packed',           label: 'Mark Packed',        icon: Package,     color: 'bg-indigo-500' },
  packed:            { next: 'out_for_delivery', label: 'Out for Delivery',   icon: Truck,       color: 'bg-violet-500' },
  out_for_delivery:  { next: 'delivered',        label: 'Mark Delivered',     icon: CheckCircle, color: 'bg-green-500' },
};

function OrderCard({ order, onAction }: {
  order: any;
  onAction: (id: string, action: string, data?: any) => void;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason,     setReason]     = useState('');
  const nextAction = STATUS_ACTIONS[order.order_status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-4 hover:border-brand-green/20 transition-colors"
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-bold text-surface-900 text-sm">{order.order_number}</p>
            {order.order_status === 'payment_processed' && (
              <span className="badge bg-orange-100 text-orange-700 text-[10px] animate-pulse-ring">
                ⏰ Needs Approval
              </span>
            )}
          </div>
          <p className="text-xs text-surface-500">
            {order.customer_name} · {order.customer_phone}
          </p>
        </div>
        <StatusBadge status={order.order_status} />
      </div>

      {/* Info row */}
      <div className="flex items-center gap-4 text-xs text-surface-500 mb-3">
        <span className="font-bold text-base text-surface-900">
          ₹{Number(order.total_amount).toFixed(2)}
        </span>
        <span>·</span>
        <span>{order.item_count} item{order.item_count !== 1 ? 's' : ''}</span>
        <span>·</span>
        <span className="uppercase text-[10px] font-bold">{order.payment_method}</span>
        <span>·</span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {dayjs(order.created_at).fromNow()}
        </span>
      </div>

      {/* Delivery address preview */}
      {order.delivery_preview && (
        <p className="text-xs text-surface-400 bg-surface-50 rounded-lg px-3 py-2 mb-3 line-clamp-1">
          📍 {order.delivery_preview}, {order.delivery_pincode}
        </p>
      )}

      {/* Delivery OTP */}
      {order.order_status === 'out_for_delivery' && order.delivery_otp && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200
                        rounded-xl px-3 py-2 mb-3">
          <span className="text-xs font-bold text-green-700">Delivery OTP:</span>
          <span className="font-mono font-black text-xl text-brand-green">{order.delivery_otp}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mt-1">
        {/* Approve / Reject — only for payment_processed */}
        {order.order_status === 'payment_processed' && (
          <>
            <button
              onClick={() => {
                setReason('');
                setRejectOpen(true);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                         border border-red-200 text-red-600 text-xs font-bold
                         hover:bg-red-50 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" /> Reject
            </button>
            <button
              onClick={() => onAction(order.id, 'approve')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                         bg-brand-green text-white text-xs font-bold
                         hover:bg-green-600 transition-colors"
            >
              <CheckCircle className="w-3.5 h-3.5" /> Approve
            </button>
          </>
        )}

        {/* Lifecycle status update */}
        {nextAction && order.order_status !== 'payment_processed' && (
          <button
            onClick={() => onAction(order.id, 'status', { status: nextAction.next })}
            className={clsx(
              'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl',
              'text-white text-xs font-bold transition-colors',
              nextAction.color, 'hover:opacity-90'
            )}
          >
            <nextAction.icon className="w-3.5 h-3.5" />
            {nextAction.label}
          </button>
        )}
      </div>

      {/* Reject form inline */}
      {rejectOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-3 space-y-2"
        >
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for rejection (required)…"
            rows={2}
            className="input-field resize-none text-xs"
          />
          <div className="flex gap-2">
            <button onClick={() => setRejectOpen(false)} className="btn-ghost flex-1 text-xs !py-2">
              Cancel
            </button>
            <button
              onClick={() => {
                if (!reason.trim()) { toast.error('Rejection reason required'); return; }
                onAction(order.id, 'reject', { rejection_reason: reason });
                setRejectOpen(false);
              }}
              className="flex-1 py-2 rounded-xl bg-red-500 text-white text-xs font-bold hover:bg-red-600"
            >
              Confirm Reject
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

export default function OrdersManagement() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page,   setPage]   = useState(1);
  const [acting, setActing] = useState<string | null>(null);

  const params: Record<string, string | number> = { page, limit: 12 };
  if (status) params.status = status;

  const { data, loading, refetch } = useMerchantOrders(params);
  const orders = (data?.data as any[]) || [];
  const meta   = (data as any)?.meta || {};

  const handleAction = async (orderId: string, action: string, extra?: any) => {
    setActing(orderId);
    try {
      if (action === 'approve' || action === 'reject') {
        await apiPost(`/merchant/orders/${orderId}/action`, {
          action,
          ...extra,
        });
        toast.success(action === 'approve' ? 'Order approved!' : 'Order rejected');
      } else if (action === 'status') {
        await apiPatch(`/merchant/orders/${orderId}/status`, extra);
        toast.success(`Order status updated to ${extra.status.replace(/_/g, ' ')}`);
      }
      refetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Action failed');
    } finally {
      setActing(null);
    }
  };

  const filtered = search
    ? orders.filter((o: any) =>
        o.order_number.toLowerCase().includes(search.toLowerCase()) ||
        o.customer_name?.toLowerCase().includes(search.toLowerCase())
      )
    : orders;

  const STATUS_TABS = [
    { key: '',                  label: 'All' },
    { key: 'payment_processed', label: '⏰ Needs Approval' },
    { key: 'merchant_approved', label: 'Approved' },
    { key: 'accepted',          label: 'Accepted' },
    { key: 'packed',            label: 'Packed' },
    { key: 'out_for_delivery',  label: 'Delivering' },
    { key: 'delivered',         label: 'Delivered' },
    { key: 'cancelled',         label: 'Cancelled' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h2 className="section-heading text-xl">Orders</h2>
          <p className="text-xs text-surface-500 mt-0.5">Manage and fulfill customer orders</p>
        </div>
        <div className="sm:ml-auto flex items-center gap-2 bg-white border border-surface-200
                        rounded-xl px-3 py-2.5 w-full sm:w-64">
          <Search className="w-4 h-4 text-surface-400" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search orders…"
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setStatus(tab.key); setPage(1); }}
            className={clsx(
              'flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold transition-all',
              status === tab.key
                ? 'bg-brand-dark text-white'
                : 'bg-white text-surface-600 border border-surface-200 hover:border-surface-300'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4">
              <div className="skeleton h-4 w-1/3 rounded mb-2" />
              <div className="skeleton h-3.5 w-1/2 rounded mb-3" />
              <div className="skeleton h-9 rounded-xl" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="🛒"
          title="No orders found"
          desc={status ? `No ${status.replace(/_/g, ' ')} orders right now.` : 'Orders will appear here once customers place them.'}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((order: any) => (
            <OrderCard key={order.id} order={order} onAction={handleAction} />
          ))}
        </div>
      )}

      {meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={!meta.hasPrev}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="btn-ghost text-xs !px-4 disabled:opacity-40">← Prev</button>
          <span className="text-xs text-surface-500">Page {meta.page} of {meta.totalPages}</span>
          <button disabled={!meta.hasNext}
                  onClick={() => setPage((p) => p + 1)}
                  className="btn-ghost text-xs !px-4 disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}
