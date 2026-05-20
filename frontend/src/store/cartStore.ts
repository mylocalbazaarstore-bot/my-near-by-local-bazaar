// src/store/cartStore.ts
// ─────────────────────────────────────────────────────────────
// Zustand Cart Store — MyLocalBazaar Frontend
// Server-backed: all mutations sync to /cart API
// MOQ enforcement: addItem / updateQty clamp to product.moq
// Safe numeric casts: all prices stored via Number()
// ─────────────────────────────────────────────────────────────

import { create } from 'zustand';
import api, { apiGet, apiPost, apiDelete } from '@/lib/api';

// ── Local types (mirrors backend CartService output) ──────────
export interface CartItemLocal {
  cart_item_id: string;
  product_id:   string;
  name:         string;
  image?:       string;
  unit_price:   number;
  quantity:     number;
  line_total:   number;
  moq:          number;
  store_name:   string;
  unit?:        string;
  variant_id?:  string;
  variant_name?: string;
}

export interface CartTotals {
  subtotal:        number;
  gst:             number;
  delivery_charge: number;
  total:           number;
}

interface CartStore {
  items:      CartItemLocal[];
  totals:     CartTotals | null;
  itemCount:  number;
  loading:    boolean;
  drawerOpen: boolean;

  openDrawer:  () => void;
  closeDrawer: () => void;
  fetchCart:   () => Promise<void>;
  addItem:     (productId: string, moq?: number, variantId?: string) => Promise<void>;
  updateQty:   (cartItemId: string, qty: number, moq?: number) => Promise<void>;
  removeItem:  (cartItemId: string) => Promise<void>;
  clearCart:   () => Promise<void>;
}

// ── Normalise raw API cart into local shape ────────────────────
function normalise(raw: any): { items: CartItemLocal[]; totals: CartTotals; itemCount: number } {
  const items: CartItemLocal[] = (raw?.items || []).map((i: any) => ({
    cart_item_id: i.cart_item_id,
    product_id:   i.product_id,
    name:         i.name,
    image:        i.image || undefined,
    unit_price:   Number(i.unit_price),
    quantity:     Number(i.quantity),
    line_total:   Number(i.line_total),
    moq:          Number(i.moq) || 1,
    store_name:   i.store_name || '',
    unit:         i.unit || undefined,
    variant_id:   i.variant_id || undefined,
    variant_name: i.variant_name || undefined,
  }));

  const totals: CartTotals = {
    subtotal:        Number(raw?.totals?.subtotal        ?? 0),
    gst:             Number(raw?.totals?.gst             ?? 0),
    delivery_charge: Number(raw?.totals?.delivery_charge ?? 0),
    total:           Number(raw?.totals?.total           ?? 0),
  };

  return { items, totals, itemCount: items.reduce((acc, i) => acc + i.quantity, 0) };
}

// ═══════════════════════════════════════════════════════════════
// CART STORE
// ═══════════════════════════════════════════════════════════════
export const useCartStore = create<CartStore>((set, get) => ({
  items:      [],
  totals:     null,
  itemCount:  0,
  loading:    false,
  drawerOpen: false,

  openDrawer:  () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),

  fetchCart: async () => {
    set({ loading: true });
    try {
      const res = await apiGet<any>('/cart');
      const raw = (res.data as any)?.cart;
      set({ ...normalise(raw), loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addItem: async (productId, moq = 1, variantId) => {
    // Enforce MOQ: minimum quantity = product.moq (floor at 1)
    const qty = Math.max(Number(moq) || 1, 1);
    await apiPost('/cart/items', {
      product_id: productId,
      quantity:   qty,
      ...(variantId ? { variant_id: variantId } : {}),
    });
    await get().fetchCart();
  },

  updateQty: async (cartItemId, qty, moq = 1) => {
    // Clamp: quantity must be >= moq
    const safeQty = Math.max(Number(qty), Number(moq) || 1);
    await api.put(`/cart/items/${cartItemId}`, { quantity: safeQty });
    await get().fetchCart();
  },

  removeItem: async (cartItemId) => {
    await apiDelete(`/cart/items/${cartItemId}`);
    await get().fetchCart();
  },

  clearCart: async () => {
    await apiDelete('/cart');
    set({ items: [], totals: null, itemCount: 0 });
  },
}));
