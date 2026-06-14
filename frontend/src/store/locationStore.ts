// src/store/locationStore.ts
// ─────────────────────────────────────────────────────────────
// Zustand Location Store — MyLocalBazaar Frontend
// Tracks the customer's selected delivery area/pincode/coords
// Persists to localStorage so HeroSection, FeaturedMerchants, and
// NearbyMerchants all read the same hyperlocal context.
// ─────────────────────────────────────────────────────────────

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface LocationState {
  areaId:   string | null;
  areaName: string | null;
  pincode:  string | null;
  lat:      number | null;
  lng:      number | null;

  setLocation: (loc: Omit<LocationState, 'setLocation' | 'clearLocation'>) => void;
  clearLocation: () => void;
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      areaId:   null,
      areaName: null,
      pincode:  null,
      lat:      null,
      lng:      null,

      setLocation: (loc) => set(loc),
      clearLocation: () => set({ areaId: null, areaName: null, pincode: null, lat: null, lng: null }),
    }),
    {
      name:    'mlb_location',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
