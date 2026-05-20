// src/components/ui/DashboardPrimitives.tsx
// ─────────────────────────────────────────────────────────────
// Shared Dashboard UI Primitives — MyLocalBazaar
// Stat cards, badges, empty states, skeleton loaders,
// confirmation modals — used by both dashboards
// ─────────────────────────────────────────────────────────────

'use client';
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, CheckCircle, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

// ── KPI Stat Card ──────────────────────────────────────────────
export function StatCard({
  label, value, sub, icon: Icon, color = 'green', trend, loading = false,
}: {
  label:    string;
  value:    string | number;
  sub?:     string;
  icon:     React.ElementType;
  color?:   'green' | 'orange' | 'blue' | 'red' | 'purple' | 'yellow';
  trend?:   { value: number; label: string };
  loading?: boolean;
}) {
  const palettes: Record<string, { bg: string; icon: string; glow: string; text: string }> = {
    green:  { bg: 'bg-green-50  border-green-100',  icon: 'bg-green-500',  glow: 'shadow-green-100',  text: 'text-green-600'  },
    orange: { bg: 'bg-orange-50 border-orange-100', icon: 'bg-orange-500', glow: 'shadow-orange-100', text: 'text-orange-600' },
    blue:   { bg: 'bg-blue-50   border-blue-100',   icon: 'bg-blue-500',   glow: 'shadow-blue-100',   text: 'text-blue-600'   },
    red:    { bg: 'bg-red-50    border-red-100',     icon: 'bg-red-500',    glow: 'shadow-red-100',    text: 'text-red-600'    },
    purple: { bg: 'bg-purple-50 border-purple-100', icon: 'bg-purple-500', glow: 'shadow-purple-100', text: 'text-purple-600' },
    yellow: { bg: 'bg-yellow-50 border-yellow-100', icon: 'bg-yellow-500', glow: 'shadow-yellow-100', text: 'text-yellow-600' },
  };
  const p = palettes[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        'rounded-2xl border p-5 bg-white shadow-card hover:shadow-card-hover',
        'transition-all duration-300 hover:-translate-y-0.5'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shadow-sm', p.icon)}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {trend && (
          <span className={clsx(
            'text-xs font-bold px-2 py-0.5 rounded-full',
            trend.value >= 0
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          )}>
            {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}%
          </span>
        )}
      </div>

      {loading ? (
        <>
          <div className="skeleton h-7 w-24 rounded mb-1" />
          <div className="skeleton h-3.5 w-32 rounded" />
        </>
      ) : (
        <>
          <p className="font-display text-2xl font-bold text-surface-900 leading-tight mb-0.5">
            {value}
          </p>
          <p className="text-xs font-semibold text-surface-500">{label}</p>
          {sub && <p className="text-[11px] text-surface-400 mt-0.5">{sub}</p>}
        </>
      )}
    </motion.div>
  );
}

// ── Status Badge ───────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  // Order statuses
  payment_pending:    'bg-yellow-100 text-yellow-700',
  payment_processed:  'bg-blue-100 text-blue-700',
  merchant_approved:  'bg-cyan-100 text-cyan-700',
  merchant_rejected:  'bg-red-100 text-red-700',
  accepted:           'bg-teal-100 text-teal-700',
  packed:             'bg-indigo-100 text-indigo-700',
  out_for_delivery:   'bg-violet-100 text-violet-700',
  delivered:          'bg-green-100 text-green-700',
  cancelled:          'bg-red-100 text-red-600',
  return_requested:   'bg-orange-100 text-orange-700',
  refund_initiated:   'bg-pink-100 text-pink-700',
  refund_completed:   'bg-green-100 text-green-700',
  // Product statuses
  active:             'bg-green-100 text-green-700',
  pending_approval:   'bg-yellow-100 text-yellow-700',
  rejected:           'bg-red-100 text-red-700',
  out_of_stock:       'bg-orange-100 text-orange-700',
  archived:           'bg-surface-100 text-surface-500',
  draft:              'bg-surface-100 text-surface-500',
  // KYC
  verified:           'bg-green-100 text-green-700',
  submitted:          'bg-blue-100 text-blue-700',
  pending:            'bg-yellow-100 text-yellow-700',
};

const STATUS_LABELS: Record<string, string> = {
  payment_pending:   'Awaiting Payment',
  payment_processed: 'Payment Received',
  merchant_approved: 'Approved',
  merchant_rejected: 'Rejected',
  accepted:          'Accepted',
  packed:            'Packed',
  out_for_delivery:  'Out for Delivery',
  delivered:         'Delivered ✓',
  cancelled:         'Cancelled',
  return_requested:  'Return Requested',
  refund_initiated:  'Refund Processing',
  refund_completed:  'Refunded',
  active:            'Active',
  pending_approval:  'Pending Review',
  rejected:          'Rejected',
  out_of_stock:      'Out of Stock',
  archived:          'Archived',
  draft:             'Draft',
  pending:           'Pending',
  verified:          'Verified',
  submitted:         'Submitted',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={clsx(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold',
      STATUS_STYLES[status] || 'bg-surface-100 text-surface-600'
    )}>
      {STATUS_LABELS[status] || status.replace(/_/g, ' ')}
    </span>
  );
}

// ── Empty State ────────────────────────────────────────────────
export function EmptyState({
  icon, title, desc, action,
}: {
  icon:    string;
  title:   string;
  desc:    string;
  action?: { label: string; href?: string; onClick?: () => void };
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
    >
      <div className="text-5xl mb-4 animate-float">{icon}</div>
      <h3 className="font-display text-xl font-bold text-surface-900 mb-2">{title}</h3>
      <p className="text-sm text-surface-500 max-w-xs leading-relaxed mb-6">{desc}</p>
      {action && (
        action.href ? (
          <a href={action.href} className="btn-primary text-sm">{action.label}</a>
        ) : (
          <button onClick={action.onClick} className="btn-primary text-sm">{action.label}</button>
        )
      )}
    </motion.div>
  );
}

// ── Table Skeleton ──────────────────────────────────────────────
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={clsx('flex gap-4', 'animate-fade-in')}
             style={{ animationDelay: `${i * 0.04}s` }}>
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="skeleton h-10 flex-1 rounded-xl" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Confirm Modal ──────────────────────────────────────────────
export function ConfirmModal({
  open, title, desc, confirmLabel = 'Confirm',
  danger = false, loading = false,
  onConfirm, onClose,
}: {
  open:          boolean;
  title:         string;
  desc:          string;
  confirmLabel?: string;
  danger?:       boolean;
  loading?:      boolean;
  onConfirm:     () => void;
  onClose:       () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1,    y: 0 }}
            exit={{ opacity: 0, scale: 0.92,    y: 20 }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-3xl shadow-hero w-full max-w-md p-6">
              <div className="flex items-start gap-4 mb-5">
                <div className={clsx(
                  'w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0',
                  danger ? 'bg-red-100' : 'bg-blue-100'
                )}>
                  <AlertTriangle className={clsx('w-5 h-5', danger ? 'text-red-500' : 'text-blue-500')} />
                </div>
                <div className="flex-1">
                  <h3 className="font-display font-bold text-surface-900 text-lg">{title}</h3>
                  <p className="text-sm text-surface-500 mt-1 leading-relaxed">{desc}</p>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-surface-100 transition-colors">
                  <X className="w-4 h-4 text-surface-400" />
                </button>
              </div>
              <div className="flex gap-3">
                <button onClick={onClose} className="btn-ghost flex-1 text-sm">Cancel</button>
                <button
                  onClick={onConfirm}
                  disabled={loading}
                  className={clsx(
                    'flex-1 flex items-center justify-center gap-2 rounded-xl font-semibold text-sm py-2.5',
                    'transition-all duration-200 active:scale-95',
                    danger
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'btn-primary',
                    loading && 'opacity-60 cursor-not-allowed'
                  )}
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Inline alert ──────────────────────────────────────────────
export function Alert({ type, message }: { type: 'success' | 'error' | 'info'; message: string }) {
  const styles = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error:   'bg-red-50   border-red-200   text-red-800',
    info:    'bg-blue-50  border-blue-200  text-blue-800',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx('flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium', styles[type])}
    >
      <CheckCircle className="w-4 h-4 flex-shrink-0" />
      {message}
    </motion.div>
  );
}

// ── Period Selector ────────────────────────────────────────────
export function PeriodSelector({
  value, onChange,
}: {
  value:    string;
  onChange: (p: string) => void;
}) {
  const options = [
    { value: 'today',   label: 'Today'   },
    { value: 'week',    label: 'Week'    },
    { value: 'month',   label: 'Month'   },
    { value: 'quarter', label: 'Quarter' },
    { value: 'year',    label: 'Year'    },
  ];

  return (
    <div className="flex items-center gap-1 bg-surface-100 rounded-xl p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={clsx(
            'px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200',
            value === opt.value
              ? 'bg-white text-surface-900 shadow-sm'
              : 'text-surface-500 hover:text-surface-700'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
