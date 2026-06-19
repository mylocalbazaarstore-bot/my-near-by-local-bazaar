'use client';
// src/components/store/StoreProducts.tsx
// ─────────────────────────────────────────────────────────────
// Merchant Storefront — Product Grid
// Search / category / sort / price / stock filters, pagination,
// add-to-cart with single-merchant cart enforcement
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Search, ShoppingCart, Package, Star, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { apiGet, getErrorMessage } from '@/lib/api';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { ConfirmModal, EmptyState } from '@/components/ui/DashboardPrimitives';
import type { MerchantProduct, PaginatedResponse, Category } from '@/types';

type Meta = PaginatedResponse<MerchantProduct>['meta'];

interface CategoryOption {
  id:   string;
  name: string;
  slug: string;
}

const SORT_OPTIONS = [
  { value: 'created_at:desc',   label: 'Newest' },
  { value: 'retail_price:asc',  label: 'Price: Low to High' },
  { value: 'retail_price:desc', label: 'Price: High to Low' },
  { value: 'name:asc',          label: 'Name (A-Z)' },
  { value: 'rating:desc',       label: 'Top Rated' },
];

// ── Product card ─────────────────────────────────────────────
function StoreProductCard({
  product, storeSlug, merchantId,
}: {
  product:    MerchantProduct;
  storeSlug:  string;
  merchantId: string;
}) {
  const [adding, setAdding]           = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const router = useRouter();
  const { user } = useAuthStore();
  const {
    addItem, openDrawer, items: cartItems,
    merchantId: cartMerchantId, storeName: cartStoreName,
  } = useCartStore();

  const mrp      = Number(product.mrp);
  const retail   = Number(product.retail_price);
  const discount = mrp > retail ? Math.round(((mrp - retail) / mrp) * 100) : 0;
  const inStock  = Number(product.stock_quantity) > 0;
  const moq      = Number(product.moq) || 1;
  const productHref = product.slug ? `/products/${encodeURIComponent(product.slug)}` : null;

  const performAdd = async () => {
    setAdding(true);
    try {
      const result = await addItem(product.id, moq);
      if (result.cart_switched) {
        toast.success(
          `Your cart had items from another store. They've been replaced with items from ${result.store_name}.`
        );
      } else {
        toast.success('Added to cart!');
      }
      openDrawer();
      setConfirmOpen(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  const handleAdd = () => {
    if (!inStock) return;
    if (!user) {
      router.push(`/login?redirect=/store/${storeSlug}`);
      return;
    }
    if (cartItems.length > 0 && cartMerchantId && cartMerchantId !== merchantId) {
      setConfirmOpen(true);
      return;
    }
    performAdd();
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="card group flex flex-col overflow-hidden"
      >
        <Link
          href={productHref || '#'}
          aria-label={`View ${product.name} image gallery`}
          aria-disabled={!productHref}
          tabIndex={productHref ? 0 : -1}
          className={clsx(
            'relative block aspect-square bg-surface-50 overflow-hidden',
            productHref ? 'cursor-pointer' : 'pointer-events-none'
          )}
        >
          {product.primary_image ? (
            <Image
              src={product.primary_image}
              alt={product.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-12 h-12 text-surface-300" />
            </div>
          )}

          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {discount > 0 && (
              <span className="text-[10px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded-md">
                {discount}% OFF
              </span>
            )}
            {!inStock && (
              <span className="text-[10px] font-black bg-surface-900/80 text-white px-1.5 py-0.5 rounded-md">
                Out of Stock
              </span>
            )}
          </div>

          {moq > 1 && (
            <div className="absolute top-2 right-2">
              <span className="text-[10px] font-black bg-brand-orange text-white px-1.5 py-0.5 rounded-md">
                Min {moq} {product.unit || 'pcs'}
              </span>
            </div>
          )}
        </Link>

        <div className="p-3 flex flex-col flex-1">
          {product.category_name && (
            <p className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">
              {product.category_name}
            </p>
          )}

          {productHref ? (
            <Link
              href={productHref}
              className="text-sm font-bold text-surface-900 hover:text-brand-green line-clamp-2 leading-tight mb-1 transition-colors"
            >
              {product.name}
            </Link>
          ) : (
            <h3 className="text-sm font-bold text-surface-900 line-clamp-2 leading-tight mb-1">
              {product.name}
            </h3>
          )}

          {product.short_description ? (
            <p className="text-xs text-surface-500 line-clamp-2 mb-2 flex-1">
              {product.short_description}
            </p>
          ) : (
            <div className="flex-1" />
          )}

          {Number(product.merchant_rating) > 0 && (
            <div className="flex items-center gap-1 mb-1.5">
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
              <span className="text-xs font-semibold text-surface-600">
                {Number(product.merchant_rating).toFixed(1)}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 mb-3">
            <span className="font-bold text-base text-surface-900">
              ₹{retail.toFixed(0)}
              <span className="text-xs font-normal text-surface-500">/{product.unit || 'pc'}</span>
            </span>
            {discount > 0 && (
              <span className="text-xs text-surface-400 line-through">₹{mrp.toFixed(0)}</span>
            )}
          </div>

          <button
            onClick={handleAdd}
            disabled={adding || !inStock}
            className={clsx(
              'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl',
              'text-sm font-bold transition-all duration-200',
              !inStock
                ? 'bg-surface-100 text-surface-400 cursor-not-allowed'
                : adding
                  ? 'bg-brand-green/20 text-brand-green cursor-wait'
                  : 'bg-brand-green/10 text-brand-green hover:bg-brand-green hover:text-white'
            )}
          >
            <ShoppingCart className="w-4 h-4" />
            {!inStock ? 'Out of Stock' : adding ? 'Adding…' : 'Add to Cart'}
          </button>
        </div>
      </motion.div>

      <ConfirmModal
        open={confirmOpen}
        title="Switch stores?"
        desc={`Adding this item will clear your current cart from ${cartStoreName || 'another store'}. Continue?`}
        confirmLabel="Switch & Add"
        danger
        loading={adding}
        onConfirm={performAdd}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}

// ── Skeleton card ──────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton aspect-square" />
      <div className="p-3 space-y-2">
        <div className="skeleton h-3 w-2/3 rounded" />
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-4 w-1/2 rounded" />
        <div className="skeleton h-9 w-full rounded-xl" />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STORE PRODUCTS
// ═══════════════════════════════════════════════════════════════
export default function StoreProducts({
  merchantId, storeSlug, isOpen,
}: {
  merchantId: string;
  storeSlug:  string;
  storeName:  string;
  isOpen:     boolean;
}) {
  const [products, setProducts] = useState<MerchantProduct[]>([]);
  const [meta,     setMeta]     = useState<Meta | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(1);

  // Raw (immediate) input values
  const [searchInput,   setSearchInput]   = useState('');
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');

  // Debounced filter values (400ms)
  const [search,   setSearch]   = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  const [categoryId, setCategoryId] = useState('');
  const [sortValue,  setSortValue]  = useState('created_at:desc');
  const [inStock,    setInStock]    = useState(false);

  const [categories, setCategories] = useState<CategoryOption[]>([]);

  // ── Debounce search / price inputs ──────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setMinPrice(minPriceInput.trim());
      setMaxPrice(maxPriceInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput, minPriceInput, maxPriceInput]);

  // ── Discover categories present in this store's catalog ─────
  // Approach: fetch the full categories master list (id/name/slug),
  // then a light unfiltered call for this merchant's products to
  // collect which category_slugs are actually in use, and map
  // those slugs back to category ids for the filter dropdown.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [catRes, prodRes] = await Promise.all([
          apiGet<{ categories: Category[] }>('/categories'),
          apiGet<MerchantProduct[]>(`/merchants/${merchantId}/products?limit=100`),
        ]);
        if (cancelled) return;
        const allCats = catRes.data?.categories || [];
        const slugsInStore = new Set(
          (prodRes.data || []).map((p) => p.category_slug).filter(Boolean)
        );
        const available = allCats
          .filter((c) => slugsInStore.has(c.slug))
          .map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
        setCategories(available);
      } catch {
        // Category filter is a convenience — ignore failures
      }
    })();
    return () => { cancelled = true; };
  }, [merchantId]);

  // ── Fetch products ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const [sortBy, sortOrder] = sortValue.split(':');
    const params: Record<string, string> = {
      page:       String(page),
      limit:      '20',
      sort_by:    sortBy,
      sort_order: sortOrder,
    };
    if (search)     params.search      = search;
    if (categoryId) params.category_id = categoryId;
    if (minPrice)   params.min_price   = minPrice;
    if (maxPrice)   params.max_price   = maxPrice;
    if (inStock)    params.in_stock    = 'true';

    const qs = new URLSearchParams(params).toString();

    apiGet<MerchantProduct[]>(`/merchants/${merchantId}/products?${qs}`)
      .then((res) => {
        if (cancelled) return;
        setProducts(res.data || []);
        setMeta((res as any).meta || null);
      })
      .catch(() => {
        if (cancelled) return;
        setProducts([]);
        setMeta(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [merchantId, page, search, categoryId, sortValue, minPrice, maxPrice, inStock]);

  const hasActiveFilters = Boolean(search || categoryId || minPrice || maxPrice || inStock);

  const clearFilters = () => {
    setSearchInput('');
    setMinPriceInput('');
    setMaxPriceInput('');
    setSearch('');
    setMinPrice('');
    setMaxPrice('');
    setCategoryId('');
    setInStock(false);
    setPage(1);
  };

  return (
    <div className="container-mlb py-8">
      {!isOpen && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800
                        rounded-2xl px-4 py-3 mb-6 text-sm">
          <Clock className="w-4 h-4 flex-shrink-0" />
          This store is currently closed. You can browse but cannot place orders right now.
        </div>
      )}

      <h2 className="section-heading">Products</h2>

      {/* ── Filters bar ─────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="input-field pl-9 !text-sm"
          />
        </div>

        {categories.length > 0 && (
          <select
            value={categoryId}
            onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
            className="input-field !text-sm max-w-[180px]"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}

        <select
          value={sortValue}
          onChange={(e) => { setSortValue(e.target.value); setPage(1); }}
          className="input-field !text-sm max-w-[180px]"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Min ₹"
            value={minPriceInput}
            min={0}
            onChange={(e) => setMinPriceInput(e.target.value)}
            className="input-field !text-sm w-24"
          />
          <span className="text-surface-400">–</span>
          <input
            type="number"
            placeholder="Max ₹"
            value={maxPriceInput}
            min={0}
            onChange={(e) => setMaxPriceInput(e.target.value)}
            className="input-field !text-sm w-24"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-surface-600 whitespace-nowrap cursor-pointer">
          <input
            type="checkbox"
            checked={inStock}
            onChange={(e) => { setInStock(e.target.checked); setPage(1); }}
            className="rounded"
          />
          In stock only
        </label>
      </div>

      {/* ── Grid ────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon="🛍️"
          title={hasActiveFilters ? 'No products match your filters' : "This store hasn't added any products yet"}
          desc={hasActiveFilters ? 'Try adjusting or clearing your filters.' : 'Check back soon for new arrivals!'}
          action={hasActiveFilters ? { label: 'Clear Filters', onClick: clearFilters } : undefined}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {products.map((p) => (
            <StoreProductCard key={p.id} product={p} storeSlug={storeSlug} merchantId={merchantId} />
          ))}
        </div>
      )}

      {/* ── Pagination ──────────────────────────────────────── */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-10">
          <button
            disabled={!meta.hasPrev}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="btn-ghost text-sm disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-sm text-surface-500">
            Page {meta.page} of {meta.totalPages}
          </span>
          <button
            disabled={!meta.hasNext}
            onClick={() => setPage((p) => p + 1)}
            className="btn-ghost text-sm disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
