export interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  color_code?: string | null;
  sort_order?: number;
}

export interface AppointmentProvider {
  id: string;
  merchant_id: string;
  service_category: string;
  staff_name?: string | null;
  specialization?: string | null;
  experience_years?: number | null;
  qualification?: string | null;
  profile_image_url?: string | null;
  is_available: boolean;
  rating?: number;
  total_reviews?: number;
  store_name?: string;
  store_slug?: string;
  service_count?: number;
}

export interface AppointmentService {
  id: string;
  merchant_id: string;
  provider_id?: string | null;
  category_id?: string | null;
  name: string;
  description?: string | null;
  duration_minutes: number;
  price: number | string;
  discount_price?: number | string | null;
  final_price?: number | string;
  image_url?: string | null;
  is_home_visit: boolean;
  is_active: boolean;
  store_name?: string;
  store_slug?: string;
  merchant_rating?: number;
  provider_name?: string | null;
  provider_specialization?: string | null;
  service_category?: string;
  category_slug?: string;
  category_name?: string;
}

export interface AppointmentSlot {
  id: string;
  provider_id: string;
  service_id?: string | null;
  slot_date: string;
  start_time: string;
  end_time: string;
  is_booked: boolean;
  is_blocked: boolean;
  is_active?: boolean;
  has_active_booking?: boolean;
  has_any_booking?: boolean;
  is_available: boolean;
}

export interface Booking {
  id: string;
  booking_number: string;
  customer_id: string;
  customer_name: string;
  customer_mobile: string;
  customer_email?: string | null;
  merchant_id: string;
  service_id: string;
  provider_id: string;
  slot_id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  address_text?: string | null;
  notes?: string | null;
  final_price: number | string;
  payment_status: string;
  payment_method: string;
  status: string;
  service_name: string;
  provider_name?: string | null;
  store_name: string;
  category_slug?: string;
  created_at: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message: string;
  meta?: PaginationMeta;
}
