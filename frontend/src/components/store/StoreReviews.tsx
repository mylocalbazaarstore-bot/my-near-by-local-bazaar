'use client';
// src/components/store/StoreReviews.tsx
// ─────────────────────────────────────────────────────────────
// Merchant Storefront — Reviews Section
// Lists customer reviews for a merchant, with pagination
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Star, CheckCircle2 } from 'lucide-react';
import { clsx } from 'clsx';
import { apiGet } from '@/lib/api';
import { EmptyState } from '@/components/ui/DashboardPrimitives';
import type { MerchantReview, PaginatedResponse } from '@/types';

type Meta = PaginatedResponse<MerchantReview>['meta'];

// ── Relative time helper ────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

// ── Star display ─────────────────────────────────────────────
function StarRow({ rating, size = 'w-4 h-4' }: { rating: number; size?: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={clsx(size, i <= Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-surface-200')}
        />
      ))}
    </div>
  );
}

// ── Review card ───────────────────────────────────────────────
function ReviewCard({ review }: { review: MerchantReview }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-4"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <StarRow rating={review.rating} />
          {review.title && (
            <h4 className="font-bold text-sm text-surface-900 mt-1.5">{review.title}</h4>
          )}
        </div>
        {review.is_verified && (
          <span className="badge bg-green-100 text-green-700 text-[10px] flex-shrink-0">
            <CheckCircle2 className="w-3 h-3" /> Verified
          </span>
        )}
      </div>

      {review.body && (
        <p className="text-sm text-surface-600 leading-relaxed mb-2">{review.body}</p>
      )}

      <p className="text-xs text-surface-400">
        {review.reviewer_name} · {timeAgo(review.created_at)}
      </p>
    </motion.div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────
function ReviewSkeleton() {
  return (
    <div className="card p-4 space-y-2">
      <div className="skeleton h-4 w-24 rounded" />
      <div className="skeleton h-4 w-1/3 rounded" />
      <div className="skeleton h-3 w-full rounded" />
      <div className="skeleton h-3 w-2/3 rounded" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STORE REVIEWS
// ═══════════════════════════════════════════════════════════════
export default function StoreReviews({
  merchantId, rating, totalReviews,
}: {
  merchantId:   string;
  rating:       number;
  totalReviews: number;
}) {
  const [reviews, setReviews] = useState<MerchantReview[]>([]);
  const [meta,    setMeta]    = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    apiGet<MerchantReview[]>(`/reviews/merchant/${merchantId}?page=${page}&limit=5`)
      .then((res) => {
        if (cancelled) return;
        setReviews(res.data || []);
        setMeta((res as any).meta || null);
      })
      .catch(() => {
        if (cancelled) return;
        setReviews([]);
        setMeta(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [merchantId, page]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h2 className="section-heading !mb-0">Reviews</h2>
        {totalReviews > 0 && (
          <div className="flex items-center gap-1.5 text-sm">
            <StarRow rating={rating} />
            <span className="font-bold text-surface-900">{Number(rating).toFixed(1)}</span>
            <span className="text-surface-400">({totalReviews})</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <ReviewSkeleton key={i} />)}
        </div>
      ) : reviews.length === 0 ? (
        <EmptyState
          icon="💬"
          title="No reviews yet"
          desc="Be the first to review this store!"
        />
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-8">
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
