// src/hooks/useDashboard.ts
// ─────────────────────────────────────────────────────────────
// Dashboard Data Hooks — MyLocalBazaar Frontend
// React hooks wrapping API calls with loading/error state
// Used by both customer and merchant dashboard components
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPatch, apiDelete, getErrorMessage } from '@/lib/api';
import toast from 'react-hot-toast';
import type { Wallet, WalletTransaction, CustomerProfile, WishlistProduct } from '@/types';

// ── Generic async hook factory ────────────────────────────────
function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data,    setData]    = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      setData(result);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { execute(); }, [execute]);
  return { data, loading, error, refetch: execute };
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMER HOOKS
// ═══════════════════════════════════════════════════════════════

export function useCustomerOrders(params: Record<string, string | number> = {}) {
  const query = new URLSearchParams(params as Record<string, string>).toString();
  return useAsync<any>(
    () => apiGet(`/orders?${query}`),
    [query]
  );
}

export function useOrderDetail(orderId: string) {
  return useAsync<any>(
    () => apiGet(`/orders/${orderId}`),
    [orderId]
  );
}

export function useWishlist() {
  const [wishlist, setWishlist] = useState<WishlistProduct[]>([]);
  const [loading,  setLoading]  = useState(true);

  const fetchWishlist = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<{ products: WishlistProduct[] }>('/wishlist');
      setWishlist(res.data?.products || []);
    } catch {
      setWishlist([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWishlist(); }, [fetchWishlist]);

  const removeFromWishlist = async (productId: string) => {
    try {
      await apiDelete(`/wishlist/${productId}`);
      setWishlist((prev) => prev.filter((p) => p.id !== productId));
      toast.success('Removed from wishlist');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return { wishlist, loading, refetch: fetchWishlist, removeFromWishlist };
}

export function useWalletData() {
  const [wallet,       setWallet]       = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [walletRes, txRes] = await Promise.allSettled([
          apiGet<{ wallet: Wallet }>('/wallet'),
          apiGet<WalletTransaction[]>('/wallet/transactions?limit=20'),
        ]);
        if (walletRes.status === 'fulfilled') setWallet(walletRes.value.data?.wallet ?? null);
        if (txRes.status === 'fulfilled')     setTransactions(txRes.value.data || []);
      } finally { setLoading(false); }
    })();
  }, []);

  return { wallet, transactions, loading };
}

// ── Customer Profile ────────────────────────────────────────────
interface ProfileUpdatePayload {
  full_name?:     string;
  email?:         string;
  gender?:        string;
  date_of_birth?: string;
}

export function useProfile() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<{ user: CustomerProfile }>('/profile');
      setProfile(res.data?.user ?? null);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const updateProfile = async (payload: ProfileUpdatePayload) => {
    const res = await apiPatch<{ user: CustomerProfile }>('/profile', payload);
    setProfile(res.data?.user ?? null);
    return res;
  };

  return { profile, loading, refetch: fetchProfile, updateProfile };
}

// ═══════════════════════════════════════════════════════════════
// MERCHANT HOOKS
// ═══════════════════════════════════════════════════════════════

export function useMerchantDashboard(period: string = 'month') {
  return useAsync<any>(
    () => apiGet(`/merchant/dashboard/overview?period=${period}`),
    [period]
  );
}

export function useMerchantRevenueTrend(period: string = 'month') {
  return useAsync<any>(
    () => apiGet(`/merchant/dashboard/revenue-trend?period=${period}`),
    [period]
  );
}

export function useMerchantProducts(params: Record<string, string | number> = {}) {
  const query = new URLSearchParams(params as Record<string, string>).toString();
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<any>(`/merchant/products?${query}`);
      setData(res);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { fetch(); }, [fetch]);

  const archiveProduct = async (id: string) => {
    await apiDelete(`/merchant/products/${id}`);
    fetch();
  };

  const updateStock = async (id: string, stock: number) => {
    await apiPatch(`/merchant/products/${id}/stock`, { stock_quantity: stock });
    fetch();
  };

  return { data, loading, error, refetch: fetch, archiveProduct, updateStock };
}

export function usePendingOrders() {
  return useAsync<any>(
    () => apiGet('/merchant/dashboard/pending'),
    []
  );
}

export function useMerchantOrders(params: Record<string, string | number> = {}) {
  const query = new URLSearchParams(params as Record<string, string>).toString();
  return useAsync<any>(
    () => apiGet(`/merchant/orders?${query}`),
    [query]
  );
}

export function useTopProducts(period: string = 'month') {
  return useAsync<any>(
    () => apiGet(`/merchant/dashboard/top-products?period=${period}&limit=5`),
    [period]
  );
}

export function useLowStockAlerts() {
  return useAsync<any>(
    () => apiGet('/merchant/dashboard/low-stock'),
    []
  );
}
