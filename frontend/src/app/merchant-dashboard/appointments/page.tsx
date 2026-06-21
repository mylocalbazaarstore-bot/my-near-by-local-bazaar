'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  Pencil,
  Save,
  Trash2,
  UserPlus,
  XCircle,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import {
  appointmentApi,
  formatPrice,
  nextDateOptions,
  type ProviderPayload,
  type ServicePayload,
  type SlotPayload,
} from '@/lib/appointments';
import { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type {
  AppointmentProvider,
  AppointmentService,
  AppointmentSlot,
  Booking,
  ServiceCategory,
} from '@/types/appointment';
import toast from 'react-hot-toast';

const dateOptions = nextDateOptions(14);

const emptyProvider: ProviderPayload = {
  service_category: 'doctor-booking',
  staff_name: '',
  specialization: '',
  experience_years: null,
  qualification: '',
  profile_image_url: '',
  is_available: true,
};

const emptyService: ServicePayload = {
  category_id: '',
  provider_id: null,
  name: '',
  description: '',
  duration_minutes: 30,
  price: 0,
  discount_price: null,
  is_home_visit: false,
  is_active: true,
};

const emptySlot: SlotPayload = {
  provider_id: '',
  service_id: null,
  slot_date: dateOptions[0].value,
  start_time: '10:00',
  end_time: '10:30',
  is_blocked: false,
};

const timeText = (value?: string | null) => String(value || '').slice(0, 5);

const providerPayload = (form: ProviderPayload): ProviderPayload => ({
  ...form,
  staff_name: form.staff_name?.trim() || null,
  specialization: form.specialization?.trim() || null,
  qualification: form.qualification?.trim() || null,
  profile_image_url: form.profile_image_url?.trim() || null,
  experience_years: form.experience_years === null || form.experience_years === undefined
    ? null
    : Number(form.experience_years),
});

const SERVICE_CATEGORY_BY_SLUG: Record<string, string> = {
  doctor: 'doctor',
  'doctor-booking': 'doctor',
  mens_salon: 'mens_salon',
  'mens-salon': 'mens_salon',
  womens_salon: 'womens_salon',
  'womens-salon': 'womens_salon',
  home_services: 'home_services',
  'home-services': 'home_services',
};

const toServiceCategoryKey = (value?: string | null) =>
  SERVICE_CATEGORY_BY_SLUG[String(value || '').trim()] || String(value || '').trim();

const providerMatchesCategory = (provider: AppointmentProvider | undefined, categorySlug?: string | null) => {
  if (!provider || !categorySlug) return true;
  return toServiceCategoryKey(provider.service_category) === toServiceCategoryKey(categorySlug);
};

const serviceMatchesProvider = (
  service: AppointmentService | undefined,
  provider: AppointmentProvider | undefined
) => {
  if (!service || !provider) return false;
  if (service.provider_id && service.provider_id !== provider.id) return false;
  return providerMatchesCategory(provider, service.category_slug || service.service_category);
};

export default function MerchantAppointmentsPage() {
  const router = useRouter();
  const { user, role, isHydrated } = useAuthStore();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [services, setServices] = useState<AppointmentService[]>([]);
  const [providers, setProviders] = useState<AppointmentProvider[]>([]);
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [status, setStatus] = useState('');
  const [scope, setScope] = useState('upcoming');
  const [slotFilter, setSlotFilter] = useState({
    provider_id: '',
    slot_date: dateOptions[0].value,
  });
  const [loading, setLoading] = useState(true);
  const [slotLoading, setSlotLoading] = useState(false);
  const [providerForm, setProviderForm] = useState<ProviderPayload>(emptyProvider);
  const [editingProviderId, setEditingProviderId] = useState('');
  const [serviceForm, setServiceForm] = useState<ServicePayload>(emptyService);
  const [slotForm, setSlotForm] = useState<SlotPayload>(emptySlot);
  const [editingSlotId, setEditingSlotId] = useState('');
  const [editSlotForm, setEditSlotForm] = useState<Partial<SlotPayload>>({});
  const [savingProvider, setSavingProvider] = useState(false);
  const [savingService, setSavingService] = useState(false);
  const [savingSlot, setSavingSlot] = useState(false);
  const selectedSlotProvider = providers.find((provider) => provider.id === slotForm.provider_id);
  const slotServiceOptions = selectedSlotProvider
    ? services.filter((service) => serviceMatchesProvider(service, selectedSlotProvider))
    : [];
  const serviceFormCategorySlug = categories.find((category) => category.id === serviceForm.category_id)?.slug;
  const serviceProviderOptions = providers.filter((provider) =>
    provider.is_available && providerMatchesCategory(provider, serviceFormCategorySlug)
  );

  useEffect(() => {
    if (isHydrated && (!user || role !== 'merchant')) {
      router.replace('/merchant/login');
    }
  }, [isHydrated, user, role, router]);

  const loadSlots = async (providerId = slotFilter.provider_id, slotDate = slotFilter.slot_date) => {
    if (!providerId) {
      setSlots([]);
      return;
    }
    setSlotLoading(true);
    try {
      const rows = await appointmentApi.getSlots({ providerId, date: slotDate });
      setSlots(rows);
    } catch (err) {
      setSlots([]);
      toast.error(getErrorMessage(err));
    } finally {
      setSlotLoading(false);
    }
  };

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [bookingRes, serviceRes, providerRes, categoryRows] = await Promise.all([
        appointmentApi.listMerchantBookings({ status, scope, limit: 50 }),
        appointmentApi.listServices({ merchant_id: user.id, limit: 100 }),
        appointmentApi.listProviders({ merchant_id: user.id, include_inactive: true, limit: 100 }),
        appointmentApi.getCategories(),
      ]);
      const providerRows = providerRes.data || [];
      const serviceRows = serviceRes.data || [];
      const firstProvider = providerRows[0];
      const firstProviderId = firstProvider?.id || '';
      const firstCompatibleSlotService = firstProvider
        ? serviceRows.find((service) => serviceMatchesProvider(service, firstProvider))
        : null;
      const firstCategory = categoryRows?.[0];

      setBookings(bookingRes.data || []);
      setServices(serviceRows);
      setProviders(providerRows);
      setCategories(categoryRows || []);
      setProviderForm((prev) => ({
        ...prev,
        service_category: prev.service_category || (firstCategory?.slug as ProviderPayload['service_category']) || 'doctor-booking',
      }));
      setServiceForm((prev) => ({
        ...prev,
        provider_id: prev.provider_id || firstProviderId || null,
        category_id: prev.category_id || firstCategory?.id || '',
      }));
      setSlotFilter((prev) => ({
        provider_id: prev.provider_id || firstProviderId,
        slot_date: prev.slot_date || dateOptions[0].value,
      }));
      setSlotForm((prev) => ({
        ...prev,
        provider_id: prev.provider_id || firstProviderId,
        service_id: prev.service_id || firstCompatibleSlotService?.id || null,
      }));
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, status, scope]);

  useEffect(() => {
    if (user && slotFilter.provider_id) loadSlots(slotFilter.provider_id, slotFilter.slot_date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, slotFilter.provider_id, slotFilter.slot_date]);

  const updateStatus = async (booking: Booking, nextStatus: string) => {
    try {
      const updated = await appointmentApi.updateBookingStatus(booking.id, nextStatus);
      setBookings((rows) => rows.map((row) => (row.id === booking.id ? updated : row)));
      toast.success('Booking updated');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const saveProvider = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingProvider(true);
    try {
      if (editingProviderId) {
        const updated = await appointmentApi.updateProvider(editingProviderId, providerPayload(providerForm));
        setProviders((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
        toast.success('Provider updated');
      } else {
        const created = await appointmentApi.createProvider(providerPayload(providerForm));
        setProviders((rows) => [created, ...rows]);
        setSlotForm((prev) => ({ ...prev, provider_id: prev.provider_id || created.id }));
        setServiceForm((prev) => ({ ...prev, provider_id: prev.provider_id || created.id }));
        setSlotFilter((prev) => ({ ...prev, provider_id: prev.provider_id || created.id }));
        toast.success('Provider created');
      }
      setEditingProviderId('');
      setProviderForm(emptyProvider);
      await loadData();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingProvider(false);
    }
  };

  const editProvider = (provider: AppointmentProvider) => {
    setEditingProviderId(provider.id);
    setProviderForm({
      service_category: provider.service_category as ProviderPayload['service_category'],
      staff_name: provider.staff_name || '',
      specialization: provider.specialization || '',
      experience_years: provider.experience_years ?? null,
      qualification: provider.qualification || '',
      profile_image_url: provider.profile_image_url || '',
      is_available: provider.is_available,
    });
  };

  const createService = async (event: React.FormEvent) => {
    event.preventDefault();
    if (serviceForm.provider_id) {
      const selectedProvider = providers.find((provider) => provider.id === serviceForm.provider_id);
      if (!providerMatchesCategory(selectedProvider, serviceFormCategorySlug)) {
        toast.error('Selected provider does not match the service category.');
        return;
      }
    }
    setSavingService(true);
    try {
      const created = await appointmentApi.createService(serviceForm);
      setServices((rows) => [created, ...rows]);
      setServiceForm((prev) => ({ ...emptyService, category_id: prev.category_id, provider_id: prev.provider_id }));
      toast.success('Service created');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingService(false);
    }
  };

  const createSlot = async (event: React.FormEvent) => {
    event.preventDefault();
    if (slotForm.service_id) {
      const selectedService = services.find((service) => service.id === slotForm.service_id);
      if (!serviceMatchesProvider(selectedService, selectedSlotProvider)) {
        toast.error('Selected service is not compatible with this provider.');
        return;
      }
    }
    setSavingSlot(true);
    try {
      const created = await appointmentApi.createSlot(slotForm);
      toast.success('Slot created');
      setSlotFilter({ provider_id: created.provider_id, slot_date: created.slot_date });
      await loadSlots(created.provider_id, created.slot_date);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingSlot(false);
    }
  };

  const startEditSlot = (slot: AppointmentSlot) => {
    setEditingSlotId(slot.id);
    setEditSlotForm({
      service_id: slot.service_id || null,
      slot_date: String(slot.slot_date).slice(0, 10),
      start_time: timeText(slot.start_time),
      end_time: timeText(slot.end_time),
      is_blocked: slot.is_blocked,
    });
  };

  const saveSlot = async (slotId: string) => {
    try {
      const updated = await appointmentApi.updateSlot(slotId, editSlotForm);
      setSlots((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      setEditingSlotId('');
      setEditSlotForm({});
      toast.success('Slot updated');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const deleteSlot = async (slot: AppointmentSlot) => {
    if (slot.has_active_booking || slot.is_booked) return;
    const action = slot.has_any_booking ? 'deactivate' : 'delete';
    if (!window.confirm(`${action === 'deactivate' ? 'Deactivate' : 'Delete'} this slot?`)) return;
    try {
      const result = await appointmentApi.deleteSlot(slot.id);
      setSlots((rows) => rows.filter((row) => row.id !== slot.id));
      toast.success(result.deactivated ? 'Slot deactivated' : 'Slot deleted');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  if (!isHydrated || !user || role !== 'merchant') return null;

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />
      <main className="container-mlb py-6 sm:py-10">
        <Link href="/merchant-dashboard" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-surface-600 hover:text-brand-green">
          <ChevronLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-green">Merchant appointments</p>
            <h1 className="font-display text-3xl font-black text-surface-900">Manage bookings, providers and slots</h1>
            <p className="mt-1 text-sm text-surface-500">Confirm bookings, create providers, publish slots and keep availability clean.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={scope} onChange={(e) => setScope(e.target.value)} className="input-field max-w-[160px]">
              <option value="today">Today</option>
              <option value="upcoming">Upcoming</option>
              <option value="past">Past</option>
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-field max-w-[180px]">
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="rejected">Rejected</option>
              <option value="no_show">No show</option>
            </select>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <section className="space-y-5">
            <div className="rounded-2xl border border-surface-100 bg-white p-5 shadow-sm">
              <h2 className="font-display text-2xl font-bold text-surface-900">Bookings</h2>
              {loading ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-surface-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading bookings
                </div>
              ) : bookings.length === 0 ? (
                <p className="mt-4 rounded-xl bg-surface-50 p-4 text-sm text-surface-500">No bookings found for this filter.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {bookings.map((booking) => (
                    <article key={booking.id} className="rounded-2xl border border-surface-100 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display text-lg font-bold text-surface-900">{booking.service_name}</h3>
                            <span className="rounded-full bg-surface-100 px-2.5 py-1 text-xs font-bold text-surface-600">
                              {booking.status.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-surface-500">
                            {booking.customer_name} - {booking.customer_mobile}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-surface-700">
                            {booking.appointment_date} at {timeText(booking.start_time)}
                          </p>
                          <p className="mt-1 text-xs text-surface-400">
                            {booking.booking_number} - {formatPrice(booking.final_price)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {booking.status === 'pending' && (
                            <>
                              <button type="button" onClick={() => updateStatus(booking, 'confirmed')} className="btn-primary !px-3 !py-2">
                                <CheckCircle2 className="h-4 w-4" />
                                Confirm
                              </button>
                              <button type="button" onClick={() => updateStatus(booking, 'cancelled')} className="btn-ghost !px-3 !py-2 text-red-600">
                                Cancel
                              </button>
                              <button type="button" onClick={() => updateStatus(booking, 'rejected')} className="btn-ghost !px-3 !py-2 text-red-600">
                                <XCircle className="h-4 w-4" />
                                Reject
                              </button>
                            </>
                          )}
                          {booking.status === 'confirmed' && (
                            <>
                              <button type="button" onClick={() => updateStatus(booking, 'completed')} className="btn-primary !px-3 !py-2">
                                Complete
                              </button>
                              <button type="button" onClick={() => updateStatus(booking, 'no_show')} className="btn-ghost !px-3 !py-2">
                                No show
                              </button>
                              <button type="button" onClick={() => updateStatus(booking, 'cancelled')} className="btn-ghost !px-3 !py-2 text-red-600">
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-surface-100 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="font-display text-2xl font-bold text-surface-900">Slot management</h2>
                  <p className="text-sm text-surface-500">Edit open slots. Slots with booking history are deactivated instead of hard-deleted.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={slotFilter.provider_id}
                    onChange={(e) => setSlotFilter((prev) => ({ ...prev, provider_id: e.target.value }))}
                    className="input-field max-w-[220px]"
                  >
                    <option value="">Select provider</option>
                    {providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>{provider.staff_name || provider.store_name || provider.id}</option>
                    ))}
                  </select>
                  <select
                    value={slotFilter.slot_date}
                    onChange={(e) => setSlotFilter((prev) => ({ ...prev, slot_date: e.target.value }))}
                    className="input-field max-w-[170px]"
                  >
                    {dateOptions.map((date) => (
                      <option key={date.value} value={date.value}>{date.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {slotLoading ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-surface-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading slots
                </div>
              ) : !slotFilter.provider_id ? (
                <p className="mt-4 rounded-xl bg-yellow-50 p-4 text-sm text-yellow-800">Create or select a provider first to manage slots.</p>
              ) : slots.length === 0 ? (
                <p className="mt-4 rounded-xl bg-surface-50 p-4 text-sm text-surface-500">No slots for this provider and date.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {slots.map((slot) => {
                    const editing = editingSlotId === slot.id;
                    const locked = Boolean(slot.has_active_booking || slot.is_booked);
                    const referenced = Boolean(slot.has_any_booking);
                    return (
                      <div key={slot.id} className="rounded-2xl border border-surface-100 p-4">
                        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-center">
                          <div className="grid grid-cols-3 gap-2">
                            <input
                              type="date"
                              disabled={!editing}
                              value={editing ? String(editSlotForm.slot_date || '') : String(slot.slot_date).slice(0, 10)}
                              onChange={(e) => setEditSlotForm((prev) => ({ ...prev, slot_date: e.target.value }))}
                              className="input-field !py-2"
                            />
                            <input
                              type="time"
                              disabled={!editing}
                              value={editing ? String(editSlotForm.start_time || '') : timeText(slot.start_time)}
                              onChange={(e) => setEditSlotForm((prev) => ({ ...prev, start_time: e.target.value }))}
                              className="input-field !py-2"
                            />
                            <input
                              type="time"
                              disabled={!editing}
                              value={editing ? String(editSlotForm.end_time || '') : timeText(slot.end_time)}
                              onChange={(e) => setEditSlotForm((prev) => ({ ...prev, end_time: e.target.value }))}
                              className="input-field !py-2"
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-sm">
                            <label className="flex items-center gap-2 font-semibold text-surface-700">
                              <input
                                type="checkbox"
                                disabled={!editing}
                                checked={editing ? Boolean(editSlotForm.is_blocked) : slot.is_blocked}
                                onChange={(e) => setEditSlotForm((prev) => ({ ...prev, is_blocked: e.target.checked }))}
                              />
                              Blocked
                            </label>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${locked ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                              {locked ? 'Booked/locked' : 'Open'}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {editing ? (
                              <>
                                <button type="button" onClick={() => saveSlot(slot.id)} className="btn-primary !px-3 !py-2" disabled={locked}>
                                  <Save className="h-4 w-4" />
                                  Save
                                </button>
                                <button type="button" onClick={() => { setEditingSlotId(''); setEditSlotForm({}); }} className="btn-ghost !px-3 !py-2">
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button type="button" onClick={() => startEditSlot(slot)} className="btn-ghost !px-3 !py-2" disabled={locked}>
                                  <Pencil className="h-4 w-4" />
                                  Edit
                                </button>
                                <button type="button" onClick={() => deleteSlot(slot)} className="btn-ghost !px-3 !py-2 text-red-600" disabled={locked}>
                                  <Trash2 className="h-4 w-4" />
                                  {referenced ? 'Deactivate' : 'Delete'}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-5">
            <form onSubmit={saveProvider} className="rounded-2xl border border-surface-100 bg-white p-5 shadow-sm">
              <h2 className="font-display text-xl font-bold text-surface-900">
                {editingProviderId ? 'Edit provider' : 'Create provider'}
              </h2>
              <div className="mt-4 space-y-3">
                <select
                  required
                  value={providerForm.service_category}
                  onChange={(e) => setProviderForm({ ...providerForm, service_category: e.target.value as ProviderPayload['service_category'] })}
                  className="input-field"
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.slug}>{category.name}</option>
                  ))}
                  {categories.length === 0 && <option value="doctor-booking">Doctor Booking</option>}
                </select>
                <input
                  required
                  value={providerForm.staff_name || ''}
                  onChange={(e) => setProviderForm({ ...providerForm, staff_name: e.target.value })}
                  className="input-field"
                  placeholder="Provider/staff name"
                />
                <input
                  value={providerForm.specialization || ''}
                  onChange={(e) => setProviderForm({ ...providerForm, specialization: e.target.value })}
                  className="input-field"
                  placeholder="Specialization"
                />
                <input
                  type="number"
                  min={0}
                  value={providerForm.experience_years ?? ''}
                  onChange={(e) => setProviderForm({ ...providerForm, experience_years: e.target.value === '' ? null : Number(e.target.value) })}
                  className="input-field"
                  placeholder="Experience years"
                />
                <textarea
                  value={providerForm.qualification || ''}
                  onChange={(e) => setProviderForm({ ...providerForm, qualification: e.target.value })}
                  className="input-field min-h-[72px]"
                  placeholder="Qualification"
                />
                <label className="flex items-center gap-2 text-sm font-semibold text-surface-700">
                  <input
                    type="checkbox"
                    checked={providerForm.is_available}
                    onChange={(e) => setProviderForm({ ...providerForm, is_available: e.target.checked })}
                  />
                  Active/available
                </label>
                <div className="flex gap-2">
                  <button type="submit" disabled={savingProvider} className="btn-primary flex-1">
                    {savingProvider ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                    {editingProviderId ? 'Update provider' : 'Create provider'}
                  </button>
                  {editingProviderId && (
                    <button
                      type="button"
                      onClick={() => { setEditingProviderId(''); setProviderForm(emptyProvider); }}
                      className="btn-ghost"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </form>

            <div className="rounded-2xl border border-surface-100 bg-white p-5 shadow-sm">
              <h2 className="font-display text-xl font-bold text-surface-900">Providers</h2>
              <div className="mt-4 space-y-3">
                {providers.length === 0 ? (
                  <p className="rounded-xl bg-yellow-50 p-4 text-sm text-yellow-800">
                    Create a provider first. Slots and provider-specific services need an active provider.
                  </p>
                ) : providers.map((provider) => (
                  <div key={provider.id} className="rounded-xl border border-surface-100 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-surface-900">{provider.staff_name || provider.store_name || 'Provider'}</p>
                        <p className="text-xs text-surface-500">{provider.specialization || provider.service_category}</p>
                        <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${provider.is_available ? 'bg-green-50 text-green-700' : 'bg-surface-100 text-surface-500'}`}>
                          {provider.is_available ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <button type="button" onClick={() => editProvider(provider)} className="btn-ghost !px-3 !py-2">
                        <Pencil className="h-4 w-4" />
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={createSlot} className="rounded-2xl border border-surface-100 bg-white p-5 shadow-sm">
              <h2 className="font-display text-xl font-bold text-surface-900">Create slot</h2>
              <div className="mt-4 space-y-3">
                <select
                  required
                  value={slotForm.provider_id}
                  onChange={(e) => {
                    const nextProvider = providers.find((provider) => provider.id === e.target.value);
                    const currentService = services.find((service) => service.id === slotForm.service_id);
                    setSlotForm({
                      ...slotForm,
                      provider_id: e.target.value,
                      service_id: serviceMatchesProvider(currentService, nextProvider) ? slotForm.service_id : null,
                    });
                  }}
                  className="input-field"
                >
                  <option value="">Select provider</option>
                  {providers.filter((provider) => provider.is_available).map((provider) => (
                    <option key={provider.id} value={provider.id}>{provider.staff_name || provider.store_name || provider.id}</option>
                  ))}
                </select>
                {providers.length === 0 && (
                  <p className="rounded-xl bg-yellow-50 p-3 text-sm text-yellow-800">Create a provider before publishing slots.</p>
                )}
                <select value={slotForm.service_id || ''} onChange={(e) => setSlotForm({ ...slotForm, service_id: e.target.value || null })} className="input-field">
                  <option value="">Any compatible service</option>
                  {slotServiceOptions.map((service) => (
                    <option key={service.id} value={service.id}>{service.name}</option>
                  ))}
                </select>
                <select value={slotForm.slot_date} onChange={(e) => setSlotForm({ ...slotForm, slot_date: e.target.value })} className="input-field">
                  {dateOptions.map((date) => (
                    <option key={date.value} value={date.value}>{date.label}</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <input type="time" required value={slotForm.start_time} onChange={(e) => setSlotForm({ ...slotForm, start_time: e.target.value })} className="input-field" />
                  <input type="time" required value={slotForm.end_time} onChange={(e) => setSlotForm({ ...slotForm, end_time: e.target.value })} className="input-field" />
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold text-surface-700">
                  <input
                    type="checkbox"
                    checked={Boolean(slotForm.is_blocked)}
                    onChange={(e) => setSlotForm({ ...slotForm, is_blocked: e.target.checked })}
                  />
                  Create as blocked/unavailable
                </label>
                <button type="submit" disabled={savingSlot || !slotForm.provider_id} className="btn-primary w-full">
                  {savingSlot ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
                  Publish slot
                </button>
              </div>
            </form>

            <form onSubmit={createService} className="rounded-2xl border border-surface-100 bg-white p-5 shadow-sm">
              <h2 className="font-display text-xl font-bold text-surface-900">Create service</h2>
              <div className="mt-4 space-y-3">
                <select
                  required
                  value={serviceForm.category_id}
                  onChange={(e) => {
                    const nextCategory = categories.find((category) => category.id === e.target.value);
                    const currentProvider = providers.find((provider) => provider.id === serviceForm.provider_id);
                    setServiceForm({
                      ...serviceForm,
                      category_id: e.target.value,
                      provider_id: providerMatchesCategory(currentProvider, nextCategory?.slug) ? serviceForm.provider_id : null,
                    });
                  }}
                  className="input-field"
                >
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
                <select value={serviceForm.provider_id || ''} onChange={(e) => setServiceForm({ ...serviceForm, provider_id: e.target.value || null })} className="input-field">
                  <option value="">No specific provider</option>
                  {serviceProviderOptions.map((provider) => (
                    <option key={provider.id} value={provider.id}>{provider.staff_name || provider.store_name || provider.id}</option>
                  ))}
                </select>
                <input required value={serviceForm.name} onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })} className="input-field" placeholder="Service name" />
                <textarea value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} className="input-field min-h-[80px]" placeholder="Description" />
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" min={5} value={serviceForm.duration_minutes} onChange={(e) => setServiceForm({ ...serviceForm, duration_minutes: Number(e.target.value) })} className="input-field" placeholder="Minutes" />
                  <input type="number" min={0} value={serviceForm.price} onChange={(e) => setServiceForm({ ...serviceForm, price: Number(e.target.value) })} className="input-field" placeholder="Price" />
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold text-surface-700">
                  <input type="checkbox" checked={serviceForm.is_home_visit} onChange={(e) => setServiceForm({ ...serviceForm, is_home_visit: e.target.checked })} />
                  Home visit service
                </label>
                <button type="submit" disabled={savingService || !serviceForm.category_id} className="btn-primary w-full">
                  {savingService ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Save service
                </button>
              </div>
            </form>
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
