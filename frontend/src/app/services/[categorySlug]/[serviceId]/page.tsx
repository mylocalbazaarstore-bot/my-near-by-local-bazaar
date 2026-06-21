'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Loader2,
  MapPin,
  UserRound,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { appointmentApi, formatPrice, nextDateOptions, type BookingPayload } from '@/lib/appointments';
import { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type { AppointmentProvider, AppointmentService, AppointmentSlot, Booking } from '@/types/appointment';
import toast from 'react-hot-toast';

const emptyForm = {
  customer_name: '',
  customer_mobile: '',
  customer_email: '',
  address_text: '',
  notes: '',
  payment_method: 'pay_at_shop' as BookingPayload['payment_method'],
};

export default function ServiceBookingPage() {
  const params = useParams();
  const router = useRouter();
  const categorySlug = params.categorySlug as string;
  const serviceId = params.serviceId as string;
  const { user, isHydrated } = useAuthStore();

  const dateOptions = useMemo(() => nextDateOptions(10), []);
  const [service, setService] = useState<AppointmentService | null>(null);
  const [providers, setProviders] = useState<AppointmentProvider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedDate, setSelectedDate] = useState(dateOptions[0].value);
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [slotLoading, setSlotLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successBooking, setSuccessBooking] = useState<Booking | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');

    appointmentApi.getService(serviceId)
      .then(async (svc) => {
        if (!mounted) return;
        setService(svc);
        setSelectedProviderId(svc.provider_id || '');

        const providerRes = await appointmentApi.listProviders({
          category: categorySlug,
          merchant_id: svc.merchant_id,
          limit: 50,
        });
        if (!mounted) return;
        const rows = providerRes.data || [];
        setProviders(rows);
        if (!svc.provider_id && rows[0]) setSelectedProviderId(rows[0].id);
      })
      .catch((err) => {
        if (mounted) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [categorySlug, serviceId]);

  useEffect(() => {
    if (!selectedProviderId || !selectedDate) return;
    let mounted = true;
    setSlotLoading(true);
    setSelectedSlotId('');
    appointmentApi.getSlots({ providerId: selectedProviderId, serviceId, date: selectedDate })
      .then((rows) => {
        if (mounted) setSlots(rows);
      })
      .catch((err) => {
        if (mounted) {
          setSlots([]);
          toast.error(getErrorMessage(err));
        }
      })
      .finally(() => {
        if (mounted) setSlotLoading(false);
      });
    return () => { mounted = false; };
  }, [selectedProviderId, selectedDate, serviceId]);

  useEffect(() => {
    if (!user) return;
    setForm((prev) => ({
      ...prev,
      customer_name: prev.customer_name || user.full_name || '',
      customer_mobile: prev.customer_mobile || user.phone || '',
      customer_email: prev.customer_email || user.email || '',
    }));
  }, [user]);

  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId);
  const priceText = formatPrice(service?.final_price ?? service?.discount_price ?? service?.price);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!service || !selectedSlot) return;

    if (!user) {
      router.push(`/login?redirect=/services/${categorySlug}/${serviceId}`);
      return;
    }
    if (service.is_home_visit && !form.address_text.trim()) {
      toast.error('Address is required for home visit bookings');
      return;
    }

    setSubmitting(true);
    try {
      const paymentMethod = Number(service.final_price ?? service.price) <= 0 ? 'none' : form.payment_method;
      const booking = await appointmentApi.createBooking({
        service_id: service.id,
        provider_id: selectedProviderId,
        slot_id: selectedSlot.id,
        customer_name: form.customer_name,
        customer_mobile: form.customer_mobile,
        customer_email: form.customer_email,
        address_text: form.address_text,
        notes: form.notes,
        payment_method: paymentMethod,
      });
      setSuccessBooking(booking);
      toast.success('Appointment booked');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isHydrated || loading) {
    return (
      <div className="min-h-screen bg-surface-50">
        <Header />
        <main className="container-mlb max-w-3xl py-10">
          <div className="skeleton h-72 rounded-3xl" />
        </main>
      </div>
    );
  }

  if (error || !service) {
    return (
      <div className="min-h-screen bg-surface-50">
        <Header />
        <main className="container-mlb max-w-2xl py-10">
          <Link href={`/services/${categorySlug}`} className="btn-ghost mb-5">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-red-700">
            {error || 'Service not found'}
          </div>
        </main>
      </div>
    );
  }

  if (successBooking) {
    return (
      <div className="min-h-screen bg-surface-50">
        <Header />
        <main className="container-mlb max-w-2xl py-10">
          <div className="rounded-3xl border border-surface-100 bg-white p-6 text-center shadow-sm sm:p-8">
            <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-brand-green" />
            <p className="text-xs font-bold uppercase tracking-widest text-brand-green">Booking confirmed</p>
            <h1 className="mt-2 font-display text-3xl font-black text-surface-900">
              {successBooking.booking_number}
            </h1>
            <p className="mt-3 text-sm text-surface-600">
              Your appointment is {successBooking.status}. Merchant/provider will manage confirmation from their dashboard.
            </p>
            <div className="mt-6 rounded-2xl bg-surface-50 p-4 text-left text-sm">
              <p className="font-bold text-surface-900">{successBooking.service_name}</p>
              <p className="mt-1 text-surface-600">
                {successBooking.appointment_date} at {successBooking.start_time?.slice(0, 5)}
              </p>
              <p className="mt-1 text-surface-600">{successBooking.store_name}</p>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link href="/appointments/my-bookings" className="btn-primary">View my bookings</Link>
              <Link href="/services" className="btn-ghost">Book another service</Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />
      <main className="container-mlb py-6 sm:py-10">
        <Link href={`/services/${categorySlug}`} className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-surface-600 hover:text-brand-green">
          <ChevronLeft className="h-4 w-4" />
          Back to services
        </Link>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="space-y-5">
            <div className="rounded-3xl border border-surface-100 bg-white p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-brand-green">{service.store_name}</p>
              <h1 className="mt-2 font-display text-3xl font-black text-surface-900">{service.name}</h1>
              <p className="mt-3 text-sm leading-6 text-surface-600">
                {service.description || 'Book this verified local appointment service.'}
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-sm font-semibold text-surface-600">
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-50 px-3 py-1">
                  <Clock className="h-4 w-4" />
                  {service.duration_minutes} min
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-50 px-3 py-1">
                  {priceText}
                </span>
                {service.is_home_visit && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-50 px-3 py-1">
                    <MapPin className="h-4 w-4" />
                    Home visit
                  </span>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="rounded-3xl border border-surface-100 bg-white p-5 shadow-sm">
                <h2 className="font-display text-xl font-bold text-surface-900">1. Select provider</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {providers.length === 0 && service.provider_id ? (
                    <button type="button" className="rounded-2xl border-2 border-brand-green bg-brand-green/5 p-4 text-left">
                      <p className="font-bold text-surface-900">{service.provider_name || 'Assigned provider'}</p>
                      <p className="text-sm text-surface-500">{service.provider_specialization || service.store_name}</p>
                    </button>
                  ) : providers.length === 0 ? (
                    <p className="text-sm text-surface-500">No active providers are available right now.</p>
                  ) : (
                    providers.map((provider) => (
                      <button
                        type="button"
                        key={provider.id}
                        onClick={() => setSelectedProviderId(provider.id)}
                        className={`rounded-2xl border p-4 text-left transition-all ${
                          selectedProviderId === provider.id
                            ? 'border-brand-green bg-brand-green/5 ring-2 ring-brand-green/20'
                            : 'border-surface-100 hover:border-surface-300'
                        }`}
                      >
                        <p className="font-bold text-surface-900">
                          {provider.staff_name || provider.store_name || 'Provider'}
                        </p>
                        <p className="mt-1 text-sm text-surface-500">
                          {provider.specialization || 'Available professional'}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-surface-100 bg-white p-5 shadow-sm">
                <h2 className="font-display text-xl font-bold text-surface-900">2. Pick date and slot</h2>
                <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                  {dateOptions.map((date) => (
                    <button
                      type="button"
                      key={date.value}
                      onClick={() => setSelectedDate(date.value)}
                      className={`min-w-[110px] rounded-2xl border px-3 py-3 text-sm font-bold ${
                        selectedDate === date.value
                          ? 'border-brand-green bg-brand-green text-white'
                          : 'border-surface-100 bg-white text-surface-700'
                      }`}
                    >
                      {date.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {slotLoading ? (
                    <div className="col-span-full flex items-center gap-2 text-sm text-surface-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading slots
                    </div>
                  ) : slots.length === 0 ? (
                    <div className="col-span-full rounded-2xl bg-surface-50 p-4 text-sm text-surface-500">
                      No slots available for this date.
                    </div>
                  ) : (
                    slots.map((slot) => (
                      <button
                        type="button"
                        key={slot.id}
                        disabled={!slot.is_available}
                        onClick={() => setSelectedSlotId(slot.id)}
                        className={`rounded-xl border px-3 py-3 text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-45 ${
                          selectedSlotId === slot.id
                            ? 'border-brand-green bg-brand-green text-white'
                            : 'border-surface-100 bg-white text-surface-700 hover:border-brand-green'
                        }`}
                      >
                        {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-surface-100 bg-white p-5 shadow-sm">
                <h2 className="font-display text-xl font-bold text-surface-900">3. Customer details</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold text-surface-700">
                    Name
                    <input
                      required
                      value={form.customer_name}
                      onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                      className="input-field mt-1"
                      placeholder="Full name"
                    />
                  </label>
                  <label className="text-sm font-semibold text-surface-700">
                    Mobile
                    <input
                      required
                      value={form.customer_mobile}
                      onChange={(e) => setForm({ ...form, customer_mobile: e.target.value })}
                      className="input-field mt-1"
                      placeholder="10 digit mobile"
                    />
                  </label>
                  <label className="text-sm font-semibold text-surface-700 sm:col-span-2">
                    Email optional
                    <input
                      type="email"
                      value={form.customer_email}
                      onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
                      className="input-field mt-1"
                      placeholder="you@example.com"
                    />
                  </label>
                  <label className="text-sm font-semibold text-surface-700 sm:col-span-2">
                    Address/location {service.is_home_visit ? '' : 'optional'}
                    <textarea
                      required={service.is_home_visit}
                      value={form.address_text}
                      onChange={(e) => setForm({ ...form, address_text: e.target.value })}
                      className="input-field mt-1 min-h-[88px]"
                      placeholder="Flat, building, landmark or appointment location"
                    />
                  </label>
                  <label className="text-sm font-semibold text-surface-700 sm:col-span-2">
                    Notes
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className="input-field mt-1 min-h-[88px]"
                      placeholder="Symptoms, preferred stylist, repair instructions, or other details"
                    />
                  </label>
                  <label className="text-sm font-semibold text-surface-700 sm:col-span-2">
                    Payment
                    <select
                      value={Number(service.final_price ?? service.price) <= 0 ? 'none' : form.payment_method}
                      disabled={Number(service.final_price ?? service.price) <= 0}
                      onChange={(e) => setForm({ ...form, payment_method: e.target.value as BookingPayload['payment_method'] })}
                      className="input-field mt-1"
                    >
                      <option value="pay_at_shop">Pay at shop/provider</option>
                      <option value="cash">Cash at visit</option>
                      <option value="upi">UPI at visit</option>
                      <option value="card">Card at visit</option>
                      <option value="online">Online payment later</option>
                      <option value="none">Free</option>
                    </select>
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !selectedProviderId || !selectedSlotId}
                className="btn-primary w-full"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                Confirm booking
              </button>
            </form>
          </section>

          <aside className="h-fit rounded-3xl border border-surface-100 bg-white p-5 shadow-sm lg:sticky lg:top-24">
            <h2 className="font-display text-xl font-bold text-surface-900">Booking summary</h2>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="text-surface-400">Service</p>
                <p className="font-bold text-surface-900">{service.name}</p>
              </div>
              <div>
                <p className="text-surface-400">Provider</p>
                <p className="font-bold text-surface-900">
                  {selectedProvider?.staff_name || service.provider_name || 'Select provider'}
                </p>
              </div>
              <div>
                <p className="text-surface-400">Date and time</p>
                <p className="font-bold text-surface-900">
                  {selectedDate}
                  {selectedSlot ? `, ${selectedSlot.start_time.slice(0, 5)}` : ''}
                </p>
              </div>
              <div>
                <p className="text-surface-400">Price</p>
                <p className="font-bold text-surface-900">{priceText}</p>
              </div>
            </div>
            {!user && (
              <div className="mt-5 rounded-2xl bg-yellow-50 p-4 text-sm text-yellow-800">
                Login is required before confirmation. Your selected slot will stay on this page until you continue.
              </div>
            )}
            <div className="mt-5 flex items-start gap-2 rounded-2xl bg-surface-50 p-4 text-sm text-surface-600">
              <UserRound className="mt-0.5 h-4 w-4 text-brand-green" />
              Same slot cannot be booked twice; availability is rechecked on confirmation.
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
