// src/store/authStore.ts
// ─────────────────────────────────────────────────────────────
// Zustand Auth Store — MyLocalBazaar Frontend
// Manages: user/merchant session | tokens | cart count | wallet
// ─────────────────────────────────────────────────────────────

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@/types';

interface AuthState {
  user:          User | null;
  role:          'customer' | 'merchant' | 'admin' | null;
  accessToken:   string | null;
  refreshToken:  string | null;
  cartCount:     number;
  isHydrated:    boolean;

  // Actions
  setUser:       (user: User, role: 'customer' | 'merchant' | 'admin') => void;
  setTokens:     (access: string, refresh: string) => void;
  updateWallet:  (balance: number) => void;
  setCartCount:  (n: number) => void;
  incrementCart: () => void;
  decrementCart: () => void;
  logout:        () => void;
  setHydrated:   () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user:         null,
      role:         null,
      accessToken:  null,
      refreshToken: null,
      cartCount:    0,
      isHydrated:   false,

      setUser:  (user, role) => set({ user, role }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      updateWallet: (balance) =>
        set((s) => ({ user: s.user ? { ...s.user, wallet_balance: balance } : null })),
      setCartCount:  (cartCount) => set({ cartCount }),
      incrementCart: () => set((s) => ({ cartCount: s.cartCount + 1 })),
      decrementCart: () => set((s) => ({ cartCount: Math.max(0, s.cartCount - 1) })),
      setHydrated:   () => set({ isHydrated: true }),
      logout: () => {
        localStorage.removeItem('mlb_access_token');
        localStorage.removeItem('mlb_refresh_token');
        set({ user: null, role: null, accessToken: null, refreshToken: null, cartCount: 0 });
      },
    }),
    {
      name:    'mlb-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        user:         s.user,
        role:         s.role,
        accessToken:  s.accessToken,
        refreshToken: s.refreshToken,
        cartCount:    s.cartCount,
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    }
  )
);
