import { api } from '@/lib/api';
import type {
  ApiEnvelope,
  AppointmentProvider,
  AppointmentService,
  AppointmentSlot,
  Booking,
  ServiceCategory,
} from '@/types/appointment';

export interface BookingPayload {
  service_id: string;
  provider_id?: string;
  slot_id: string;
  customer_name: string;
  customer_mobile: string;
  customer_email?: string;
  address_text?: string;
  notes?: string;
  payment_method: 'none' | 'pay_at_shop' | 'online' | 'cash' | 'upi' | 'card';
}

export interface SlotPayload {
  provider_id: string;
  service_id?: string | null;
  slot_date: string;
  start_time: string;
  end_time: string;
  is_blocked?: boolean;
}

export interface ProviderPayload {
  service_category: 'doctor' | 'doctor-booking' | 'mens_salon' | 'mens-salon' | 'womens_salon' | 'womens-salon' | 'home_services' | 'home-services';
  staff_name?: string | null;
  specialization?: string | null;
  experience_years?: number | null;
  qualification?: string | null;
  profile_image_url?: string | null;
  is_available: boolean;
}

export interface ServicePayload {
  provider_id?: string | null;
  category_id: string;
  name: string;
  description?: string;
  duration_minutes: number;
  price: number;
  discount_price?: number | null;
  is_home_visit: boolean;
  is_active: boolean;
}

export interface SlotDeleteResult {
  deleted: boolean;
  deactivated: boolean;
  slot?: AppointmentSlot;
}

const cleanParams = (params: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));

export const appointmentApi = {
  getCategories: () =>
    api.get<ApiEnvelope<{ categories: ServiceCategory[] }>>('/services/categories')
      .then((r) => r.data.data.categories),

  listServices: (params: Record<string, unknown> = {}) =>
    api.get<ApiEnvelope<AppointmentService[]>>('/services', { params: cleanParams(params) })
      .then((r) => r.data),

  getService: (id: string) =>
    api.get<ApiEnvelope<{ service: AppointmentService }>>(`/services/${id}`)
      .then((r) => r.data.data.service),

  listProviders: (params: Record<string, unknown> = {}) =>
    api.get<ApiEnvelope<AppointmentProvider[]>>('/service-providers', { params: cleanParams(params) })
      .then((r) => r.data),

  getSlots: (params: { providerId: string; serviceId?: string; date: string }) =>
    api.get<ApiEnvelope<{ slots: AppointmentSlot[] }>>('/slots', { params: cleanParams(params) })
      .then((r) => r.data.data.slots),

  createBooking: (payload: BookingPayload) =>
    api.post<ApiEnvelope<{ booking: Booking }>>('/bookings', payload)
      .then((r) => r.data.data.booking),

  listCustomerBookings: (customerId: string, params: Record<string, unknown> = {}) =>
    api.get<ApiEnvelope<Booking[]>>(`/bookings/customer/${customerId}`, { params: cleanParams(params) })
      .then((r) => r.data),

  listMerchantBookings: (params: Record<string, unknown> = {}) =>
    api.get<ApiEnvelope<Booking[]>>('/bookings/merchant', { params: cleanParams(params) })
      .then((r) => r.data),

  updateBookingStatus: (bookingId: string, status: string, reason?: string) =>
    api.patch<ApiEnvelope<{ booking: Booking }>>(`/bookings/${bookingId}/status`, { status, reason })
      .then((r) => r.data.data.booking),

  createSlot: (payload: SlotPayload) =>
    api.post<ApiEnvelope<{ slot: AppointmentSlot }>>('/slots', payload)
      .then((r) => r.data.data.slot),

  updateSlot: (slotId: string, payload: Partial<SlotPayload>) =>
    api.patch<ApiEnvelope<{ slot: AppointmentSlot }>>(`/slots/${slotId}`, payload)
      .then((r) => r.data.data.slot),

  deleteSlot: (slotId: string) =>
    api.delete<ApiEnvelope<{ result: SlotDeleteResult }>>(`/slots/${slotId}`)
      .then((r) => r.data.data.result),

  createService: (payload: ServicePayload) =>
    api.post<ApiEnvelope<{ service: AppointmentService }>>('/services', payload)
      .then((r) => r.data.data.service),

  createProvider: (payload: ProviderPayload) =>
    api.post<ApiEnvelope<{ provider: AppointmentProvider }>>('/service-providers', payload)
      .then((r) => r.data.data.provider),

  updateProvider: (providerId: string, payload: Partial<ProviderPayload>) =>
    api.patch<ApiEnvelope<{ provider: AppointmentProvider }>>(`/service-providers/${providerId}`, payload)
      .then((r) => r.data.data.provider),
};

export const formatPrice = (value: number | string | null | undefined) => {
  const num = Number(value || 0);
  if (num <= 0) return 'Free';
  return `Rs ${num.toFixed(0)}`;
};

const localDateValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const nextDateOptions = (days = 7) => {
  const base = new Date();
  return Array.from({ length: days }).map((_, index) => {
    const d = new Date(base);
    d.setDate(base.getDate() + index);
    const value = localDateValue(d);
    return {
      value,
      label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
    };
  });
};
