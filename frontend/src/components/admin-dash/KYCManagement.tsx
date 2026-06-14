// src/components/admin-dash/KYCManagement.tsx
// ─────────────────────────────────────────────────────────────
// Admin KYC Management — MyLocalBazaar
// Review merchant verification documents | Approve / Reject KYC
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, CheckCircle2, XCircle, X, Loader2, ExternalLink, RefreshCw,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api, apiPost, getErrorMessage } from '@/lib/api';
import { StatusBadge, EmptyState, TableSkeleton } from '@/components/ui/DashboardPrimitives';
import { Pagination, type PageMeta } from './Pagination';
import toast from 'react-hot-toast';

interface KycMerchant {
  id:              string;
  store_name:      string;
  owner_name:      string;
  phone:           string;
  store_category:  string;
  pincode?:        string;
  kyc_status:      string;
  merchant_status: string;
  created_at:      string;
}

interface KycDoc {
  merchant_id:        string;
  gst_certificate_url?: string;
  pan_card_url?:        string;
  aadhaar_front_url?:   string;
  aadhaar_back_url?:    string;
  shop_license_url?:   string;
  food_license_url?:   string;
  submitted_at?:       string;
  rejection_reason?:   string;
  owner_name:          string;
  store_name:          string;
  phone:               string;
  kyc_status:          string;
}

const DOC_FIELDS: { key: keyof KycDoc; label: string }[] = [
  { key: 'gst_certificate_url', label: 'GST Certificate' },
  { key: 'pan_card_url',        label: 'PAN Card' },
  { key: 'aadhaar_front_url',   label: 'Aadhaar (Front)' },
  { key: 'aadhaar_back_url',    label: 'Aadhaar (Back)' },
  { key: 'shop_license_url',    label: 'Shop License' },
  { key: 'food_license_url',    label: 'Food License' },
];

export default function KYCManagement() {
  const [merchants, setMerchants] = useState<KycMerchant[]>([]);
  const [meta,      setMeta]      = useState<PageMeta | null>(null);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(true);

  const [docModal,   setDocModal]   = useState<KycDoc | null>(null);
  const [docLoading, setDocLoading] = useState<string | null>(null);

  const [decisionId, setDecisionId] = useState<string | null>(null);
  const [decision,   setDecision]   = useState<'verify' | 'reject'>('verify');
  const [reason,     setReason]     = useState('');
  const [acting,     setActing]     = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/admin/merchants?kyc_status=submitted&page=${page}&limit=10`)
      .then((r) => {
        const body = r.data as any;
        setMerchants(body.data || []);
        setMeta(body.meta || null);
      })
      .catch(() => toast.error('Failed to load KYC queue'))
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const viewDocs = async (id: string) => {
    setDocLoading(id);
    try {
      const r = await api.get(`/admin/merchants/${id}/kyc`);
      setDocModal((r.data as any).data?.kyc || null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDocLoading(null);
    }
  };

  const openDecision = (id: string, d: 'verify' | 'reject') => {
    setDecisionId(id);
    setDecision(d);
    setReason('');
  };

  const submitDecision = async () => {
    if (!decisionId) return;
    if (decision === 'reject' && reason.trim().length < 10) {
      toast.error('Rejection reason must be at least 10 characters');
      return;
    }
    setActing(true);
    try {
      await apiPost(`/admin/merchants/${decisionId}/kyc/verify`, {
        decision,
        ...(decision === 'reject' ? { rejection_reason: reason } : {}),
      });
      toast.success(decision === 'verify' ? 'KYC verified successfully' : 'KYC rejected');
      setDecisionId(null);
      setDocModal(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="section-heading text-xl">KYC Management</h2>
          <p className="text-xs text-surface-500 mt-0.5">Review merchant verification documents</p>
        </div>
        <button
          onClick={load} disabled={loading}
          className="p-2 rounded-xl hover:bg-surface-100 border border-surface-200 transition-colors"
        >
          <RefreshCw className={clsx('w-4 h-4 text-surface-500', loading && 'animate-spin')} />
        </button>
      </div>

      {loading ? (
        <div className="card p-5"><TableSkeleton rows={6} cols={5} /></div>
      ) : merchants.length === 0 ? (
        <EmptyState
          icon="🪪"
          title="No KYC submissions pending"
          desc="All merchant verification documents have been reviewed."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-100">
                  {['Store', 'Owner', 'Business Type', 'Pincode', 'Joined', 'KYC Status', 'Actions'].map((h) => (
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
                      <p className="text-[11px] text-surface-400">{m.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-surface-700">{m.owner_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-surface-600 whitespace-nowrap">{m.store_category}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-mono text-surface-600">{m.pincode ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs text-surface-500">
                        {new Date(m.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={m.kyc_status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => viewDocs(m.id)}
                          disabled={docLoading === m.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-100
                                     text-surface-700 text-xs font-bold hover:bg-surface-200 transition-colors disabled:opacity-50"
                        >
                          {docLoading === m.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <FileText className="w-3.5 h-3.5" />} Documents
                        </button>
                        <button
                          onClick={() => openDecision(m.id, 'verify')}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-500
                                     text-white text-xs font-bold hover:bg-green-600 transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => openDecision(m.id, 'reject')}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-100
                                     text-red-600 text-xs font-bold hover:bg-red-200 transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Reject
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

      {/* Document viewer modal */}
      <AnimatePresence>
        {docModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDocModal(null)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1,    y: 0 }}
              exit={{ opacity: 0, scale: 0.95,    y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="bg-white rounded-3xl shadow-hero w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-display font-bold text-surface-900 text-lg">{docModal.store_name}</h3>
                    <p className="text-sm text-surface-500">{docModal.owner_name} · {docModal.phone}</p>
                    {docModal.submitted_at && (
                      <p className="text-xs text-surface-400 mt-1">
                        Submitted {new Date(docModal.submitted_at).toLocaleString('en-IN')}
                      </p>
                    )}
                  </div>
                  <button onClick={() => setDocModal(null)} className="p-1.5 rounded-xl hover:bg-surface-100 transition-colors">
                    <X className="w-4 h-4 text-surface-400" />
                  </button>
                </div>

                {docModal.rejection_reason && (
                  <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-700">
                    Previous rejection reason: {docModal.rejection_reason}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {DOC_FIELDS.map(({ key, label }) => {
                    const url = docModal[key] as string | undefined;
                    return (
                      <div key={key} className="border border-surface-100 rounded-2xl overflow-hidden">
                        <div className="px-3 py-2 bg-surface-50 flex items-center justify-between">
                          <span className="text-xs font-bold text-surface-700">{label}</span>
                          {url && (
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:text-orange-600">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt={label} className="w-full h-40 object-cover" />
                        ) : (
                          <div className="h-40 flex items-center justify-center text-xs text-surface-400">Not uploaded</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => openDecision(docModal.merchant_id, 'reject')}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200
                               text-red-600 text-sm font-bold hover:bg-red-50 transition-colors"
                  >
                    <XCircle className="w-4 h-4" /> Reject KYC
                  </button>
                  <button
                    onClick={() => openDecision(docModal.merchant_id, 'verify')}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-500
                               text-white text-sm font-bold hover:bg-green-600 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Approve KYC
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Decision modal (approve / reject w/ reason) */}
      <AnimatePresence>
        {decisionId && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDecisionId(null)}
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
                  {decision === 'verify' ? 'Approve KYC' : 'Reject KYC'}
                </h3>
                <p className="text-sm text-surface-500 mb-4">
                  {decision === 'verify'
                    ? 'This marks the merchant as KYC verified and activates their account if it was pending.'
                    : 'Provide a reason — the merchant will be notified and asked to re-upload documents.'}
                </p>
                {decision === 'reject' && (
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason for rejection (min. 10 characters)…"
                    rows={3}
                    className="input-field resize-none text-sm mb-4"
                  />
                )}
                <div className="flex gap-3">
                  <button onClick={() => setDecisionId(null)} className="btn-ghost flex-1 text-sm">Cancel</button>
                  <button
                    onClick={submitDecision}
                    disabled={acting}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-2 rounded-xl font-semibold text-sm py-2.5',
                      'transition-all duration-200 active:scale-95',
                      decision === 'verify' ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-red-500 text-white hover:bg-red-600',
                      acting && 'opacity-60 cursor-not-allowed'
                    )}
                  >
                    {acting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {decision === 'verify' ? 'Approve' : 'Reject'}
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
