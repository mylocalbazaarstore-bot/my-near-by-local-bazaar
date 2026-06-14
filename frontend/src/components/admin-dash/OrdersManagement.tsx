// src/components/admin-dash/OrdersManagement.tsx
// ─────────────────────────────────────────────────────────────
// Admin Order Governance — MyLocalBazaar
// All orders | status override | manual refunds | returns queue
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Search, RefreshCw, ArrowRightLeft, IndianRupee, Loader2, X,
  CheckCircle2, XCircle, ShieldCheck,
} from 'lucide-react';
import { clsx } from 'clsx';
import { apiGet, apiPost, apiPatch, getErrorMessage } from '@/lib/api';
import { StatusBadge, EmptyState, TableSkeleton } from '@/components/ui/DashboardPrimitives';
import { Pagination, type PageMeta } from './Pagination';
import toast from 'react-hot-toast';

interface OrderRow {
  id:                       string;
  order_number:             string;
  order_status:             string;
  payment_status:           string;
  payment_method:           string;
  total_amount:             number;
  created_at:               string;
  delivered_at?:            string;
  store_name:               string;
  customer_name:            string;
  customer_phone:           string;
}

interface ReturnRow {
  id:             string;
  reason:         string;
  status:         string;
  refund_amount?: number;
  created_at:     string;
  resolved_at?:   string;
  order_number:   string;
  total_amount:   number;
  store_name:     string;
  customer_name:  string;
  customer_phone: string;
}

const ORDER_STATUS_FILTERS = [
  { value: '',                  label: 'All' },
  { value: 'payment_processed', label: 'Pending Approval' },
  { value: 'accepted',          label: 'Accepted' },
  { value: 'out_for_delivery',  label: 'Out for Delivery' },
  { value: 'delivered',         label: 'Delivered' },
  { value: 'cancelled',         label: 'Cancelled' },
  { value: 'refund_initiated',  label: 'Refund Initiated' },
];

const OVERRIDE_TARGETS = [
  { value: 'merchant_approved', label: 'Force Approve (Merchant Approved)' },
  { value: 'accepted',          label: 'Mark Accepted' },
  { value: 'cancelled',         label: 'Cancel Order' },
  { value: 'refund_initiated',  label: 'Mark Refund Initiated' },
];

const RETURN_STATUS_FILTERS = [
  { value: 'pending',  label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: '',         label: 'All' },
];

export default function OrdersManagement() {
  const [view, setView] = useState<'orders' | 'returns'>('orders');

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h2 className="section-heading text-xl">Order Governance</h2>
          <p className="text-xs text-surface-500 mt-0.5">Monitor orders, override decisions, manage refunds</p>
        </div>
        <div className="sm:ml-auto flex gap-1.5 bg-surface-100 rounded-xl p-1">
          {(['orders', 'returns'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={clsx(
                'px-4 py-1.5 rounded-lg text-xs font-bold transition-all',
                view === v ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'
              )}
            >
              {v === 'orders' ? 'All Orders' : 'Returns Queue'}
            </button>
          ))}
        </div>
      </div>

      {view === 'orders' ? <OrdersTable /> : <ReturnsQueue />}
    </div>
  );
}

// ── All orders table ────────────────────────────────────────────
function OrdersTable() {
  const [orders,  setOrders]  = useState<OrderRow[]>([]);
  const [meta,    setMeta]    = useState<PageMeta | null>(null);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);
  const [status,  setStatus]  = useState('');
  const [search,  setSearch]  = useState('');

  const [overrideTarget, setOverrideTarget] = useState<OrderRow | null>(null);
  const [targetStatus,   setTargetStatus]   = useState(OVERRIDE_TARGETS[0].value);
  const [note,           setNote]           = useState('');

  const [refundTarget, setRefundTarget] = useState<OrderRow | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');

  const [acting, setActing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '10' });
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    apiGet<OrderRow[]>(`/admin/orders?${params.toString()}`)
      .then((r: any) => {
        setOrders(r.data || []);
        setMeta(r.meta || null);
      })
      .catch(() => toast.error('Failed to load orders'))
      .finally(() => setLoading(false));
  }, [page, status, search]);

  useEffect(() => { load(); }, [load]);

  const openOverride = (o: OrderRow, presetTarget?: string) => {
    setOverrideTarget(o);
    setTargetStatus(presetTarget || OVERRIDE_TARGETS[0].value);
    setNote('');
  };

  const submitOverride = async () => {
    if (!overrideTarget) return;
    if (note.trim().length < 5) {
      toast.error('Note must be at least 5 characters');
      return;
    }
    setActing(true);
    try {
      await apiPost(`/admin/orders/${overrideTarget.id}/override`, {
        target_status: targetStatus,
        note,
      });
      toast.success(`Order ${overrideTarget.order_number} updated`);
      setOverrideTarget(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setActing(false);
    }
  };

  const openRefund = (o: OrderRow) => {
    setRefundTarget(o);
    setRefundAmount(String(o.total_amount));
    setRefundReason('');
  };

  const submitRefund = async () => {
    if (!refundTarget) return;
    const amount = parseFloat(refundAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid refund amount');
      return;
    }
    if (refundReason.trim().length < 5) {
      toast.error('Reason must be at least 5 characters');
      return;
    }
    setActing(true);
    try {
      await apiPost(`/admin/orders/${refundTarget.id}/refund`, { amount, reason: refundReason });
      toast.success(`Refund initiated for ${refundTarget.order_number}`);
      setRefundTarget(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 bg-white border border-surface-200 rounded-xl px-3 py-2.5 w-full sm:w-64">
          <Search className="w-4 h-4 text-surface-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search order number…"
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
        </div>
        <button
          onClick={load} disabled={loading}
          className="p-2 rounded-xl hover:bg-surface-100 border border-surface-200 transition-colors"
        >
          <RefreshCw className={clsx('w-4 h-4 text-surface-500', loading && 'animate-spin')} />
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
        {ORDER_STATUS_FILTERS.map((s) => (
          <button
            key={s.value}
            onClick={() => { setStatus(s.value); setPage(1); }}
            className={clsx(
              'flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border',
              status === s.value
                ? 'bg-surface-900 text-white border-surface-900'
                : 'bg-white text-surface-600 border-surface-200 hover:border-surface-300'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card p-5"><TableSkeleton rows={6} cols={6} /></div>
      ) : orders.length === 0 ? (
        <EmptyState icon="🛒" title="No orders found" desc="No orders match this filter." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-100">
                  {['Order #', 'Customer', 'Store', 'Amount', 'Status', 'Date', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {orders.map((o) => (
                  <motion.tr
                    key={o.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-surface-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-mono font-bold text-surface-900 text-xs">{o.order_number}</p>
                      <p className="text-[11px] text-surface-400">{o.payment_method?.toUpperCase()}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-surface-700">{o.customer_name}</p>
                      <p className="text-[11px] text-surface-400">{o.customer_phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-surface-700 whitespace-nowrap">{o.store_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-surface-900 text-sm">₹{Number(o.total_amount ?? 0).toFixed(0)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.order_status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs text-surface-500">
                        {new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {o.order_status === 'payment_processed' && (
                          <button
                            onClick={() => openOverride(o, 'merchant_approved')}
                            title="Force approve"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-100 text-cyan-700 text-xs font-bold hover:bg-cyan-200 transition-colors"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" /> Approve
                          </button>
                        )}
                        <button
                          onClick={() => openOverride(o)}
                          title="Override status"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-100 text-surface-700 text-xs font-bold hover:bg-surface-200 transition-colors"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" /> Override
                        </button>
                        <button
                          onClick={() => openRefund(o)}
                          title="Initiate refund"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-100 text-red-600 text-xs font-bold hover:bg-red-200 transition-colors"
                        >
                          <IndianRupee className="w-3.5 h-3.5" /> Refund
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination meta={meta} onPageChange={setPage} />

      {/* Override modal */}
      {overrideTarget && (
        <Modal onClose={() => setOverrideTarget(null)} title="Override Order Status"
               desc={`Order ${overrideTarget.order_number} · currently ${overrideTarget.order_status.replace(/_/g, ' ')}`}>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-surface-500 uppercase tracking-wider">New Status</label>
              <select
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value)}
                className="input-field text-sm mt-1"
              >
                {OVERRIDE_TARGETS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-surface-500 uppercase tracking-wider">Note (audit log)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason for this override (min. 5 characters)…"
                rows={3}
                className="input-field resize-none text-sm mt-1"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setOverrideTarget(null)} className="btn-ghost flex-1 text-sm">Cancel</button>
            <button
              onClick={submitOverride}
              disabled={acting}
              className={clsx(
                'flex-1 flex items-center justify-center gap-2 rounded-xl font-semibold text-sm py-2.5',
                'bg-surface-900 text-white hover:bg-surface-800 transition-all duration-200 active:scale-95',
                acting && 'opacity-60 cursor-not-allowed'
              )}
            >
              {acting && <Loader2 className="w-4 h-4 animate-spin" />}
              Apply Override
            </button>
          </div>
        </Modal>
      )}

      {/* Refund modal */}
      {refundTarget && (
        <Modal onClose={() => setRefundTarget(null)} title="Initiate Manual Refund"
               desc={`Order ${refundTarget.order_number} · total ₹${Number(refundTarget.total_amount).toFixed(0)}`}>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-surface-500 uppercase tracking-wider">Refund Amount (₹)</label>
              <input
                type="number" min="0.01" step="0.01"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="input-field text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-surface-500 uppercase tracking-wider">Reason</label>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Reason for refund (min. 5 characters)…"
                rows={3}
                className="input-field resize-none text-sm mt-1"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setRefundTarget(null)} className="btn-ghost flex-1 text-sm">Cancel</button>
            <button
              onClick={submitRefund}
              disabled={acting}
              className={clsx(
                'flex-1 flex items-center justify-center gap-2 rounded-xl font-semibold text-sm py-2.5',
                'bg-red-500 text-white hover:bg-red-600 transition-all duration-200 active:scale-95',
                acting && 'opacity-60 cursor-not-allowed'
              )}
            >
              {acting && <Loader2 className="w-4 h-4 animate-spin" />}
              Initiate Refund
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Returns queue ────────────────────────────────────────────────
function ReturnsQueue() {
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [meta,    setMeta]    = useState<PageMeta | null>(null);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);
  const [status,  setStatus]  = useState('pending');

  const [resolveTarget, setResolveTarget] = useState<{ row: ReturnRow; action: 'approve' | 'reject' } | null>(null);
  const [refundAmount,  setRefundAmount]  = useState('');
  const [response,      setResponse]      = useState('');
  const [acting,        setActing]        = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '10' });
    if (status) params.set('status', status);
    apiGet<ReturnRow[]>(`/admin/orders/returns?${params.toString()}`)
      .then((r: any) => {
        setReturns(r.data || []);
        setMeta(r.meta || null);
      })
      .catch(() => toast.error('Failed to load return requests'))
      .finally(() => setLoading(false));
  }, [page, status]);

  useEffect(() => { load(); }, [load]);

  const openResolve = (row: ReturnRow, action: 'approve' | 'reject') => {
    setResolveTarget({ row, action });
    setRefundAmount(String(row.refund_amount ?? row.total_amount ?? ''));
    setResponse('');
  };

  const submitResolve = async () => {
    if (!resolveTarget) return;
    setActing(true);
    try {
      await apiPatch(`/admin/orders/returns/${resolveTarget.row.id}`, {
        action: resolveTarget.action,
        refund_amount: resolveTarget.action === 'approve' ? parseFloat(refundAmount) || 0 : undefined,
        admin_response: response || (resolveTarget.action === 'approve' ? 'Return approved by admin' : 'Return rejected by admin'),
      });
      toast.success(`Return ${resolveTarget.action}d for ${resolveTarget.row.order_number}`);
      setResolveTarget(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
        {RETURN_STATUS_FILTERS.map((s) => (
          <button
            key={s.value}
            onClick={() => { setStatus(s.value); setPage(1); }}
            className={clsx(
              'flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border',
              status === s.value
                ? 'bg-surface-900 text-white border-surface-900'
                : 'bg-white text-surface-600 border-surface-200 hover:border-surface-300'
            )}
          >
            {s.label}
          </button>
        ))}
        <button
          onClick={load} disabled={loading}
          className="p-2 rounded-xl hover:bg-surface-100 border border-surface-200 transition-colors ml-auto"
        >
          <RefreshCw className={clsx('w-4 h-4 text-surface-500', loading && 'animate-spin')} />
        </button>
      </div>

      {loading ? (
        <div className="card p-5"><TableSkeleton rows={5} cols={5} /></div>
      ) : returns.length === 0 ? (
        <EmptyState icon="↩️" title="No return requests" desc="No return requests match this filter." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-100">
                  {['Order #', 'Customer', 'Store', 'Reason', 'Refund', 'Status', 'Requested', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {returns.map((r) => (
                  <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-surface-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-mono font-bold text-surface-900 text-xs">{r.order_number}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-surface-700">{r.customer_name}</p>
                      <p className="text-[11px] text-surface-400">{r.customer_phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-surface-700 whitespace-nowrap">{r.store_name}</p>
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <p className="text-xs text-surface-600 truncate" title={r.reason}>{r.reason}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-surface-900 text-sm">
                        ₹{Number(r.refund_amount ?? r.total_amount ?? 0).toFixed(0)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs text-surface-500">
                        {new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {r.status === 'pending' ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => openResolve(r, 'approve')}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-500 text-white text-xs font-bold hover:bg-green-600 transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            onClick={() => openResolve(r, 'reject')}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-100 text-red-600 text-xs font-bold hover:bg-red-200 transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-surface-400">
                          {r.resolved_at ? new Date(r.resolved_at).toLocaleDateString('en-IN') : '—'}
                        </span>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination meta={meta} onPageChange={setPage} />

      {resolveTarget && (
        <Modal onClose={() => setResolveTarget(null)}
               title={resolveTarget.action === 'approve' ? 'Approve Return' : 'Reject Return'}
               desc={`Order ${resolveTarget.row.order_number} · ${resolveTarget.row.reason}`}>
          <div className="space-y-3">
            {resolveTarget.action === 'approve' && (
              <div>
                <label className="text-xs font-bold text-surface-500 uppercase tracking-wider">Refund Amount (₹)</label>
                <input
                  type="number" min="0" step="0.01"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="input-field text-sm mt-1"
                />
              </div>
            )}
            <div>
              <label className="text-xs font-bold text-surface-500 uppercase tracking-wider">Response Note</label>
              <textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder="Message shown to the customer…"
                rows={3}
                className="input-field resize-none text-sm mt-1"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setResolveTarget(null)} className="btn-ghost flex-1 text-sm">Cancel</button>
            <button
              onClick={submitResolve}
              disabled={acting}
              className={clsx(
                'flex-1 flex items-center justify-center gap-2 rounded-xl font-semibold text-sm py-2.5',
                'transition-all duration-200 active:scale-95',
                resolveTarget.action === 'approve' ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-red-500 text-white hover:bg-red-600',
                acting && 'opacity-60 cursor-not-allowed'
              )}
            >
              {acting && <Loader2 className="w-4 h-4 animate-spin" />}
              {resolveTarget.action === 'approve' ? 'Approve Return' : 'Reject Return'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Shared small modal shell ─────────────────────────────────────
function Modal({
  title, desc, onClose, children,
}: {
  title:    string;
  desc?:    string;
  onClose:  () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-hero w-full max-w-md p-6">
          <div className="flex items-start justify-between mb-1">
            <h3 className="font-display font-bold text-surface-900 text-lg">{title}</h3>
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-surface-100 transition-colors">
              <X className="w-4 h-4 text-surface-400" />
            </button>
          </div>
          {desc && <p className="text-sm text-surface-500 mb-4">{desc}</p>}
          {children}
        </div>
      </div>
    </>
  );
}
