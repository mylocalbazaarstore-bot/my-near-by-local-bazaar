// src/types/index.ts
// ─────────────────────────────────────────────────────────────
// Shared TypeScript Types — MyLocalBazaar Frontend
// ─────────────────────────────────────────────────────────────

// ── Auth ──────────────────────────────────────────────────────
export interface User {
  id:               string;
  full_name:        string;
  phone:            string;
  email?:           string;
  wallet_balance:   number;
  referral_code:    string;
  profile_image_url?: string;
  is_phone_verified: boolean;
  is_new_user?:     boolean;
}

export interface Tokens {
  access_token:  string;
  refresh_token: string;
  token_type:    string;
}

// ── Area / Location ───────────────────────────────────────────
export interface Area {
  id:        string;
  name:      string;
  pincode:   string;
  latitude:  number;
  longitude: number;
  city_name: string;
  state:     string;
}

// ── Categories ────────────────────────────────────────────────
export interface Category {
  id:                   string;
  name:                 string;
  slug:                 string;
  description?:         string;
  image_url?:           string;
  icon_url?:            string;
  theme_color:          string;
  store_category:       string;
  sort_order:           number;
  active_product_count: number;
  active_merchant_count: number;
  subcategories?:       Subcategory[];
}

export interface Subcategory {
  id:         string;
  name:       string;
  slug:       string;
  image_url?: string;
}

// ── Merchants ─────────────────────────────────────────────────
export interface Merchant {
  id:                string;
  store_name:        string;
  store_slug:        string;
  store_category:    string;
  store_logo_url?:   string;
  store_banner_url?: string;
  store_description?: string;
  rating:            number;
  total_reviews:     number;
  delivery_radius_km: number;
  min_order_value:   number;
  is_open:           boolean;
  accepts_cod:       boolean;
  emergency_booking: boolean;
  is_featured:       boolean;
  pincode:           string;
  distance_km?:      number;
  active_products?:  number;
}

// ── Products ──────────────────────────────────────────────────
export interface Product {
  id:                string;
  name:              string;
  slug:              string;
  mrp:               number;
  retail_price:      number;
  wholesale_price?:  number;
  stock_quantity:    number;
  unit:              string;
  brand?:            string;
  primary_image?:    string;
  images?:           ProductImage[];
  gst_percentage:    number;
  is_featured:       boolean;
  is_returnable:     boolean;
  moq:               number;
  merchant_id:       string;
  merchant?:         Partial<Merchant>;
  category_name?:    string;
  variant_count?:    number;
}

export interface ProductImage {
  id:         string;
  image_url:  string;
  alt_text?:  string;
  is_primary: boolean;
  sort_order: number;
}

// ── Cart ──────────────────────────────────────────────────────
export interface CartItem {
  cart_item_id: string;
  product_id:   string;
  name:         string;
  image?:       string;
  unit_price:   number;
  quantity:     number;
  line_total:   number;
  moq:          number;
  variant_id?:  string;
  variant_name?: string;
  merchant_id:  string;
  store_name:   string;
}

export interface Cart {
  cart_id:    string;
  merchant_id?: string;
  items:      CartItem[];
  item_count: number;
  totals: {
    subtotal:        number;
    gst:             number;
    delivery_charge: number;
    total:           number;
  };
  validation: {
    is_valid:       boolean;
    below_min_order: boolean;
    min_order_value: number;
    warnings:        ValidationWarning[];
  };
  merchant?: Partial<Merchant>;
}

export interface ValidationWarning {
  type:      string;
  message:   string;
  available?: number;
  moq?:      number;
}

// ── Pagination ────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  data:       T[];
  meta: {
    total:      number;
    page:       number;
    limit:      number;
    totalPages: number;
    hasNext:    boolean;
    hasPrev:    boolean;
  };
}

// ── Category UI Data (client-side static) ──────────────────────
export interface CategoryUIConfig {
  slug:       string;
  label:      string;
  emoji:      string;
  color:      string;       // Tailwind bg class
  textColor:  string;       // Tailwind text class
  accent:     string;       // Tailwind accent class
  bgLight:    string;       // light bg for card
  gradient:   string;       // CSS gradient string
  iconBg:     string;
}

// The 13 categories with full UI config — used by CategoryGrid
export const CATEGORIES: CategoryUIConfig[] = [
  {
    slug: 'grocery-fmcg', label: 'Grocery & FMCG', emoji: '🛒',
    color: 'bg-grocery', textColor: 'text-grocery', accent: 'bg-grocery-accent',
    bgLight: 'bg-grocery-bg',
    gradient: 'linear-gradient(135deg, #22C55E 0%, #F97316 100%)',
    iconBg: 'bg-green-100',
  },
  {
    slug: 'wholesale', label: 'Wholesale Market', emoji: '🏭',
    color: 'bg-wholesale', textColor: 'text-wholesale', accent: 'bg-orange-600',
    bgLight: 'bg-orange-50',
    gradient: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
    iconBg: 'bg-orange-100',
  },
  {
    slug: 'electronics', label: 'Electronics', emoji: '📱',
    color: 'bg-electronics', textColor: 'text-electronics', accent: 'bg-blue-700',
    bgLight: 'bg-blue-50',
    gradient: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
    iconBg: 'bg-blue-100',
  },
  {
    slug: 'hardware', label: 'Hardware', emoji: '🔧',
    color: 'bg-hardware', textColor: 'text-hardware', accent: 'bg-stone-600',
    bgLight: 'bg-stone-50',
    gradient: 'linear-gradient(135deg, #78716C 0%, #57534E 100%)',
    iconBg: 'bg-stone-100',
  },
  {
    slug: 'clothing', label: 'Clothing & Fashion', emoji: '👗',
    color: 'bg-clothing', textColor: 'text-clothing', accent: 'bg-pink-600',
    bgLight: 'bg-pink-50',
    gradient: 'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)',
    iconBg: 'bg-pink-100',
  },
  {
    slug: 'medical', label: 'Medical Store', emoji: '💊',
    color: 'bg-medical', textColor: 'text-medical', accent: 'bg-blue-500',
    bgLight: 'bg-red-50',
    gradient: 'linear-gradient(135deg, #EF4444 0%, #3B82F6 100%)',
    iconBg: 'bg-red-100',
  },
  {
    slug: 'doctor-booking', label: 'Doctor Booking', emoji: '👨‍⚕️',
    color: 'bg-doctor', textColor: 'text-doctor', accent: 'bg-cyan-700',
    bgLight: 'bg-cyan-50',
    gradient: 'linear-gradient(135deg, #06B6D4 0%, #0284C7 100%)',
    iconBg: 'bg-cyan-100',
  },
  {
    slug: 'mens-salon', label: "Men's Salon", emoji: '💈',
    color: 'bg-mens_salon', textColor: 'text-mens_salon', accent: 'bg-slate-400',
    bgLight: 'bg-blue-50',
    gradient: 'linear-gradient(135deg, #1E3A8A 0%, #475569 100%)',
    iconBg: 'bg-blue-100',
  },
  {
    slug: 'womens-salon', label: "Women's Salon", emoji: '💅',
    color: 'bg-womens_salon', textColor: 'text-pink-400', accent: 'bg-yellow-400',
    bgLight: 'bg-pink-50',
    gradient: 'linear-gradient(135deg, #F9A8D4 0%, #FBBF24 100%)',
    iconBg: 'bg-pink-100',
  },
  {
    slug: 'home-services', label: 'Home Services', emoji: '🔨',
    color: 'bg-home_services', textColor: 'text-home_services', accent: 'bg-blue-500',
    bgLight: 'bg-yellow-50',
    gradient: 'linear-gradient(135deg, #EAB308 0%, #3B82F6 100%)',
    iconBg: 'bg-yellow-100',
  },
  {
    slug: 'tea-stall', label: 'Tea Stall', emoji: '☕',
    color: 'bg-tea_stall', textColor: 'text-orange-500', accent: 'bg-red-500',
    bgLight: 'bg-orange-50',
    gradient: 'linear-gradient(135deg, #F97316 0%, #DC2626 100%)',
    iconBg: 'bg-orange-100',
  },
  {
    slug: 'chaat-chinese', label: 'Chaat & Chinese', emoji: '🍜',
    color: 'bg-food', textColor: 'text-food', accent: 'bg-orange-500',
    bgLight: 'bg-red-50',
    gradient: 'linear-gradient(135deg, #DC2626 0%, #F97316 100%)',
    iconBg: 'bg-red-100',
  },
  {
    slug: 'specialty', label: 'Specialty Stores', emoji: '⭐',
    color: 'bg-specialty', textColor: 'text-specialty', accent: 'bg-violet-700',
    bgLight: 'bg-purple-50',
    gradient: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
    iconBg: 'bg-purple-100',
  },
];
