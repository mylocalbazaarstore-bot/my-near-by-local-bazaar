// src/components/admin-dash/Pagination.tsx
// ─────────────────────────────────────────────────────────────
// Shared Pagination Control — Admin Dashboard
// Used by all paginated admin tables (10 rows/page)
// ─────────────────────────────────────────────────────────────

'use client';
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PageMeta {
  total?:      number;
  page?:       number;
  limit?:      number;
  totalPages?: number;
  hasNext?:    boolean;
  hasPrev?:    boolean;
}

export function Pagination({
  meta, onPageChange,
}: {
  meta:         PageMeta | null | undefined;
  onPageChange: (page: number) => void;
}) {
  if (!meta || !meta.totalPages || meta.totalPages <= 1) return null;

  const page = meta.page || 1;

  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <p className="text-xs text-surface-500">
        Page {page} of {meta.totalPages} · {meta.total} total
      </p>
      <div className="flex items-center gap-2">
        <button
          disabled={!meta.hasPrev}
          onClick={() => onPageChange(page - 1)}
          className="btn-ghost text-xs !px-3 !py-1.5 flex items-center gap-1 disabled:opacity-40"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Prev
        </button>
        <button
          disabled={!meta.hasNext}
          onClick={() => onPageChange(page + 1)}
          className="btn-ghost text-xs !px-3 !py-1.5 flex items-center gap-1 disabled:opacity-40"
        >
          Next <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
