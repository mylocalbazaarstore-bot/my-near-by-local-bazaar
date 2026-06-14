// src/components/admin-dash/CustomersManagement.tsx
// ─────────────────────────────────────────────────────────────
// Admin Customer Management — MyLocalBazaar
// Searchable customer table | block/unblock | wallet adjustments
// | order history slide-over
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, RefreshCw, X, Loader2, ShieldOff, ShieldCheck, Wallet, MapPin,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api, apiPost, apiPatch, getErrorMessage } from '@/lib/api';
import { StatusBadge, EmptyState, TableSkeleton } from '@/components/ui/DashboardPrimitives';
import { Pagination, type PageMeta } from './Pagination';
import toast from 'react-hot-toast';

interface CustomerRow {
  id:                 string;
  full_name:          string;
  phone:              string;
  email?:             string;
  gender?:            string;
  wallet_balance:     number;
  is_phone_verified:  boolean;
  is_blocked:         boolean;
  is_active:          boolean;
  last_login_at?:     string;
  created_at:         string;
  total_orders:       number;
  completed_orders:   number;
  lifetime_value?:    number;
}

interface CustomerDetail extends CustomerRow {
  wallet_balance_live?: number;
  total_credited?:      number;
  total_debited?:       number;
  total_complaints?:    number;
  total_reviews?:       number;
  addresses?: {
    id: string; label?: string; address_line1: string; address_line2?: string;
    city?: string; pincode?: string; is_default?: boolean;
  }[];
}

interface OrderRow {
  id:             string;
  order_number:   string;
  order_status:   string;
  payment_method: string;
  total_amount:   number;
  created_at:     string;
  delivered_at?:  string;
  store_name:     string;
}

const STATUS_FILTERS = [
  { value: '',      label: 'All' },
  { value: 'false', label: 'Active' },
  { value: 'true',  label: 'Blocked' },
];

export default function CustomersManagement() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [meta,      setMeta]      = useState<PageMeta | null>(null);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [blocked,   setBlocked]   = useState('');

  const [detail,        setDetail]        = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const [blockModal, setBlockModal] = useState<{ id: string; action: 'block' | 'unblock' } | null>(null);
  const [reason,     setReason]     = useState('');

  const [walletModal, setWalletModal] = useState<string | null>(null);
  const [walletType,  setWalletType]  = useState<'credit' | 'debit'>('credit');
  const [walletAmount, setWalletAmount] = useState('');
  const [walletDesc,  setWalletDesc]  = useState('');

  const [acting, setActing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '10' });
    if (search) params.set('search', search);
    if (blocked) params.set('is_blocked', blocked);
    api.get(`/admin/customers?${params.toString()}`)
      .then((r) => {
        const body = r.data as any;
        setCustomers(body.data || []);
        setMeta(body.meta || null);
      })
      .catch(() => toast.error('Failed to load customers'))
      .finally(() => setLoading(false));
  }, [page, search, blocked]);

  useEffect(() => { load(); }, [load]);

  const viewDetail = async (id: string) => {
    setDetailLoading(id);
    try {
      const r = await api.get(`/admin/customers/${id}`);
      setDetail((r.data as any).data?.customer || null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDetailLoading(null);
    }
  };

  const submitBlock = async () => {
    if (!blockModal) return;
    if (blockModal.action === 'block' && reason.trim().length < 5) {
      toast.error('Reason must be at least 5 characters');
      return;
    }
    setActing(true);
    try {
      if (blockModal.action === 'block') {
        await apiPost(`/admin/customers/${blockModal.id}/block`, { reason });
      } else {
        await apiPost(`/admin/customers/${blockModal.id}/unblock`);
      }
      toast.success(`Customer ${blockModal.action === 'block' ? 'blocked' : 'unblocked'}`);
      setBlockModal(null);
      if (detail?.id === blockModal.id) viewDetail(blockModal.id);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setActing(false);
    }
  };

  const submitWallet = async () => {
    if (!walletModal) return;
    const amount = parseFloat(walletAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setActing(true);
    try {
      await apiPatch(`/admin/customers/${walletModal}/wallet`, {
        amount, type: walletType, description: walletDesc || undefined,
      });
      toast.success(`Wallet ${walletType} of ₹${amount} applied`);
      setWalletModal(null);
      setWalletAmount(''); setWalletDesc('');
      if (detail?.id === walletModal) viewDetail(walletModal);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h2 className="section-heading text-xl">Customer Management</h2>
          <p className="text-xs text-surface-500 mt-0.5">View and manage registered customers</p>
        </div>
        <div className="sm:ml-auto flex items-center gap-2 bg-white border border-surface-200 rounded-xl px-3 py-2.5 w-full sm:w-64">
          <Search className="w-4 h-4 text-surface-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name, phone, email…"
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

      <div className="flex gap-1.5">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.value}
            onClick={() => { setBlocked(s.value); setPage(1); }}
            className={clsx(
              'px-3.5 py-2 rounded-xl text-xs font-bold transition-all border',
              blocked === s.value
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
      ) : customers.length === 0 ? (
        <EmptyState icon="👥" title="No customers found" desc="No customers match this filter." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-100">
                  {['Customer', 'Phone', 'Wallet', 'Orders', 'Status', 'Joined', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {customers.map((c) => (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => viewDetail(c.id)}
                    className="hover:bg-surface-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-surface-900 text-sm">{c.full_name}</p>
                      <p className="text-[11px] text-surface-400">{c.email || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-mono text-surface-600">{c.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-surface-900">₹{Number(c.wallet_balance ?? 0).toFixed(0)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-surface-700">{c.total_orders ?? 0}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx(
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold',
                        c.is_blocked ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'
                      )}>
                        {c.is_blocked ? 'Blocked' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs text-surface-500">
                        {new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </p>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {c.is_blocked ? (
                        <button
                          onClick={() => { setBlockModal({ id: c.id, action: 'unblock' }); setReason(''); }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-100 text-green-700 text-xs font-bold hover:bg-green-200 transition-colors"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" /> Unblock
                        </button>
                      ) : (
                        <button
                          onClick={() => { setBlockModal({ id: c.id, action: 'block' }); setReason(''); }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-100 text-red-600 text-xs font-bold hover:bg-red-200 transition-colors"
                        >
                          <ShieldOff className="w-3.5 h-3.5" /> Block
                        </button>
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

      {/* Detail slide-over */}
      <AnimatePresence>
        {(detail || detailLoading) && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDetail(null)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 w-full sm:w-[480px] bg-white z-50 shadow-2xl overflow-y-auto"
            >
              {detailLoading && !detail ? (
                <div className="p-6"><TableSkeleton rows={8} cols={1} /></div>
              ) : detail && (
                <div className="p-6 space-y-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-display font-bold text-surface-900 text-lg">{detail.full_name}</h3>
                      <p className="text-sm text-surface-500">{detail.phone} · {detail.email || 'No email'}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={clsx(
                          'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold',
                          detail.is_blocked ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'
                        )}>
                          {detail.is_blocked ? 'Blocked' : 'Active'}
                        </span>
                        {detail.is_phone_verified && <StatusBadge status="verified" />}
                      </div>
                    </div>
                    <button onClick={() => setDetail(null)} className="p-1.5 rounded-xl hover:bg-surface-100 transition-colors">
                      <X className="w-4 h-4 text-surface-400" />
                    </button>
                  </div>

                  {/* Profile info */}
                  <div className="card p-4 space-y-2">
                    <h4 className="text-xs font-bold text-surface-500 uppercase tracking-wider mb-1">Profile</h4>
                    {[
                      ['Gender',     detail.gender || '—'],
                      ['Last Login', detail.last_login_at ? new Date(detail.last_login_at).toLocaleString('en-IN') : '—'],
                      ['Joined',     new Date(detail.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })],
                      ['Total Orders', detail.total_orders ?? 0],
                      ['Reviews Written', detail.total_reviews ?? 0],
                      ['Support Tickets', detail.total_complaints ?? 0],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between text-sm">
                        <span className="text-surface-500">{label}</span>
                        <span className="font-semibold text-surface-900">{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Wallet */}
                  <div className="card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-bold text-surface-500 uppercase tracking-wider">Wallet</h4>
                      <button
                        onClick={() => { setWalletModal(detail.id); setWalletType('credit'); setWalletAmount(''); setWalletDesc(''); }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-100 text-surface-700 text-xs font-bold hover:bg-surface-200 transition-colors"
                      >
                        <Wallet className="w-3.5 h-3.5" /> Adjust
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="font-display text-lg font-bold text-brand-green">
                          ₹{Number(detail.wallet_balance_live ?? detail.wallet_balance ?? 0).toFixed(0)}
                        </p>
                        <p className="text-[11px] text-surface-500">Balance</p>
                      </div>
                      <div>
                        <p className="font-display text-lg font-bold text-blue-500">₹{Number(detail.total_credited || 0).toFixed(0)}</p>
                        <p className="text-[11px] text-surface-500">Total Credited</p>
                      </div>
                      <div>
                        <p className="font-display text-lg font-bold text-brand-orange">₹{Number(detail.total_debited || 0).toFixed(0)}</p>
                        <p className="text-[11px] text-surface-500">Total Debited</p>
                      </div>
                    </div>
                  </div>

                  {/* Addresses */}
                  {detail.addresses && detail.addresses.length > 0 && (
                    <div className="card p-4">
                      <h4 className="text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">Addresses</h4>
                      <div className="space-y-2">
                        {detail.addresses.map((a) => (
                          <div key={a.id} className="flex items-start gap-2 text-sm">
                            <MapPin className="w-3.5 h-3.5 text-surface-400 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-surface-700">
                                {a.address_line1}{a.address_line2 ? `, ${a.address_line2}` : ''}{a.city ? `, ${a.city}` : ''} {a.pincode || ''}
                              </p>
                              {a.is_default && <span className="text-[10px] font-bold text-brand-green">Default</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Order history */}
                  <CustomerOrderHistory customerId={detail.id} />

                  {/* Account action */}
                  <div className="card p-4">
                    <h4 className="text-xs font-bold text-surface-500 uppercase tracking-wider mb-3">Account Actions</h4>
                    {detail.is_blocked ? (
                      <button
                        onClick={() => { setBlockModal({ id: detail.id, action: 'unblock' }); setReason(''); }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500 text-white text-xs font-bold hover:bg-green-600 transition-colors"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" /> Unblock Customer
                      </button>
                    ) : (
                      <button
                        onClick={() => { setBlockModal({ id: detail.id, action: 'block' }); setReason(''); }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 transition-colors"
                      >
                        <ShieldOff className="w-3.5 h-3.5" /> Block Customer
                      </button>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Block / unblock modal */}
      <AnimatePresence>
        {blockModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setBlockModal(null)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1,    y: 0 }}
              exit={{ opacity: 0, scale: 0.92,    y: 20 }}
              className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            >
              <div className="bg-white rounded-3xl shadow-hero w-full max-w-md p-6">
                <h3 className="font-display font-bold text-surface-900 text-lg mb-1">
                  {blockModal.action === 'block' ? 'Block Customer' : 'Unblock Customer'}
                </h3>
                <p className="text-sm text-surface-500 mb-4">
                  {blockModal.action === 'block'
                    ? 'The customer will be unable to place new orders or log in.'
                    : 'The customer will regain full access to their account.'}
                </p>
                {blockModal.action === 'block' && (
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason for blocking (min. 5 characters)…"
                    rows={3}
                    className="input-field resize-none text-sm mb-4"
                  />
                )}
                <div className="flex gap-3">
                  <button onClick={() => setBlockModal(null)} className="btn-ghost flex-1 text-sm">Cancel</button>
                  <button
                    onClick={submitBlock}
                    disabled={acting}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-2 rounded-xl font-semibold text-sm py-2.5',
                      'transition-all duration-200 active:scale-95',
                      blockModal.action === 'block' ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-green-500 text-white hover:bg-green-600',
                      acting && 'opacity-60 cursor-not-allowed'
                    )}
                  >
                    {acting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {blockModal.action === 'block' ? 'Block' : 'Unblock'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Wallet adjustment modal */}
      <AnimatePresence>
        {walletModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setWalletModal(null)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1,    y: 0 }}
              exit={{ opacity: 0, scale: 0.92,    y: 20 }}
              className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            >
              <div className="bg-white rounded-3xl shadow-hero w-full max-w-md p-6">
                <h3 className="font-display font-bold text-surface-900 text-lg mb-4">Adjust Wallet Balance</h3>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {(['credit', 'debit'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setWalletType(t)}
                        className={clsx(
                          'flex-1 py-2 rounded-xl text-sm font-bold border transition-all',
                          walletType === t
                            ? (t === 'credit' ? 'bg-green-500 text-white border-green-500' : 'bg-red-500 text-white border-red-500')
                            : 'bg-white text-surface-600 border-surface-200'
                        )}
                      >
                        {t === 'credit' ? 'Credit (+)' : 'Debit (−)'}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="text-xs font-bold text-surface-500 uppercase tracking-wider">Amount (₹)</label>
                    <input
                      type="number" min="0.01" step="0.01"
                      value={walletAmount}
                      onChange={(e) => setWalletAmount(e.target.value)}
                      className="input-field text-sm mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-surface-500 uppercase tracking-wider">Description (optional)</label>
                    <textarea
                      value={walletDesc}
                      onChange={(e) => setWalletDesc(e.target.value)}
                      placeholder="Reason for adjustment…"
                      rows={2}
                      className="input-field resize-none text-sm mt-1"
                    />
                  </div>
                </div>
                <div className="flex gap-3 mt-5">
                  <button onClick={() => setWalletModal(null)} className="btn-ghost flex-1 text-sm">Cancel</button>
                  <button
                    onClick={submitWallet}
                    disabled={acting}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-2 rounded-xl font-semibold text-sm py-2.5',
                      'bg-surface-900 text-white hover:bg-surface-800 transition-all duration-200 active:scale-95',
                      acting && 'opacity-60 cursor-not-allowed'
                    )}
                  >
                    {acting && <Loader2 className="w-4 h-4 animate-spin" />}
                    Apply
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Customer order history (within slide-over) ───────────────────
function CustomerOrderHistory({ customerId }: { customerId: string }) {
  const [orders,  setOrders]  = useState<OrderRow[]>([]);
  const [meta,    setMeta]    = useState<PageMeta | null>(null);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/admin/customers/${customerId}/orders?page=${page}&limit=5`)
      .then((r) => {
        const body = r.data as any;
        setOrders(body.data || []);
        setMeta(body.meta || null);
      })
      .catch(() => toast.error('Failed to load order history'))
      .finally(() => setLoading(false));
  }, [customerId, page]);

  return (
    <div className="card p-4">
      <h4 className="text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">Order History</h4>
      {loading ? (
        <TableSkeleton rows={3} cols={1} />
      ) : orders.length === 0 ? (
        <p className="text-sm text-surface-400">No orders placed yet.</p>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <div key={o.id} className="flex items-center justify-between text-sm">
              <div>
                <p className="font-mono font-bold text-surface-900 text-xs">{o.order_number}</p>
                <p className="text-[11px] text-surface-400">{o.store_name} · {new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-surface-900 text-sm">₹{Number(o.total_amount ?? 0).toFixed(0)}</p>
                <StatusBadge status={o.order_status} />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2">
        <Pagination meta={meta} onPageChange={setPage} />
      </div>
    </div>
  );
}
