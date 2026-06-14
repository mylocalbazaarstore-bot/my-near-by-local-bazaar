// src/components/admin-dash/MerchantsManagement.tsx
// ─────────────────────────────────────────────────────────────
// Admin Merchant Management — MyLocalBazaar
// Searchable merchant table | enable/disable toggle |
// detail slide-over (KYC docs, bank info, wallet, operating hours)
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, RefreshCw, X, Loader2, ExternalLink, ShieldCheck, ShieldOff, ShieldAlert,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api, apiPatch, getErrorMessage } from '@/lib/api';
import { StatusBadge, EmptyState, TableSkeleton } from '@/components/ui/DashboardPrimitives';
import { Pagination, type PageMeta } from './Pagination';
import toast from 'react-hot-toast';

interface MerchantRow {
  id:               string;
  owner_name:       string;
  store_name:       string;
  store_category:   string;
  phone:            string;
  email?:           string;
  pincode?:         string;
  merchant_status:  string;
  kyc_status:       string;
  active_products:  number;
  completed_orders: number;
  wallet_balance:   number;
  created_at:       string;
}

interface MerchantDetail extends MerchantRow {
  gstin?:                string;
  pan_number?:           string;
  area_name?:            string;
  area_pincode?:         string;
  gst_certificate_url?:  string;
  pan_card_url?:         string;
  aadhaar_front_url?:    string;
  aadhaar_back_url?:     string;
  shop_license_url?:     string;
  food_license_url?:     string;
  kyc_rejection_reason?: string;
  account_holder_name?:  string;
  account_number?:       string;
  ifsc_code?:            string;
  bank_name?:            string;
  upi_id?:               string;
  bank_verified?:        boolean;
  locked_balance?:       number;
  total_credited?:       number;
  total_debited?:        number;
  operating_hours?: {
    day_of_week: number;
    open_time:   string | null;
    close_time:  string | null;
    is_closed:   boolean;
  }[];
}

const STATUS_FILTERS = [
  { value: '',          label: 'All' },
  { value: 'pending',   label: 'Pending' },
  { value: 'active',    label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'disabled',  label: 'Disabled' },
  { value: 'rejected',  label: 'Rejected' },
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const KYC_DOC_FIELDS: { key: keyof MerchantDetail; label: string }[] = [
  { key: 'gst_certificate_url', label: 'GST Certificate' },
  { key: 'pan_card_url',        label: 'PAN Card' },
  { key: 'aadhaar_front_url',   label: 'Aadhaar (Front)' },
  { key: 'aadhaar_back_url',    label: 'Aadhaar (Back)' },
  { key: 'shop_license_url',    label: 'Shop License' },
  { key: 'food_license_url',    label: 'Food License' },
];

export default function MerchantsManagement() {
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [meta,      setMeta]      = useState<PageMeta | null>(null);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(true);
  const [status,    setStatus]    = useState('');
  const [search,    setSearch]    = useState('');

  const [detail,        setDetail]        = useState<MerchantDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const [statusModal, setStatusModal] = useState<{ id: string; target: 'active' | 'suspended' | 'disabled' } | null>(null);
  const [reason,      setReason]      = useState('');
  const [acting,      setActing]      = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '10' });
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    api.get(`/admin/merchants?${params.toString()}`)
      .then((r) => {
        const body = r.data as any;
        setMerchants(body.data || []);
        setMeta(body.meta || null);
      })
      .catch(() => toast.error('Failed to load merchants'))
      .finally(() => setLoading(false));
  }, [page, status, search]);

  useEffect(() => { load(); }, [load]);

  const viewDetail = async (id: string) => {
    setDetailLoading(id);
    try {
      const r = await api.get(`/admin/merchants/${id}`);
      setDetail((r.data as any).data?.merchant || null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDetailLoading(null);
    }
  };

  const openStatusModal = (id: string, target: 'active' | 'suspended' | 'disabled') => {
    setStatusModal({ id, target });
    setReason('');
  };

  const applyStatus = async () => {
    if (!statusModal) return;
    setActing(true);
    try {
      await apiPatch(`/admin/merchants/${statusModal.id}/status`, {
        status: statusModal.target,
        ...(reason ? { reason } : {}),
      });
      toast.success(`Merchant ${statusModal.target === 'active' ? 'activated' : statusModal.target}`);
      setStatusModal(null);
      if (detail?.id === statusModal.id) viewDetail(statusModal.id);
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
          <h2 className="section-heading text-xl">Merchant Management</h2>
          <p className="text-xs text-surface-500 mt-0.5">Onboard, verify and manage store owners</p>
        </div>
        <div className="sm:ml-auto flex items-center gap-2 bg-white border border-surface-200
                        rounded-xl px-3 py-2.5 w-full sm:w-64">
          <Search className="w-4 h-4 text-surface-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search store, owner, phone, GSTIN…"
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

      {/* Status filter tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
        {STATUS_FILTERS.map((s) => (
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
      ) : merchants.length === 0 ? (
        <EmptyState icon="🏪" title="No merchants found" desc="No merchants match this filter." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-100">
                  {['Store', 'Category', 'Pincode', 'KYC', 'Status', 'Orders', 'Joined', ''].map((h) => (
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
                    onClick={() => viewDetail(m.id)}
                    className="hover:bg-surface-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-surface-900 text-sm">{m.store_name}</p>
                      <p className="text-[11px] text-surface-400">{m.owner_name} · {m.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-surface-600 whitespace-nowrap">{m.store_category}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-mono text-surface-600">{m.pincode ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={m.kyc_status} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={m.merchant_status} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-surface-700">{m.completed_orders ?? 0}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs text-surface-500">
                        {new Date(m.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </p>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {m.merchant_status === 'active' ? (
                        <button
                          onClick={() => openStatusModal(m.id, 'disabled')}
                          title="Disable merchant"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-100 text-red-600
                                     text-xs font-bold hover:bg-red-200 transition-colors"
                        >
                          <ShieldOff className="w-3.5 h-3.5" /> Disable
                        </button>
                      ) : (
                        <button
                          onClick={() => openStatusModal(m.id, 'active')}
                          title="Activate merchant"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-100 text-green-700
                                     text-xs font-bold hover:bg-green-200 transition-colors"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" /> Activate
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
                      <h3 className="font-display font-bold text-surface-900 text-lg">{detail.store_name}</h3>
                      <p className="text-sm text-surface-500">{detail.owner_name} · {detail.phone}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <StatusBadge status={detail.merchant_status} />
                        <StatusBadge status={detail.kyc_status} />
                      </div>
                    </div>
                    <button onClick={() => setDetail(null)} className="p-1.5 rounded-xl hover:bg-surface-100 transition-colors">
                      <X className="w-4 h-4 text-surface-400" />
                    </button>
                  </div>

                  {/* Contact / business info */}
                  <div className="card p-4 space-y-2">
                    <h4 className="text-xs font-bold text-surface-500 uppercase tracking-wider mb-1">Business Info</h4>
                    {[
                      ['Category',  detail.store_category],
                      ['Email',     detail.email || '—'],
                      ['GSTIN',     detail.gstin || '—'],
                      ['PAN',       detail.pan_number || '—'],
                      ['Area',      detail.area_name ? `${detail.area_name} (${detail.area_pincode})` : (detail.pincode || '—')],
                      ['Joined',    new Date(detail.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between text-sm">
                        <span className="text-surface-500">{label}</span>
                        <span className="font-semibold text-surface-900">{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Wallet */}
                  <div className="card p-4">
                    <h4 className="text-xs font-bold text-surface-500 uppercase tracking-wider mb-3">Wallet</h4>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="font-display text-lg font-bold text-brand-green">₹{Number(detail.wallet_balance || 0).toFixed(0)}</p>
                        <p className="text-[11px] text-surface-500">Balance</p>
                      </div>
                      <div>
                        <p className="font-display text-lg font-bold text-brand-orange">₹{Number(detail.locked_balance || 0).toFixed(0)}</p>
                        <p className="text-[11px] text-surface-500">Locked</p>
                      </div>
                      <div>
                        <p className="font-display text-lg font-bold text-blue-500">₹{Number(detail.total_credited || 0).toFixed(0)}</p>
                        <p className="text-[11px] text-surface-500">Total Earned</p>
                      </div>
                    </div>
                  </div>

                  {/* Bank details */}
                  <div className="card p-4 space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-xs font-bold text-surface-500 uppercase tracking-wider">Bank Details</h4>
                      {detail.account_number && (
                        <span className={clsx(
                          'text-[10px] font-bold px-2 py-0.5 rounded-full',
                          detail.bank_verified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        )}>
                          {detail.bank_verified ? 'Verified' : 'Unverified'}
                        </span>
                      )}
                    </div>
                    {detail.account_number ? (
                      [
                        ['Account Holder', detail.account_holder_name],
                        ['Account No.',    `••••${String(detail.account_number).slice(-4)}`],
                        ['IFSC',           detail.ifsc_code],
                        ['Bank',           detail.bank_name],
                        ['UPI',            detail.upi_id || '—'],
                      ].map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between text-sm">
                          <span className="text-surface-500">{label}</span>
                          <span className="font-semibold text-surface-900">{value}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-surface-400">No bank details on file.</p>
                    )}
                  </div>

                  {/* KYC documents */}
                  <div className="card p-4">
                    <h4 className="text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">KYC Documents</h4>
                    {detail.kyc_rejection_reason && (
                      <div className="mb-2 p-2.5 rounded-xl bg-red-50 border border-red-100 text-xs text-red-700">
                        Rejection reason: {detail.kyc_rejection_reason}
                      </div>
                    )}
                    <div className="space-y-1.5">
                      {KYC_DOC_FIELDS.map(({ key, label }) => {
                        const url = detail[key] as string | undefined;
                        return (
                          <div key={key} className="flex items-center justify-between text-sm">
                            <span className="text-surface-600">{label}</span>
                            {url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer"
                                 className="flex items-center gap-1 text-brand-orange hover:text-orange-600 font-semibold text-xs">
                                View <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-xs text-surface-400">Not uploaded</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Operating hours */}
                  {detail.operating_hours && detail.operating_hours.length > 0 && (
                    <div className="card p-4">
                      <h4 className="text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">Operating Hours</h4>
                      <div className="space-y-1">
                        {[...detail.operating_hours]
                          .sort((a, b) => a.day_of_week - b.day_of_week)
                          .map((h) => (
                            <div key={h.day_of_week} className="flex items-center justify-between text-sm">
                              <span className="text-surface-600">{DAYS[h.day_of_week]}</span>
                              <span className="font-semibold text-surface-900">
                                {h.is_closed ? 'Closed' : `${h.open_time?.slice(0, 5)} – ${h.close_time?.slice(0, 5)}`}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Account actions */}
                  <div className="card p-4">
                    <h4 className="text-xs font-bold text-surface-500 uppercase tracking-wider mb-3">Account Actions</h4>
                    <div className="flex flex-wrap gap-2">
                      {detail.merchant_status !== 'active' && (
                        <button
                          onClick={() => openStatusModal(detail.id, 'active')}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500 text-white text-xs font-bold hover:bg-green-600 transition-colors"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" /> Activate
                        </button>
                      )}
                      {detail.merchant_status !== 'suspended' && (
                        <button
                          onClick={() => openStatusModal(detail.id, 'suspended')}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-orange-200 text-orange-600 text-xs font-bold hover:bg-orange-50 transition-colors"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" /> Suspend
                        </button>
                      )}
                      {detail.merchant_status !== 'disabled' && (
                        <button
                          onClick={() => openStatusModal(detail.id, 'disabled')}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 transition-colors"
                        >
                          <ShieldOff className="w-3.5 h-3.5" /> Disable
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Status change reason modal */}
      <AnimatePresence>
        {statusModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setStatusModal(null)}
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
                  {statusModal.target === 'active' ? 'Activate Merchant'
                    : statusModal.target === 'suspended' ? 'Suspend Merchant' : 'Disable Merchant'}
                </h3>
                <p className="text-sm text-surface-500 mb-4">
                  {statusModal.target === 'active'
                    ? 'The merchant will regain access to their dashboard and storefront.'
                    : 'The merchant will lose access to their dashboard and their storefront will go offline.'}
                </p>
                {statusModal.target !== 'active' && (
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason (optional, shown to merchant)…"
                    rows={3}
                    className="input-field resize-none text-sm mb-4"
                  />
                )}
                <div className="flex gap-3">
                  <button onClick={() => setStatusModal(null)} className="btn-ghost flex-1 text-sm">Cancel</button>
                  <button
                    onClick={applyStatus}
                    disabled={acting}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-2 rounded-xl font-semibold text-sm py-2.5',
                      'transition-all duration-200 active:scale-95',
                      statusModal.target === 'active' ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-red-500 text-white hover:bg-red-600',
                      acting && 'opacity-60 cursor-not-allowed'
                    )}
                  >
                    {acting && <Loader2 className="w-4 h-4 animate-spin" />}
                    Confirm
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
