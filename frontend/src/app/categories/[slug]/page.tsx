// src/app/categories/[slug]/page.tsx
// ─────────────────────────────────────────────────────────────
// Category Product Listing — MyLocalBazaar
// Public page — no auth required to browse
// Auth required to add items to cart (redirect to login)
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ShoppingCart, ChevronLeft, Tag, Star, Package } from 'lucide-react';
import { clsx } from 'clsx';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { CATEGORIES } from '@/types';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

// ── Product Card ───────────────────────────────────────────────
function ProductCard({ product }: { product: any }) {
  const [adding, setAdding] = useState(false);
  const { addItem, openDrawer } = useCartStore();
  const { user } = useAuthStore();

  const mrp          = Number(product.mrp);
  const retail       = Number(product.retail_price);
  const discount     = mrp > retail ? Math.round(((mrp - retail) / mrp) * 100) : 0;
  const inStock      = Number(product.stock_quantity) > 0;
  const moq          = Number(product.moq) || 1;
  const productHref  = product.slug ? `/products/${encodeURIComponent(product.slug)}` : null;

  const handleAdd = async () => {
    if (!user) {
      toast.error('Please login to add items to cart');
      return;
    }
    if (!inStock) return;
    setAdding(true);
    try {
      await addItem(product.id, moq);
      toast.success(`Added ${moq} ${product.unit || 'unit'}(s) to cart`);
      openDrawer();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to add to cart');
    } finally {
      setAdding(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="card group flex flex-col overflow-hidden"
    >
      {/* Image */}
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

        {/* Badges */}
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

      {/* Content */}
      <div className="p-3 flex flex-col flex-1">
        <p className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">
          {product.store_name}
        </p>

        {productHref ? (
          <Link
            href={productHref}
            className="text-sm font-bold text-surface-900 hover:text-brand-green line-clamp-2 leading-tight flex-1 mb-2 transition-colors"
          >
            {product.name}
          </Link>
        ) : (
          <h3 className="text-sm font-bold text-surface-900 line-clamp-2 leading-tight flex-1 mb-2">
            {product.name}
          </h3>
        )}

        {/* Rating */}
        {Number(product.merchant_rating) > 0 && (
          <div className="flex items-center gap-1 mb-1.5">
            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
            <span className="text-xs font-semibold text-surface-600">
              {Number(product.merchant_rating).toFixed(1)}
            </span>
          </div>
        )}

        {/* Price row */}
        <div className="flex items-center gap-2 mb-3">
          <span className="font-bold text-base text-surface-900">
            ₹{retail.toFixed(0)}
            <span className="text-xs font-normal text-surface-500">/{product.unit || 'pc'}</span>
          </span>
          {discount > 0 && (
            <span className="text-xs text-surface-400 line-through">₹{mrp.toFixed(0)}</span>
          )}
        </div>

        {/* Add to Cart */}
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
          {!inStock ? 'Out of Stock' : adding ? 'Adding…' : `Add to Cart`}
        </button>
      </div>
    </motion.div>
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
// CATEGORY PAGE
// ═══════════════════════════════════════════════════════════════
export default function CategoryPage() {
  const params  = useParams();
  const slug    = params.slug as string;
  const catConf = CATEGORIES.find((c) => c.slug === slug);

  const [products, setProducts] = useState<any[]>([]);
  const [meta,     setMeta]     = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(1);
  const [sortBy,   setSortBy]   = useState('created_at');

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({
      page:       String(page),
      limit:      '20',
      sort_by:    sortBy,
      sort_order: 'desc',
    });
    fetch(`${API_BASE}/categories/${slug}/products?${qs}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setProducts(json.data || []);
          setMeta(json.meta);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug, page, sortBy]);

  return (
    <>
      <Header />

      <main className="min-h-screen bg-surface-50 pt-4 pb-16">
        <div className="container-mlb">

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-6 text-sm text-surface-500">
            <Link href="/" className="hover:text-brand-green transition-colors">Home</Link>
            <span>/</span>
            <Link href="/categories" className="hover:text-brand-green transition-colors">Categories</Link>
            <span>/</span>
            <span className="text-surface-900 font-semibold">
              {catConf?.label ?? slug}
            </span>
          </div>

          {/* Hero header */}
          <div
            className="rounded-3xl overflow-hidden mb-8 p-6 sm:p-8 relative"
            style={{
              background: catConf?.gradient
                ?? 'linear-gradient(135deg, #22C55E 0%, #F97316 100%)',
            }}
          >
            <div className="relative z-10">
              <p className="text-white/70 text-xs font-bold uppercase tracking-widest mb-1">
                Category
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-black text-white">
                {catConf?.emoji} {catConf?.label ?? slug}
              </h1>
              {meta && (
                <p className="text-white/60 text-sm mt-1">
                  {meta.total} product{meta.total !== 1 ? 's' : ''} available
                </p>
              )}
            </div>
          </div>

          {/* Filters bar */}
          <div className="flex items-center justify-between gap-3 mb-6">
            <Link href="/" className="flex items-center gap-1.5 btn-ghost text-sm !px-3 !py-2">
              <ChevronLeft className="w-4 h-4" /> Back
            </Link>
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-surface-500 uppercase tracking-wider">
                Sort by
              </label>
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
                className="input-field !py-1.5 !text-sm max-w-[160px]"
              >
                <option value="created_at">Newest</option>
                <option value="retail_price">Price: Low → High</option>
                <option value="rating">Top Rated</option>
              </select>
            </div>
          </div>

          {/* Product grid */}
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="text-5xl mb-4">🏪</div>
              <h2 className="font-display text-xl font-bold text-surface-900 mb-2">
                No products yet
              </h2>
              <p className="text-sm text-surface-500 mb-6">
                Merchants are adding products — check back soon!
              </p>
              <Link href="/" className="btn-primary">Back to Home</Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}

          {/* Pagination */}
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
      </main>

      <Footer />
    </>
  );
}
