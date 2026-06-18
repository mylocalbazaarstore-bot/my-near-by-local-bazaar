// src/components/merchant-dash/ProductsTable.tsx
// ─────────────────────────────────────────────────────────────
// Merchant Product Management CRUD Table — MyLocalBazaar
// Features:
//   • Paginated product list with search + status filter
//   • Inline quick stock edit
//   • Add new product form (slide-over)
//   • Archive confirmation modal
//   • Bulk status visibility + sorting
//   • Status badge with approval state
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Filter, Edit3, Trash2, Package,
  CheckCircle2, X, Upload, ChevronDown, Eye,
  AlertTriangle, ArrowUpDown, Loader2, Save,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useMerchantProducts } from '@/hooks/useDashboard';
import {
  StatusBadge, EmptyState, ConfirmModal, TableSkeleton, Alert,
} from '@/components/ui/DashboardPrimitives';
import { api, apiPost, apiGet, apiPostForm } from '@/lib/api';
import toast from 'react-hot-toast';

// ── Status filter options ──────────────────────────────────────
const STATUS_FILTERS = [
  { key: '',                  label: 'All Products'   },
  { key: 'active',            label: 'Active'         },
  { key: 'pending_approval',  label: 'Pending Review' },
  { key: 'out_of_stock',      label: 'Out of Stock'   },
  { key: 'rejected',          label: 'Rejected'       },
  { key: 'draft',             label: 'Draft'          },
];

// ── Inline stock editor ────────────────────────────────────────
function StockEditor({
  currentStock, onSave,
}: { currentStock: number; onSave: (n: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value,   setValue]   = useState(currentStock);
  const [saving,  setSaving]  = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(value);
      setEditing(false);
      toast.success('Stock updated');
    } catch {
      toast.error('Failed to update stock');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={clsx(
          'flex items-center gap-1.5 text-sm font-bold px-2.5 py-1 rounded-lg transition-colors',
          currentStock === 0
            ? 'text-red-600 bg-red-50 hover:bg-red-100'
            : currentStock <= 5
              ? 'text-orange-600 bg-orange-50 hover:bg-orange-100'
              : 'text-surface-700 bg-surface-100 hover:bg-surface-200'
        )}
      >
        {currentStock}
        <Edit3 className="w-3 h-3 opacity-60" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number" min="0" value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-16 text-sm font-bold text-center border border-brand-green
                   rounded-lg px-1 py-0.5 focus:outline-none"
        autoFocus
      />
      <button onClick={save} disabled={saving}
              className="p-1 rounded-lg bg-brand-green text-white hover:bg-green-600">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
      </button>
      <button onClick={() => setEditing(false)}
              className="p-1 rounded-lg hover:bg-surface-100">
        <X className="w-3.5 h-3.5 text-surface-400" />
      </button>
    </div>
  );
}

// ── Add / Edit Product Form (Slide-Over) ───────────────────────
const EMPTY_FORM = {
  name:          '',
  description:   '',
  category_id:   '',
  mrp:           '',
  retail_price:  '',
  stock_quantity: '0',
  unit:          'piece',
  brand:         '',
  gst_percentage:'0',
  moq:           '1',
  is_returnable: true,
};

function ProductForm({
  open, editProduct, onClose, onSuccess, categories,
}: {
  open: boolean; editProduct: any | null; onClose: () => void; onSuccess: () => void;
  categories: { id: string; name: string }[];
}) {
  const isEdit = !!editProduct;
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  // Image upload state. `images` holds newly picked files (not yet uploaded);
  // `existingImages` mirrors the product's already-saved images (edit mode).
  const [images,         setImages]         = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<any[]>([]);
  const [imgBusy,        setImgBusy]        = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const MAX_IMAGES = 8;

  useEffect(() => {
    if (!open) return;
    setImages([]);
    setExistingImages(editProduct?.images || []);
    if (editProduct) {
      setForm({
        name:           editProduct.name || '',
        description:    editProduct.description || '',
        category_id:    editProduct.category_id || '',
        mrp:            String(editProduct.mrp ?? ''),
        retail_price:   String(editProduct.retail_price ?? ''),
        stock_quantity: String(editProduct.stock_quantity ?? '0'),
        unit:           editProduct.unit || 'piece',
        brand:          editProduct.brand || '',
        gst_percentage: String(editProduct.gst_percentage ?? '0'),
        moq:            String(editProduct.moq ?? '1'),
        is_returnable:  editProduct.is_returnable ?? true,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError('');
  }, [open, editProduct]);

  // ── Image helpers ──────────────────────────────────────────
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list).filter((f) => f.type.startsWith('image/'));
    const room = MAX_IMAGES - existingImages.length - images.length;
    if (picked.length > room) {
      toast.error(`Maximum ${MAX_IMAGES} images per product`);
    }
    if (room > 0) setImages((prev) => [...prev, ...picked.slice(0, room)]);
  };

  const removeStaged = (idx: number) =>
    setImages((prev) => prev.filter((_, i) => i !== idx));

  const deleteExisting = async (imageId: string) => {
    if (!editProduct) return;
    setImgBusy(true);
    try {
      await api.delete(`/merchant/products/${editProduct.id}/images/${imageId}`);
      setExistingImages((prev) => prev.filter((im) => im.id !== imageId));
      toast.success('Image removed');
    } catch {
      toast.error('Failed to remove image');
    } finally {
      setImgBusy(false);
    }
  };

  const uploadImages = async (productId: string) => {
    if (!images.length) return;
    const fd = new FormData();
    images.forEach((f) => fd.append('images', f));
    await apiPostForm(`/merchant/products/${productId}/images`, fd);
  };

  const submit = async () => {
    if (!form.name || !form.mrp || !form.retail_price || !form.category_id) {
      setError('Name, category, MRP, and selling price are required.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        mrp:            parseFloat(form.mrp),
        retail_price:   parseFloat(form.retail_price),
        stock_quantity: parseInt(form.stock_quantity),
        gst_percentage: parseFloat(form.gst_percentage),
        moq:            parseInt(form.moq),
      };

      // 1) Create or update the product record first to obtain its id.
      let productId: string | undefined = editProduct?.id;
      if (isEdit) {
        await api.put(`/merchant/products/${editProduct.id}`, payload);
      } else {
        const res = await apiPost<any>('/merchant/products', payload);
        productId = (res.data as any)?.product?.id;
      }

      // 2) Upload any newly picked images against that product id.
      if (images.length && productId) {
        try {
          await uploadImages(productId);
        } catch (imgErr: any) {
          toast.error(
            imgErr?.response?.data?.message ||
            'Product saved, but image upload failed — re-try from Edit.'
          );
        }
      }

      toast.success(isEdit ? 'Product updated successfully!' : 'Product submitted for approval!');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || `Failed to ${isEdit ? 'update' : 'create'} product`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white z-50
                       shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-100">
              <button onClick={onClose}
                      className="p-2 rounded-xl hover:bg-surface-100 transition-colors">
                <X className="w-5 h-5 text-surface-600" />
              </button>
              <div>
                <h2 className="font-display font-bold text-surface-900">
                  {isEdit ? 'Edit Product' : 'Add New Product'}
                </h2>
                <p className="text-xs text-surface-500">
                  {isEdit ? 'Update your product details' : 'Submitted for admin approval'}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="badge bg-yellow-100 text-yellow-700 text-[10px]">
                  {isEdit ? 'May require re-approval' : 'Pending Approval after submit'}
                </span>
              </div>
            </div>

            {/* Form body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {error && <Alert type="error" message={error} />}

              {/* Core fields */}
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
                    Product Name *
                  </label>
                  <input
                    type="text" value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Tata Salt 1kg"
                    className="input-field"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
                    Category *
                  </label>
                  <select
                    value={form.category_id}
                    onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
                    className="input-field text-sm"
                  >
                    <option value="">Select category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Price row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
                      MRP (₹) *
                    </label>
                    <input
                      type="number" value={form.mrp}
                      onChange={(e) => setForm((f) => ({ ...f, mrp: e.target.value }))}
                      placeholder="0.00" min="0" step="0.01"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
                      Selling Price (₹) *
                    </label>
                    <input
                      type="number" value={form.retail_price}
                      onChange={(e) => setForm((f) => ({ ...f, retail_price: e.target.value }))}
                      placeholder="0.00" min="0" step="0.01"
                      className="input-field"
                    />
                  </div>
                </div>

                {/* Stock + unit row */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
                      Stock
                    </label>
                    <input
                      type="number" value={form.stock_quantity}
                      onChange={(e) => setForm((f) => ({ ...f, stock_quantity: e.target.value }))}
                      min="0" className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
                      Unit
                    </label>
                    <select
                      value={form.unit}
                      onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                      className="input-field text-sm"
                    >
                      {['piece','kg','gram','litre','ml','dozen','pack','box','set'].map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
                      MOQ
                    </label>
                    <input
                      type="number" value={form.moq}
                      onChange={(e) => setForm((f) => ({ ...f, moq: e.target.value }))}
                      min="1" className="input-field"
                    />
                  </div>
                </div>

                {/* Brand + GST */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
                      Brand
                    </label>
                    <input
                      type="text" value={form.brand}
                      onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                      placeholder="e.g. Tata" className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
                      GST %
                    </label>
                    <select
                      value={form.gst_percentage}
                      onChange={(e) => setForm((f) => ({ ...f, gst_percentage: e.target.value }))}
                      className="input-field text-sm"
                    >
                      {['0','5','12','18','28'].map((r) => (
                        <option key={r} value={r}>{r}%</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Product details, features, benefits…"
                    rows={3}
                    className="input-field resize-none"
                  />
                </div>

                {/* Returnable toggle */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setForm((f) => ({ ...f, is_returnable: !f.is_returnable }))}
                    className={clsx(
                      'w-10 h-5 rounded-full transition-colors relative',
                      form.is_returnable ? 'bg-brand-green' : 'bg-surface-300'
                    )}
                  >
                    <span className={clsx(
                      'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                      form.is_returnable ? 'translate-x-5' : 'translate-x-0.5'
                    )} />
                  </div>
                  <span className="text-sm font-semibold text-surface-700">Returnable (7 days)</span>
                </label>

                {/* Image upload */}
                <div>
                  <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
                    Product Images
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {/* Already-saved images (edit mode) */}
                    {existingImages.map((im) => (
                      <div key={im.id}
                           className="relative aspect-square rounded-lg overflow-hidden border border-surface-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={im.image_url} alt="" className="object-cover w-full h-full" />
                        <button
                          type="button" onClick={() => deleteExisting(im.id)} disabled={imgBusy}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white
                                     flex items-center justify-center hover:bg-red-500 disabled:opacity-50"
                        >
                          <X className="w-3 h-3" />
                        </button>
                        {im.is_primary && (
                          <span className="absolute bottom-0 inset-x-0 bg-brand-green/90 text-white
                                           text-[9px] font-bold text-center py-0.5">Primary</span>
                        )}
                      </div>
                    ))}

                    {/* Newly picked images (not yet uploaded) */}
                    {images.map((f, idx) => (
                      <div key={idx}
                           className="relative aspect-square rounded-lg overflow-hidden border border-brand-green/40">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={URL.createObjectURL(f)} alt="" className="object-cover w-full h-full" />
                        <button
                          type="button" onClick={() => removeStaged(idx)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white
                                     flex items-center justify-center hover:bg-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}

                    {/* Add button */}
                    {existingImages.length + images.length < MAX_IMAGES && (
                      <button
                        type="button" onClick={() => fileRef.current?.click()}
                        className="aspect-square rounded-lg border-2 border-dashed border-surface-300
                                   flex flex-col items-center justify-center gap-1 text-surface-400
                                   hover:border-brand-green hover:text-brand-green transition-colors"
                      >
                        <Upload className="w-5 h-5" />
                        <span className="text-[10px] font-bold">Add</span>
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
                  />
                  <p className="text-[11px] text-surface-400 mt-1.5">
                    Up to {MAX_IMAGES} images (JPG/PNG).
                    {!isEdit && ' Uploaded right after the product is created.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-5 border-t border-surface-100">
              <button onClick={onClose} className="btn-ghost flex-1 text-sm">Cancel</button>
              <button
                disabled={submitting}
                onClick={submit}
                className="btn-primary flex-1 text-sm"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {isEdit ? 'Saving…' : 'Submitting…'}</>
                ) : isEdit ? (
                  <><Save className="w-4 h-4" /> Save Changes</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /> Submit for Approval</>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════
// PRODUCTS TABLE
// ═══════════════════════════════════════════════════════════════
export default function ProductsTable() {
  const [statusFilter, setStatusFilter] = useState('');
  const [search,       setSearch]       = useState('');
  const [page,         setPage]         = useState(1);
  const [sortBy,       setSortBy]       = useState('created_at');
  const [addOpen,      setAddOpen]      = useState(false);
  const [editProduct,  setEditProduct]  = useState<any | null>(null);
  const [editLoading,  setEditLoading]  = useState<string | null>(null);
  const [archiveId,    setArchiveId]    = useState<string | null>(null);
  const [archiving,    setArchiving]    = useState(false);

  const params: Record<string, string | number> = {
    page, limit: 12, sort_by: sortBy, sort_order: 'desc',
  };
  if (statusFilter) params.status = statusFilter;
  if (search)       params.search = search;

  const { data, loading, refetch, archiveProduct, updateStock } = useMerchantProducts(params);
  const products = (data?.data as any[]) || MOCK_PRODUCTS;
  const meta     = (data as any)?.meta || {};

  // Categories — loaded live from API; falls back to seeded list with real UUIDs
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(LIVE_CATEGORIES);
  useEffect(() => {
    apiGet<any>('/categories')
      .then((res) => {
        const cats = (res.data as any)?.categories || [];
        if (cats.length > 0)
          setCategories(cats.map((c: any) => ({ id: c.id, name: c.name })));
      })
      .catch(() => {});
  }, []);

  const handleArchive = async () => {
    if (!archiveId) return;
    setArchiving(true);
    try {
      await archiveProduct(archiveId);
      toast.success('Product archived');
      setArchiveId(null);
    } catch {
      toast.error('Failed to archive');
    } finally {
      setArchiving(false);
    }
  };

  const handleEdit = async (productId: string) => {
    setEditLoading(productId);
    try {
      const res = await apiGet<any>(`/merchant/products/${productId}`);
      setEditProduct((res.data as any)?.product || null);
    } catch {
      toast.error('Failed to load product details');
    } finally {
      setEditLoading(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h2 className="section-heading text-xl">Product Catalog</h2>
          <p className="text-xs text-surface-500 mt-0.5">
            Manage your product listings
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="btn-primary sm:ml-auto text-sm !px-5"
        >
          <Plus className="w-4 h-4" /> Add Product
        </button>
      </div>

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="flex items-center gap-2 bg-white border border-surface-200
                        rounded-xl px-3 py-2.5 flex-1 sm:max-w-xs">
          <Search className="w-4 h-4 text-surface-400 flex-shrink-0" />
          <input
            type="search" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search products…"
            className="flex-1 bg-transparent text-sm placeholder-surface-400 focus:outline-none"
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="input-field sm:w-44 text-sm"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="input-field sm:w-40 text-sm"
        >
          <option value="created_at">Newest First</option>
          <option value="name">Name A-Z</option>
          <option value="retail_price">Price: Low-High</option>
          <option value="stock_quantity">Stock Level</option>
        </select>
      </div>

      {/* Stats row */}
      {!loading && meta.total !== undefined && (
        <div className="flex items-center gap-4 text-xs text-surface-500">
          <span>Showing <strong className="text-surface-900">{products.length}</strong> of <strong className="text-surface-900">{meta.total || products.length}</strong> products</span>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="card p-4">
          <TableSkeleton rows={6} cols={5} />
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon="📦"
          title="No products yet"
          desc="Add your first product to start selling on MyLocalBazaar."
          action={{ label: 'Add Product', onClick: () => setAddOpen(true) }}
        />
      ) : (
        <div className="card overflow-hidden">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[3fr_1fr_1fr_1fr_1fr_auto]
                           gap-4 px-5 py-3 bg-surface-50 border-b border-surface-100
                           text-[11px] font-bold text-surface-400 uppercase tracking-wider">
            <span>Product</span>
            <span>Price</span>
            <span>Stock</span>
            <span>Status</span>
            <span>GST</span>
            <span>Actions</span>
          </div>

          {/* Table rows */}
          <div className="divide-y divide-surface-100">
            {products.map((product: any, i: number) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className="grid grid-cols-1 md:grid-cols-[3fr_1fr_1fr_1fr_1fr_auto]
                           gap-3 md:gap-4 px-5 py-4 items-center
                           hover:bg-surface-50 transition-colors group"
              >
                {/* Product info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-surface-100 overflow-hidden flex-shrink-0">
                    {product.primary_image ? (
                      <Image src={product.primary_image} alt={product.name}
                             width={44} height={44} className="object-cover w-full h-full" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-lg">📦</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-surface-900 line-clamp-1">{product.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {product.brand && (
                        <span className="text-[10px] text-surface-400">{product.brand}</span>
                      )}
                      {product.sku && (
                        <span className="text-[10px] font-mono text-surface-400">SKU: {product.sku}</span>
                      )}
                      {product.category_name && (
                        <span className="badge bg-surface-100 text-surface-500 text-[10px]">
                          {product.category_name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Price */}
                <div>
                  <p className="text-sm font-bold text-surface-900">₹{Number(product.retail_price).toFixed(0)}</p>
                  {product.mrp > product.retail_price && (
                    <p className="text-[10px] text-surface-400 line-through">
                      ₹{Number(product.mrp).toFixed(0)}
                    </p>
                  )}
                </div>

                {/* Stock — inline editable */}
                <div>
                  <StockEditor
                    currentStock={product.stock_quantity}
                    onSave={(n) => updateStock(product.id, n)}
                  />
                  {product.unit && (
                    <p className="text-[10px] text-surface-400 mt-0.5">{product.unit}</p>
                  )}
                </div>

                {/* Status */}
                <div>
                  <StatusBadge status={product.product_status} />
                  {product.product_status === 'rejected' && (
                    <p className="text-[10px] text-red-400 mt-1 max-w-[120px] line-clamp-1">
                      {product.rejection_reason || 'See details'}
                    </p>
                  )}
                </div>

                {/* GST */}
                <div className="text-sm text-surface-600">
                  {product.gst_percentage}%
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  <button
                    title="View product"
                    onClick={() => window.open(`/products/${product.slug}`, '_blank')}
                    className="p-1.5 rounded-lg hover:bg-surface-100 transition-colors text-surface-400
                               hover:text-brand-green"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    title="Edit product"
                    onClick={() => handleEdit(product.id)}
                    disabled={editLoading === product.id}
                    className="p-1.5 rounded-lg hover:bg-surface-100 transition-colors text-surface-400
                               hover:text-brand-orange disabled:opacity-50"
                  >
                    {editLoading === product.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Edit3 className="w-4 h-4" />}
                  </button>
                  <button
                    title="Archive product"
                    onClick={() => setArchiveId(product.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-surface-400
                               hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={!meta.hasPrev}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="btn-ghost text-xs !px-4 disabled:opacity-40">← Prev</button>
          <span className="text-xs text-surface-500">
            Page {meta.page} of {meta.totalPages}
          </span>
          <button disabled={!meta.hasNext}
                  onClick={() => setPage((p) => p + 1)}
                  className="btn-ghost text-xs !px-4 disabled:opacity-40">Next →</button>
        </div>
      )}

      {/* Add / Edit product form */}
      <ProductForm
        open={addOpen || !!editProduct}
        editProduct={editProduct}
        onClose={() => { setAddOpen(false); setEditProduct(null); }}
        onSuccess={() => { refetch(); setAddOpen(false); setEditProduct(null); }}
        categories={categories}
      />

      {/* Archive confirm modal */}
      <ConfirmModal
        open={!!archiveId}
        title="Archive Product"
        desc="This product will be hidden from customers. You can restore it later from archived products."
        confirmLabel="Archive"
        danger
        loading={archiving}
        onConfirm={handleArchive}
        onClose={() => setArchiveId(null)}
      />
    </div>
  );
}

// ── Mock data for UI dev (before backend) ──────────────────────
const MOCK_PRODUCTS = Array.from({ length: 6 }, (_, i) => ({
  id:             `prod-${i}`,
  name:           ['Fresh Tomatoes 1kg','Amul Milk 500ml','Tata Salt 1kg','Surf Excel 2kg','Good Day Biscuits','Britannia Bread'][i],
  slug:           `product-${i}`,
  brand:          ['Local Farm','Amul','Tata','HUL','Britannia','Britannia'][i],
  sku:            `SKU-${1000 + i}`,
  retail_price:   [35, 28, 22, 189, 45, 40][i],
  mrp:            [40, 30, 25, 210, 50, 45][i],
  stock_quantity: [45, 120, 80, 12, 0, 33][i],
  unit:           ['kg','ml','kg','kg','pack','loaf'][i],
  gst_percentage: [0, 5, 0, 18, 12, 12][i],
  product_status: ['active','active','active','pending_approval','out_of_stock','active'][i],
  category_name:  'Grocery & FMCG',
}));

// Real category UUIDs from the database — used as the instant fallback before
// the live /categories fetch resolves.  Keep in sync with DB migrations.
const LIVE_CATEGORIES = [
  { id: '5c4038ef-b20c-43f9-97a0-07177bccba2d', name: 'Grocery & FMCG'    },
  { id: 'ca242c79-1efb-4b88-8bd2-b9fc16c90379', name: 'Wholesale Market'   },
  { id: 'ce8d50fb-e072-46e7-b85a-af766430f6ad', name: 'Electronics'        },
  { id: '4c8c51d1-63db-4bf6-a8b9-ce881604f8db', name: 'Hardware'           },
  { id: 'b3f4599e-8b70-450e-9c92-53f59c2f1335', name: 'Clothing & Fashion' },
  { id: '1942d767-389f-4b15-ab7c-9d75b6bcb0bb', name: 'Medical Store'      },
  { id: '0108a47a-6142-4e84-8a75-bd113d7ac68b', name: 'Specialty Stores'   },
];
