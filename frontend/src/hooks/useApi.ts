// src/hooks/useApi.ts
// ─────────────────────────────────────────────────────────────
// Live API Hooks — MyLocalBazaar Frontend
// Connected to: process.env.NEXT_PUBLIC_API_URL (set in .env.local)
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  apiGet, apiPost, apiPatch, apiDelete, apiPostForm, getErrorMessage,
} from '@/lib/api';
import type { PaginationMeta } from '@/lib/api';

// ─────────────────────────────────────────────────────────────
// CORE: Generic async hook
// ─────────────────────────────────────────────────────────────
export function useAsync<T>(
  fn: () => Promise<{ data: T; message?: string }>,
  deps: unknown[] = [],
  options: { immediate?: boolean; initialData?: T | null } = {}
) {
  const { immediate = true } = options;
  const [data,    setData]    = useState<T | null>(null);
  const [loading, setLoading] = useState(immediate);
  const [error,   setError]   = useState<string | null>(null);
  const mountedRef = useRef(true);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      if (mountedRef.current) setData(result.data ?? (result as any));
    } catch (err) {
      if (mountedRef.current) setError(getErrorMessage(err));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    if (immediate) execute();
    return () => { mountedRef.current = false; };
  }, [execute, immediate]);

  return { data, loading, error, refetch: execute };
}

// ─────────────────────────────────────────────────────────────
// CORE: Paginated hook
// ─────────────────────────────────────────────────────────────
export function usePaginated<T>(
  endpoint: string,
  params: Record<string, string | number | boolean> = {},
  deps: unknown[] = []
) {
  const [page,  setPage]  = useState(1);
  const [limit] = useState(10);

  const query = new URLSearchParams({
    page: String(page), limit: String(limit),
    ...Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== '' && v !== undefined && v !== null)
        .map(([k, v]) => [k, String(v)])
    ),
  }).toString();

  const { data, loading, error, refetch } = useAsync<any>(
    () => apiGet(`${endpoint}?${query}`),
    [endpoint, query, ...deps]
  );

  return {
    rows:    data?.rows    || data?.data  || [],
    meta:    data?.meta    || {} as PaginationMeta,
    loading, error, refetch,
    page,    setPage,
  };
}

// ═════════════════════════════════════════════════════════════
// CUSTOMER HOOKS
// ═════════════════════════════════════════════════════════════

export const useCustomerHome = () =>
  useAsync(() => apiGet('/mobile/customer/home'), []);

export const useOrders = (params: Record<string, string | number> = {}) =>
  usePaginated('/orders', params, [JSON.stringify(params)]);

export const useOrder = (id: string | null) =>
  useAsync(() => apiGet(`/orders/${id}`), [id], { immediate: !!id });

export const useWallet = () =>
  useAsync(() => apiGet('/wallet'), []);

export const useWalletTransactions = (page = 1) =>
  usePaginated('/wallet/transactions', { page }, [page]);

export const useWishlist = () => {
  const { data, loading, error, refetch } = useAsync<any>(
    () => apiGet('/users/wishlist'), []
  );
  return {
    wishlist:           (data as any)?.products || [],
    loading, error, refetch,
    removeFromWishlist: async (productId: string) => {
      await apiPost(`/users/wishlist/${productId}/remove`);
      refetch();
    },
    addToWishlist: async (productId: string) => {
      await apiPost('/users/wishlist', { product_id: productId });
      refetch();
    },
  };
};

export const useNotifications = (page = 1) =>
  usePaginated('/notifications', { page }, [page]);

export const useUnreadCount = () =>
  useAsync<{ count: number }>(() => apiGet('/notifications/unread-count'), []);

export const useCoupons = (merchantId?: string) =>
  useAsync<{ coupons: any[] }>(
    () => apiGet(`/coupons${merchantId ? `?merchant_id=${merchantId}` : ''}`),
    [merchantId]
  );

export const useRecommendations = (context = 'home') =>
  useAsync(() => apiGet(`/ai/recommendations?context=${context}`), [context]);

export const useSimilarProducts = (productId: string | null) =>
  useAsync(() => apiGet(`/ai/recommendations/similar/${productId}`),
    [productId], { immediate: !!productId });

export const useTrending = (pincode?: string) =>
  useAsync(
    () => apiGet(`/ai/recommendations/trending${pincode ? `?pincode=${pincode}` : ''}`),
    [pincode]
  );

// ═════════════════════════════════════════════════════════════
// CART HOOKS
// ═════════════════════════════════════════════════════════════

export const useCart = () =>
  useAsync(() => apiGet('/cart'), []);

// ── Cart mutations ────────────────────────────────────────────
export const addToCart = (productId: string, quantity: number, variantId?: string) =>
  apiPost('/cart/items', { product_id: productId, quantity, variant_id: variantId });

export const updateCartItem = (cartItemId: string, quantity: number) =>
  apiPatch(`/cart/items/${cartItemId}`, { quantity });

export const removeCartItem = (cartItemId: string) =>
  apiDelete(`/cart/items/${cartItemId}`);

export const clearCart = () =>
  apiDelete('/cart');

export const previewCoupon = (code: string) =>
  apiPost('/cart/coupon', { coupon_code: code });

export const getDeliveryEstimate = (addressId: string) =>
  apiGet(`/cart/delivery-charge?address_id=${addressId}`);

// ── Order mutations ───────────────────────────────────────────
export const placeOrder = (payload: {
  address_id:     string;
  payment_method: 'razorpay' | 'upi' | 'wallet' | 'cod';
  coupon_code?:   string;
  notes?:         string;
  use_wallet?:    boolean;
}) => apiPost('/orders', payload);

export const verifyPayment = (payload: {
  order_id:            string;
  razorpay_order_id:   string;
  razorpay_payment_id: string;
  razorpay_signature:  string;
}) => apiPost('/orders/verify', payload);

export const raiseReturn = (orderId: string, reason: string, items: any[]) =>
  apiPost(`/orders/${orderId}/return`, { reason, return_items: items });

export const cancelOrder = (orderId: string, reason?: string) =>
  apiPost(`/orders/${orderId}/cancel`, { reason });

export const topUpWallet = (amount: number) =>
  apiPost('/wallet/topup', { amount });

export const validateCoupon = (code: string, merchantId: string, subtotal: number) =>
  apiPost('/coupons/validate', { code, merchant_id: merchantId, subtotal });

export const markNotificationRead    = (id: string) => apiPatch(`/notifications/${id}/read`);
export const markAllNotificationsRead = ()           => apiPatch('/notifications/read-all');
export const submitReview = (payload: any)           => apiPost('/reviews', payload);

// ═════════════════════════════════════════════════════════════
// MERCHANT HOOKS
// ═════════════════════════════════════════════════════════════

export const useMerchantHome = () =>
  useAsync(() => apiGet('/mobile/merchant/dashboard'), []);

export const useMerchantOverview = (period = 'month') =>
  useAsync(() => apiGet(`/merchant/dashboard/overview?period=${period}`), [period]);

export const useRevenueTrend = (period = 'month') =>
  useAsync(() => apiGet(`/merchant/dashboard/revenue-trend?period=${period}`), [period]);

export const useTopProducts = (period = 'month', limit = 5) =>
  useAsync(
    () => apiGet(`/merchant/dashboard/top-products?period=${period}&limit=${limit}`),
    [period, limit]
  );

export const useLowStock = () =>
  useAsync(() => apiGet('/merchant/dashboard/low-stock'), []);

export const usePendingOrders = () =>
  useAsync(() => apiGet('/merchant/orders/pending'), []);

export const useMerchantOrders = (params: Record<string, string | number> = {}) =>
  usePaginated('/merchant/orders', params, [JSON.stringify(params)]);

export const useMerchantProducts = (params: Record<string, string | number> = {}) =>
  usePaginated('/merchant/products', params, [JSON.stringify(params)]);

export const useMerchantPlan = () =>
  useAsync(() => apiGet('/saas/my-plan'), []);

export const useAllPlans = () =>
  useAsync(() => apiGet('/saas/plans'), []);

export const useKYCStatus = () =>
  useAsync(() => apiGet('/auth/merchant/kyc/status'), []);

// ── Merchant mutations ────────────────────────────────────────
export const approveOrder = (orderId: string, estimatedMinutes?: number) =>
  apiPost(`/merchant/orders/${orderId}/action`, {
    action: 'approve',
    estimated_delivery_minutes: estimatedMinutes,
  });

export const rejectOrder = (orderId: string, reason: string) =>
  apiPost(`/merchant/orders/${orderId}/action`, {
    action: 'reject', rejection_reason: reason,
  });

export const updateOrderStatus = (
  orderId: string,
  status: 'accepted' | 'packed' | 'out_for_delivery' | 'delivered',
  note?: string
) => apiPatch(`/merchant/orders/${orderId}/status`, { status, note });

export const createProduct    = (data: Record<string, unknown>) => apiPost('/merchant/products', data);
export const updateProduct    = (id: string, data: Record<string, unknown>) => apiPatch(`/merchant/products/${id}`, data);
export const updateStock      = (id: string, stock: number) => apiPatch(`/merchant/products/${id}/stock`, { stock_quantity: stock });
export const archiveProduct   = (id: string) => apiPatch(`/merchant/products/${id}`, { product_status: 'archived' });
export const toggleStoreOpen  = ()             => apiPatch('/mobile/merchant/toggle-open');
export const updateStoreSettings = (data: any) => apiPatch('/merchant/settings', data);
export const checkFeature = (f: 'add_product' | 'ads' | 'analytics' | 'whatsapp') =>
  apiGet(`/saas/feature-check/${f}`);

export const uploadProductImage = (productId: string, file: File) => {
  const form = new FormData();
  form.append('image', file);
  form.append('is_primary', 'false');
  return apiPostForm(`/merchant/products/${productId}/images`, form);
};

// ═════════════════════════════════════════════════════════════
// PUBLIC / SHARED HOOKS
// ═════════════════════════════════════════════════════════════

export const useAreaSearch = (query: string) =>
  useAsync(
    () => /^\d{6}$/.test(query)
      ? apiGet(`/areas/pincode/${query}`)
      : apiGet(`/areas/search?q=${encodeURIComponent(query)}&limit=6`),
    [query],
    { immediate: query.length >= 3 }
  );

export const useCategories = () =>
  useAsync(() => apiGet('/categories'), []);

export const useMerchantsByPincode = (pincode: string, sortBy = 'rating') =>
  useAsync(
    () => apiGet(`/merchants/by-pincode/${pincode}?sort_by=${sortBy}&limit=12`),
    [pincode, sortBy],
    { immediate: pincode.length === 6 }
  );

export const useProductReviews = (productId: string) =>
  usePaginated(`/reviews/product/${productId}`, {}, [productId]);

export const useAppConfig = () =>
  useAsync(() => apiGet('/mobile/app-config'), []);
