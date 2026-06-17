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

// ── Merchant Storefront ───────────────────────────────────────
export interface MerchantOperatingHour {
  day_of_week: number;   // 0 = Sunday … 6 = Saturday
  open_time:   string;   // "09:00:00"
  close_time:  string;   // "21:00:00"
  is_closed:   boolean;
}

export interface MerchantDetail {
  id:                 string;
  store_name:         string;
  store_slug:         string;
  store_category:     string;
  store_description?: string;
  store_logo_url?:    string;
  store_banner_url?:  string;
  address_line1?:     string;
  address_line2?:     string;
  landmark?:          string;
  address:            string;
  area_name?:         string;
  pincode:            string;
  city_name?:         string;
  state?:             string;
  latitude:           number;
  longitude:          number;
  delivery_radius_km: number;
  min_order_value:    number;
  is_open:            boolean;
  merchant_status:    string;
  accepts_cod:        boolean;
  emergency_booking:  boolean;
  is_featured:        boolean;
  rating:             number;
  total_reviews:      number;
  active_products:    number;
  created_at:         string;
  opening_hours:      MerchantOperatingHour[];
}

// ── Merchant-scoped Product (storefront listing) ────────────────
export interface MerchantProduct {
  id:                  string;
  name:                string;
  slug:                string;
  short_description?:  string;
  mrp:                 number;
  retail_price:        number;
  wholesale_price?:    number;
  moq:                 number;
  stock_quantity:      number;
  unit:                string;
  brand?:              string;
  gst_percentage:      number;
  is_featured:         boolean;
  is_returnable:       boolean;
  return_window_days?: number;
  tags?:               string[];
  merchant_id:         string;
  store_name:          string;
  store_slug:          string;
  merchant_rating:     number;
  delivery_radius_km:  number;
  min_order_value:     number;
  is_open:             boolean;
  accepts_cod:         boolean;
  primary_image?:      string;
  variant_count:       number;
  category_name?:      string;
  category_slug?:      string;
}

// ── Merchant Review ──────────────────────────────────────────
export interface MerchantReview {
  id:            string;
  rating:        number;
  title?:        string;
  body?:         string;
  is_verified:   boolean;
  created_at:    string;
  reviewer_name: string;
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

// ── Wishlist ──────────────────────────────────────────────────
export interface WishlistProduct {
  id:             string;
  name:           string;
  slug:           string;
  mrp:            number;
  retail_price:   number;
  stock_quantity: number;
  moq:            number;
  primary_image?: string;
  merchant: {
    id:         string;
    store_name: string;
    store_slug: string;
  };
}

// ── Wallet ────────────────────────────────────────────────────
export interface WalletTransaction {
  id:               string;
  transaction_type: 'credit' | 'debit';
  amount:           number;
  closing_balance:  number;
  reference_type?:  string;
  reference_id?:    string;
  description?:     string;
  created_at:       string;
}

export interface Wallet {
  balance:              number;
  locked_balance:       number;
  total_credited:       number;
  total_debited:        number;
  recent_transactions?: WalletTransaction[];
}

// ── Customer Profile ────────────────────────────────────────────
export interface CustomerProfile {
  id:             string;
  full_name:      string;
  email?:         string;
  phone:          string;
  gender?:        'male' | 'female' | 'other' | 'prefer_not_to_say';
  date_of_birth?: string;
  referral_code:  string;
  wallet_balance: number;
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

// The 16 categories with full UI config — used by CategoryGrid
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
    slug: 'doctor-booking', label: 'Doctor Appointment', emoji: '👨‍⚕️',
    color: 'bg-doctor', textColor: 'text-doctor', accent: 'bg-cyan-700',
    bgLight: 'bg-cyan-50',
    gradient: 'linear-gradient(135deg, #06B6D4 0%, #0284C7 100%)',
    iconBg: 'bg-cyan-100',
  },
  {
    slug: 'mens-salon', label: "Men's Salon Appointment", emoji: '💈',
    color: 'bg-mens_salon', textColor: 'text-mens_salon', accent: 'bg-slate-400',
    bgLight: 'bg-blue-50',
    gradient: 'linear-gradient(135deg, #1E3A8A 0%, #475569 100%)',
    iconBg: 'bg-blue-100',
  },
  {
    slug: 'womens-salon', label: "Women's Salon Appointment", emoji: '💅',
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
  {
    slug: 'jewellery', label: 'Jewellery Store', emoji: '💍',
    color: 'bg-amber-500', textColor: 'text-amber-600', accent: 'bg-amber-600',
    bgLight: 'bg-amber-50',
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    iconBg: 'bg-amber-100',
  },
  {
    slug: 'restaurant', label: 'Restaurant', emoji: '🍽️',
    color: 'bg-orange-700', textColor: 'text-orange-700', accent: 'bg-red-700',
    bgLight: 'bg-orange-50',
    gradient: 'linear-gradient(135deg, #EA580C 0%, #B91C1C 100%)',
    iconBg: 'bg-orange-100',
  },
  {
    slug: 'banquet-hall', label: 'Banquet Hall', emoji: '🏛️',
    color: 'bg-indigo-500', textColor: 'text-indigo-600', accent: 'bg-purple-700',
    bgLight: 'bg-indigo-50',
    gradient: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
    iconBg: 'bg-indigo-100',
  },
  {
    slug: 'furniture', label: 'Furniture Store', emoji: '🪑',
    color: 'bg-amber-800', textColor: 'text-amber-800', accent: 'bg-amber-900',
    bgLight: 'bg-amber-50',
    gradient: 'linear-gradient(135deg, #92400E 0%, #78350F 100%)',
    iconBg: 'bg-amber-100',
  },
];
