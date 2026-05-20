'use client';
// src/components/providers/Providers.tsx

import { ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CartDrawer from '@/components/ui/CartDrawer';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 1, refetchOnWindowFocus: false },
  },
});

function AuthHydrationGuard({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  // Fires once after client-side mount — guaranteed even when localStorage
  // is unavailable (SSR, incognito, storage errors).  Replaces the previous
  // isHydrated gate which could silently stall when onRehydrateStorage fired
  // with state=undefined and the setHydrated() call was swallowed.
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-green to-brand-orange
                          flex items-center justify-center animate-pulse">
            <span className="text-white font-display font-black">M</span>
          </div>
          <p className="text-xs text-surface-400">Loading MyLocalBazaar…</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthHydrationGuard>{children}</AuthHydrationGuard>
      <CartDrawer />
    </QueryClientProvider>
  );
}
