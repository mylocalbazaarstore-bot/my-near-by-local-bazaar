// src/components/admin-dash/ProductsManagement.tsx
// ─────────────────────────────────────────────────────────────
// Admin Product Management — MyLocalBazaar
// Searchable, paginated product queue | approve / reject listings
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Search, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { api, apiPost, getErrorMessage } from '@/lib/api';
import { StatusBadge, ConfirmModal, TableSkeleton, EmptyState } from '@/components/ui/DashboardPrimitives';
import { Pagination, type PageMeta } from './Pagination';
import toast from 'react-hot-toast';

interface ProductRow {
  id:             string;
  name:           string;
  sku:            string;
  brand?:         string;
  retail_price:   number;
  mrp:            number;
  stock_quantity: number;
  product_status: string;
  is_featured:    boolean;
  created_at:     string;
  merchant_name:  string;
  merchant_id:    string;
  category_name?: string;
}

const FILTERS = [
  { value: 'pending_approval', label: 'Pending'  },
  { value: 'active',           label: 'Active'   },
  { value: 'rejected',         label: 'Rejected' },
  { value: 'out_of_stock',     label: 'Out of Stock' },
] as const;

export default function ProductsManagement({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [meta,      setMeta]     = useState<PageMeta | null>(null);
  const [page,      setPage]     = useState(1);
  const [loading,   setLoading]  = useState(true);
  const [filter,    setFilter]   = useState<typeof FILTERS[number]['value']>('pending_approval');
  const [search,    setSearch]   = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [action,    setAction]    = useState<'approve' | 'reject'>('approve');
  const [notes,     setNotes]     = useState('');
  const [acting,    setActing]    = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '10', status: filter });
    if (search) params.set('search', search);
    api.get(`/admin/products?${params.toString()}`)
      .then((r) => {
        const body = (r.data as any);
        const rows: ProductRow[] = body.data ?? [];
        setProducts(rows);
        setMeta(body.meta ?? null);
      })
      .catch(() => toast.error('Failed to load products'))
      .finally(() => setLoading(false));
  }, [page, filter, search]);

  useEffect(() => { load(); }, [load]);

  // Pending-approval badge count for sidebar (independent of current filter/page)
  useEffect(() => {
    if (!onCountChange) return;
    api.get('/admin/products?status=pending_approval&limit=1')
      .then((r) => onCountChange((r.data as any).meta?.total ?? 0))
      .catch(() => {});
  }, [onCountChange, products]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const openConfirm = (id: string, act: 'approve' | 'reject') => {
    setConfirmId(id);
    setAction(act);
    setNotes('');
  };

  const execute = async () => {
    if (!confirmId) return;
    if (action === 'reject' && notes.trim() && notes.trim().length < 10) {
      toast.error('Rejection reason must be at least 10 characters');
      return;
    }
    setActing(true);
    try {
      const endpoint = `/admin/products/${confirmId}/${action}`;
      const body = action === 'approve'
        ? { note: notes || undefined }
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
        <div className="flex flex-wrap gap-2 items-center">
          <form onSubmit={submitSearch} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, SKU, brand…"
              className="input-field !pl-8 !py-1.5 text-xs w-48"
            />
          </form>
          {FILTERS.map((s) => (
            <button
              key={s.value}
              onClick={() => { setFilter(s.value); setPage(1); }}
              className={clsx(
                'px-3 py-1.5 rounded-xl text-xs font-bold transition-all border',
                filter === s.value
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
                  {['Product', 'Store', 'Category', 'Price', 'Stock', 'Status', 'Submitted', 'Actions'].map((h) => (
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
                        {p.merchant_name ?? '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-surface-600 whitespace-nowrap">
                        {p.category_name ?? '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-bold text-surface-900 text-sm">₹{Number(p.retail_price).toFixed(0)}</p>
                      {p.mrp > p.retail_price && (
                        <p className="text-[11px] text-surface-400 line-through">₹{Number(p.mrp).toFixed(0)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-surface-700">{p.stock_quantity}</p>
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
          <div className="px-4 py-3 border-t border-surface-100">
            <Pagination meta={meta} onPageChange={setPage} />
          </div>
        </div>
      )}

      {/* Confirm modal with optional notes field */}
      <ConfirmModal
        open={!!confirmId}
        title={action === 'approve' ? 'Approve Product' : 'Reject Product'}
        desc={`"${confirmTarget?.name ?? ''}" from ${confirmTarget?.merchant_name ?? 'this store'}`}
        confirmLabel={action === 'approve' ? 'Approve' : 'Reject'}
        danger={action === 'reject'}
        loading={acting}
        onConfirm={execute}
        onClose={() => setConfirmId(null)}
      />
    </div>
  );
}
