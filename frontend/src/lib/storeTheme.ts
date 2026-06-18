// src/lib/storeTheme.ts
// ─────────────────────────────────────────────────────────────
// Shared Store/Category Theming — MyLocalBazaar Frontend
// Category badge labels/colors + brand gradient color helpers,
// used by FeaturedMerchants, merchant storefront header, etc.
// ─────────────────────────────────────────────────────────────

// ── Category badge colors ──────────────────────────────────────
export const CAT_BADGES: Record<string, { label: string; class: string }> = {
  grocery_fmcg:      { label: 'Grocery',      class: 'bg-green-100 text-green-700' },
  wholesale:         { label: 'Wholesale',     class: 'bg-orange-100 text-orange-700' },
  electronics:       { label: 'Electronics',  class: 'bg-blue-100 text-blue-700' },
  hardware:          { label: 'Hardware',      class: 'bg-stone-100 text-stone-700' },
  clothing:          { label: 'Fashion',       class: 'bg-pink-100 text-pink-700' },
  medical:           { label: 'Medical',       class: 'bg-red-100 text-red-700' },
  service:           { label: 'Service',       class: 'bg-cyan-100 text-cyan-700' },
  food_tea_stall:    { label: 'Food',          class: 'bg-orange-100 text-orange-700' },
  food_chaat_chinese:{ label: 'Street Food',   class: 'bg-red-100 text-red-700' },
  food_restaurant:   { label: 'Restaurant',    class: 'bg-orange-100 text-orange-800' },
  furniture:         { label: 'Furniture',     class: 'bg-amber-100 text-amber-800' },
  specialty:         { label: 'Specialty',     class: 'bg-purple-100 text-purple-700' },
};

// ── Color helpers ──────────────────────────────────────────────
export function getBrandColor(cat: string): string {
  const map: Record<string, string> = {
    grocery_fmcg: '#22C55E', wholesale: '#F97316', electronics: '#3B82F6',
    hardware: '#78716C', clothing: '#EC4899', medical: '#EF4444',
    service: '#06B6D4', food_tea_stall: '#F97316', food_chaat_chinese: '#DC2626',
    food_restaurant: '#EA580C', furniture: '#92400E',
    specialty: '#8B5CF6',
  };
  return map[cat] || '#6B7280';
}

export function getBrandAccent(cat: string): string {
  const map: Record<string, string> = {
    grocery_fmcg: '#F97316', wholesale: '#EA580C', electronics: '#1D4ED8',
    hardware: '#57534E', clothing: '#DB2777', medical: '#3B82F6',
    service: '#0284C7', food_tea_stall: '#DC2626', food_chaat_chinese: '#F97316',
    food_restaurant: '#B91C1C', furniture: '#78350F',
    specialty: '#6D28D9',
  };
  return map[cat] || '#374151';
}
