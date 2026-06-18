'use client';
// src/app/products/[slug]/page.tsx — Customer Product Detail — MyLocalBazaar
// ─────────────────────────────────────────────────────────────
// E-commerce style product view: image gallery (thumbnails + main
// viewer) + product details + add-to-cart. Resolves by slug via
// GET /products/slug/:slug, which returns the full images[] array.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { clsx } from 'clsx';
import {
  ShoppingCart, Package, Store, ChevronLeft, RotateCcw, Check, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiGet, getErrorMessage } from '@/lib/api';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { ConfirmModal } from '@/components/ui/DashboardPrimitives';

interface ProductImage {
  id:         string;
  image_url:  string;
  alt_text?:  string;
  is_primary: boolean;
  sort_order: number;
}

export default function ProductDetailPage() {
  const params = useParams();
  const slug   = String(params?.slug || '');
  const router = useRouter();

  const [product, setProduct] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [active,  setActive]  = useState(0);

  const [adding,      setAdding]      = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { user } = useAuthStore();
  const {
    addItem, openDrawer, items: cartItems,
    merchantId: cartMerchantId, storeName: cartStoreName,
  } = useCartStore();

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setMissing(false);
    apiGet<any>(`/products/slug/${encodeURIComponent(slug)}`)
      .then((res) => {
        if (cancelled) return;
        setProduct((res.data as any)?.product || null);
        setActive(0);
      })
      .catch(() => { if (!cancelled) setMissing(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  // ── Loading skeleton ────────────────────────────────────────
  if (loading) {
    return (
      <div className="container-mlb py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="skeleton aspect-square rounded-2xl" />
          <div className="space-y-4">
            <div className="skeleton h-4 w-1/3 rounded" />
            <div className="skeleton h-8 w-3/4 rounded" />
            <div className="skeleton h-6 w-1/2 rounded" />
            <div className="skeleton h-24 w-full rounded" />
            <div className="skeleton h-12 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // ── Not found ───────────────────────────────────────────────
  if (missing || !product) {
    return (
      <div className="container-mlb py-24 text-center">
        <div className="text-5xl mb-4">🔍</div>
        <h1 className="font-display text-2xl font-bold text-surface-900 mb-2">Product not found</h1>
        <p className="text-surface-500 mb-6">This product may have been removed or is not available.</p>
        <Link href="/" className="btn-primary inline-flex">← Back to Home</Link>
      </div>
    );
  }

  const images: ProductImage[] = Array.isArray(product.images) ? product.images : [];
  // Show primary first, then by sort_order
  const ordered = [...images].sort(
    (a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || a.sort_order - b.sort_order
  );
  const mainImage = ordered[active]?.image_url;

  const mrp      = Number(product.mrp);
  const retail   = Number(product.retail_price);
  const discount = mrp > retail ? Math.round(((mrp - retail) / mrp) * 100) : 0;
  const inStock  = Number(product.stock_quantity) > 0;
  const moq      = Number(product.moq) || 1;

  const performAdd = async () => {
    setAdding(true);
    try {
      const result = await addItem(product.id, moq);
      if (result.cart_switched) {
        toast.success(`Your cart was replaced with items from ${result.store_name}.`);
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
      router.push(`/login?redirect=/products/${slug}`);
      return;
    }
    if (cartItems.length > 0 && cartMerchantId && cartMerchantId !== product.merchant_id) {
      setConfirmOpen(true);
      return;
    }
    performAdd();
  };

  return (
    <div className="container-mlb py-6">
      {/* Breadcrumb / back */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm font-semibold text-surface-500 hover:text-surface-800 mb-5"
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* ── Gallery ──────────────────────────────────────────── */}
        <div>
          <div className="relative aspect-square bg-surface-50 rounded-2xl overflow-hidden border border-surface-100">
            {mainImage ? (
              <Image src={mainImage} alt={product.name} fill className="object-cover" priority />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-16 h-16 text-surface-300" />
              </div>
            )}
            {discount > 0 && (
              <span className="absolute top-3 left-3 text-xs font-black bg-red-500 text-white px-2 py-1 rounded-md">
                {discount}% OFF
              </span>
            )}
          </div>

          {/* Thumbnails (scrollable — supports large galleries, e.g. Banquet Halls) */}
          {ordered.length > 1 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {ordered.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setActive(i)}
                  className={clsx(
                    'relative w-16 h-16 rounded-xl overflow-hidden border-2 flex-shrink-0 transition-all',
                    i === active ? 'border-brand-green ring-2 ring-brand-green/20' : 'border-surface-200 hover:border-surface-300'
                  )}
                >
                  <Image src={img.image_url} alt={img.alt_text || `${product.name} ${i + 1}`} fill className="object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Details ──────────────────────────────────────────── */}
        <div>
          {product.category_name && (
            <p className="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2">
              {product.category_name}
            </p>
          )}
          <h1 className="font-display text-2xl md:text-3xl font-extrabold text-surface-900 leading-tight mb-2">
            {product.name}
          </h1>

          {product.brand && (
            <p className="text-sm text-surface-500 mb-3">by <span className="font-semibold text-surface-700">{product.brand}</span></p>
          )}

          {/* Price */}
          <div className="flex items-end gap-3 mb-4">
            <span className="font-display text-3xl font-black text-surface-900">
              ₹{retail.toFixed(0)}
              <span className="text-sm font-normal text-surface-500">/{product.unit || 'pc'}</span>
            </span>
            {discount > 0 && (
              <span className="text-base text-surface-400 line-through mb-1">₹{mrp.toFixed(0)}</span>
            )}
            {discount > 0 && (
              <span className="text-sm font-bold text-brand-green mb-1">{discount}% off</span>
            )}
          </div>

          {/* Stock + badges */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <span className={clsx(
              'inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg',
              inStock ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
            )}>
              {inStock ? <><Check className="w-3.5 h-3.5" /> In Stock</> : 'Out of Stock'}
            </span>
            {moq > 1 && (
              <span className="text-xs font-bold bg-brand-orange/10 text-brand-orange px-2.5 py-1 rounded-lg">
                Min order {moq} {product.unit || 'pcs'}
              </span>
            )}
            {product.is_returnable && (
              <span className="inline-flex items-center gap-1 text-xs font-bold bg-surface-100 text-surface-600 px-2.5 py-1 rounded-lg">
                <RotateCcw className="w-3.5 h-3.5" /> Returnable
                {product.return_window_days ? ` (${product.return_window_days}d)` : ''}
              </span>
            )}
          </div>

          {/* Add to cart */}
          <button
            onClick={handleAdd}
            disabled={adding || !inStock}
            className={clsx(
              'w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-base font-bold transition-all mb-5',
              !inStock
                ? 'bg-surface-100 text-surface-400 cursor-not-allowed'
                : 'bg-brand-green text-white hover:bg-green-600 active:scale-[0.99]'
            )}
          >
            {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShoppingCart className="w-5 h-5" />}
            {!inStock ? 'Out of Stock' : adding ? 'Adding…' : 'Add to Cart'}
          </button>

          {/* Store link */}
          {product.store_slug && (
            <Link
              href={`/store/${product.store_slug}`}
              className="flex items-center gap-2 text-sm font-semibold text-surface-700 hover:text-brand-green border border-surface-200 rounded-xl px-4 py-3 mb-5 transition-colors"
            >
              <Store className="w-4 h-4" />
              Visit store: <span className="font-bold">{product.store_name}</span>
            </Link>
          )}

          {/* Description */}
          {product.description && (
            <div>
              <h2 className="text-sm font-bold text-surface-900 mb-2">Description</h2>
              <p className="text-sm text-surface-600 leading-relaxed whitespace-pre-line">
                {product.description}
              </p>
            </div>
          )}
        </div>
      </div>

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
    </div>
  );
}
