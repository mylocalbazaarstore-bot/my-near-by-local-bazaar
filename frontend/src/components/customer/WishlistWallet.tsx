// src/components/customer/WishlistPanel.tsx
// ─────────────────────────────────────────────────────────────
// Customer Wishlist — MyLocalBazaar
// Grid of saved products with add-to-cart + remove actions
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, ShoppingCart, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useWishlist } from '@/hooks/useDashboard';
import { EmptyState } from '@/components/ui/DashboardPrimitives';
import { apiPost, getErrorMessage } from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import type { WishlistProduct, WalletTransaction } from '@/types';

function WishlistCard({ product, onRemove }: { product: WishlistProduct; onRemove: () => void }) {
  const [adding, setAdding]   = useState(false);
  const { incrementCart }     = useAuthStore();

  const addToCart = async () => {
    setAdding(true);
    try {
      // Honor MOQ: minimum quantity = product.moq (floor at 1)
      const qty = Math.max(Number(product.moq) || 1, 1);
      await apiPost('/cart/items', { product_id: product.id, quantity: qty });
      incrementCart();
      toast.success(`${product.name} added to cart (min ${qty})`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  const discount = product.mrp > product.retail_price
    ? Math.round(((product.mrp - product.retail_price) / product.mrp) * 100)
    : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="card group relative overflow-visible"
    >
      {/* Remove button */}
      <button
        onClick={onRemove}
        className="absolute -top-2 -right-2 z-10 w-7 h-7 rounded-full bg-white shadow-card
                   flex items-center justify-center
                   opacity-0 group-hover:opacity-100 transition-opacity
                   hover:bg-red-50 border border-surface-200"
      >
        <Trash2 className="w-3.5 h-3.5 text-red-400" />
      </button>

      {/* Product image */}
      <Link href={`/products/${product.slug}`}>
        <div className="relative aspect-square overflow-hidden rounded-t-2xl bg-surface-50">
          {product.primary_image ? (
            <Image
              src={product.primary_image}
              alt={product.name}
              fill className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl">🛍️</div>
          )}
          {discount > 0 && (
            <div className="absolute top-2 left-2">
              <span className="badge bg-red-500 text-white text-[10px]">{discount}% OFF</span>
            </div>
          )}
        </div>
      </Link>

      <div className="p-3">
        {/* Store */}
        <p className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">
          {product.merchant?.store_name || 'Local Store'}
        </p>

        {/* Name */}
        <Link href={`/products/${product.slug}`}>
          <h3 className="text-sm font-bold text-surface-900 line-clamp-2 leading-tight mb-2
                         hover:text-brand-green transition-colors">
            {product.name}
          </h3>
        </Link>

        {/* Price */}
        <div className="flex items-center gap-2 mb-3">
          <span className="font-bold text-base text-surface-900">
            ₹{Number(product.retail_price).toFixed(0)}
          </span>
          {discount > 0 && (
            <span className="text-xs text-surface-400 line-through">
              ₹{Number(product.mrp).toFixed(0)}
            </span>
          )}
        </div>

        {/* Add to cart */}
        <button
          onClick={addToCart}
          disabled={adding || product.stock_quantity === 0}
          className={clsx(
            'w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold',
            'transition-all duration-200',
            product.stock_quantity === 0
              ? 'bg-surface-100 text-surface-400 cursor-not-allowed'
              : 'bg-brand-green/10 text-brand-green hover:bg-brand-green hover:text-white'
          )}
        >
          <ShoppingCart className="w-4 h-4" />
          {product.stock_quantity === 0 ? 'Out of Stock' : adding ? 'Adding…' : 'Add to Cart'}
        </button>
      </div>
    </motion.div>
  );
}

export function WishlistPanel() {
  const { wishlist, loading, removeFromWishlist } = useWishlist();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-heading text-xl flex items-center gap-2">
            <Heart className="w-6 h-6 text-red-400 fill-red-400" /> Wishlist
          </h2>
          <p className="text-xs text-surface-500 mt-0.5">{wishlist.length} saved items</p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card">
              <div className="skeleton aspect-square rounded-t-2xl" />
              <div className="p-3 space-y-2">
                <div className="skeleton h-3 w-2/3 rounded" />
                <div className="skeleton h-4 w-full rounded" />
                <div className="skeleton h-8 w-full rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      ) : wishlist.length === 0 ? (
        <EmptyState
          icon="💝"
          title="Your wishlist is empty"
          desc="Save products you love by tapping the heart icon on any product page."
          action={{ label: 'Discover Products', href: '/categories' }}
        />
      ) : (
        <AnimatePresence mode="popLayout">
          <motion.div
            layout
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
          >
            {wishlist.map((product) => (
              <WishlistCard
                key={product.id}
                product={product}
                onRemove={() => removeFromWishlist(product.id)}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// src/components/customer/WalletPanel.tsx
// Customer Wallet — balance, transaction history, referral
// ─────────────────────────────────────────────────────────────

import { useWalletData } from '@/hooks/useDashboard';
import { StatCard } from '@/components/ui/DashboardPrimitives';
import { Wallet, ArrowUpRight, ArrowDownLeft, Gift, Copy } from 'lucide-react';
import { useAuthStore as useAuth } from '@/store/authStore';
import dayjs from 'dayjs';

function TransactionRow({ tx }: { tx: WalletTransaction }) {
  const isCredit = tx.transaction_type === 'credit';

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 py-3 border-b border-surface-100 last:border-0"
    >
      <div className={clsx(
        'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
        isCredit ? 'bg-green-100' : 'bg-red-50'
      )}>
        {isCredit
          ? <ArrowDownLeft className="w-4 h-4 text-green-600" />
          : <ArrowUpRight  className="w-4 h-4 text-red-500" />
        }
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-surface-900 truncate">
          {tx.description || (isCredit ? 'Wallet credit' : 'Wallet debit')}
        </p>
        <p className="text-[11px] text-surface-400">
          {dayjs(tx.created_at).fromNow()}
        </p>
      </div>

      <div className="text-right flex-shrink-0">
        <p className={clsx(
          'text-sm font-bold',
          isCredit ? 'text-green-600' : 'text-red-500'
        )}>
          {isCredit ? '+' : '-'}₹{Number(tx.amount || 0).toFixed(2)}
        </p>
      </div>
    </motion.div>
  );
}

export function WalletPanel() {
  const { wallet, transactions, loading } = useWalletData();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const copyReferral = () => {
    if (user?.referral_code) {
      navigator.clipboard.writeText(user.referral_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Referral code copied!');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="section-heading text-xl flex items-center gap-2">
          <Wallet className="w-6 h-6 text-brand-green" /> Wallet & Payments
        </h2>
        <p className="text-xs text-surface-500 mt-0.5">Your MyLocalBazaar wallet and transaction history</p>
      </div>

      {/* Wallet balance card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl overflow-hidden relative"
        style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)' }}
      >
        {/* Glow */}
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-brand-green/15 blur-3xl translate-x-1/4 -translate-y-1/4" />

        <div className="relative z-10 p-6">
          <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-1">Wallet Balance</p>
          {loading ? (
            <div className="skeleton h-10 w-36 rounded mb-1 bg-white/10" />
          ) : (
            <p className="font-display text-4xl font-extrabold text-white mb-1">
              ₹{Number(wallet?.balance || user?.wallet_balance || 0).toFixed(2)}
            </p>
          )}
          <p className="text-white/40 text-xs">Available for checkout</p>

          {/* Stats row */}
          {wallet && !loading && (
            <div className="flex gap-6 mt-5 pt-5 border-t border-white/10">
              <div>
                <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider">Total Earned</p>
                <p className="text-white font-bold text-base">₹{Number(wallet.total_credited || 0).toFixed(0)}</p>
              </div>
              <div>
                <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider">Total Spent</p>
                <p className="text-white font-bold text-base">₹{Number(wallet.total_debited || 0).toFixed(0)}</p>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Referral card */}
      {user?.referral_code && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card p-5 border-2 border-dashed border-brand-green/30 bg-green-50/50"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-green/15 flex items-center justify-center flex-shrink-0">
              <Gift className="w-5 h-5 text-brand-green" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-surface-900">Refer & Earn</p>
              <p className="text-xs text-surface-500">Share your code. Earn wallet credits.</p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 bg-white border border-surface-200 rounded-xl p-2">
            <span className="flex-1 font-mono font-black text-lg text-surface-900 tracking-widest pl-2">
              {user.referral_code}
            </span>
            <button
              onClick={copyReferral}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all',
                copied
                  ? 'bg-brand-green text-white'
                  : 'bg-surface-100 text-surface-700 hover:bg-surface-200'
              )}
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </motion.div>
      )}

      {/* Transaction history */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-surface-100">
          <h3 className="font-bold text-surface-900 text-base">Transaction History</h3>
          <span className="text-xs text-surface-400">{transactions.length} transactions</span>
        </div>

        <div className="px-4">
          {loading ? (
            <div className="py-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3 items-center">
                  <div className="skeleton w-9 h-9 rounded-xl" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-3.5 w-1/2 rounded" />
                    <div className="skeleton h-3 w-1/3 rounded" />
                  </div>
                  <div className="skeleton h-4 w-16 rounded" />
                </div>
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-8 text-center">
              <span className="text-3xl mb-2 block">🧾</span>
              <p className="text-sm text-surface-500">No transactions yet</p>
            </div>
          ) : (
            <div>
              {transactions.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
