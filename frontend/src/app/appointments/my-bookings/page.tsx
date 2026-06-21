'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarCheck, ChevronLeft, Loader2, XCircle } from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { appointmentApi, formatPrice } from '@/lib/appointments';
import { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type { Booking } from '@/types/appointment';
import toast from 'react-hot-toast';

const statusClasses: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700',
  confirmed: 'bg-green-50 text-green-700',
  completed: 'bg-blue-50 text-blue-700',
  cancelled: 'bg-red-50 text-red-700',
  rejected: 'bg-red-50 text-red-700',
  no_show: 'bg-surface-100 text-surface-600',
};

export default function MyBookingsPage() {
  const router = useRouter();
  const { user, isHydrated } = useAuthStore();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (isHydrated && !user) {
      router.replace('/login?redirect=/appointments/my-bookings');
    }
  }, [isHydrated, user, router]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    setLoading(true);
    appointmentApi.listCustomerBookings(user.id, { status, limit: 50 })
      .then((res) => {
        if (mounted) setBookings(res.data || []);
      })
      .catch((err) => {
        if (mounted) toast.error(getErrorMessage(err));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [user, status]);

  const cancelBooking = async (booking: Booking) => {
    try {
      const updated = await appointmentApi.updateBookingStatus(booking.id, 'cancelled', 'Customer cancelled');
      setBookings((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      toast.success('Booking cancelled');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  if (!isHydrated || !user) return null;

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />
      <main className="container-mlb py-6 sm:py-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/services" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-surface-600 hover:text-brand-green">
              <ChevronLeft className="h-4 w-4" />
              Book services
            </Link>
            <h1 className="font-display text-3xl font-black text-surface-900">My appointments</h1>
            <p className="mt-1 text-sm text-surface-500">Track appointment status and cancel future bookings when needed.</p>
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-field max-w-[220px]">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="rejected">Rejected</option>
            <option value="no_show">No show</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-surface-100 bg-white px-4 py-3 text-sm text-surface-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading bookings...
          </div>
        ) : bookings.length === 0 ? (
          <div className="rounded-3xl border border-surface-100 bg-white p-8 text-center">
            <CalendarCheck className="mx-auto mb-3 h-12 w-12 text-surface-300" />
            <h2 className="font-display text-2xl font-bold text-surface-900">No appointments yet</h2>
            <p className="mt-2 text-sm text-surface-500">Book a doctor, salon, or home service appointment to see it here.</p>
            <Link href="/services" className="btn-primary mt-5">Book appointment</Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {bookings.map((booking) => (
              <article key={booking.id} className="rounded-2xl border border-surface-100 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-xl font-bold text-surface-900">{booking.service_name}</h2>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClasses[booking.status] || 'bg-surface-100 text-surface-600'}`}>
                        {booking.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-surface-500">{booking.store_name}</p>
                    <p className="mt-3 text-sm font-semibold text-surface-700">
                      {booking.appointment_date} at {booking.start_time?.slice(0, 5)} - {booking.end_time?.slice(0, 5)}
                    </p>
                    <p className="mt-1 text-sm text-surface-500">
                      Booking ID: <span className="font-bold text-surface-800">{booking.booking_number}</span>
                    </p>
                    <p className="mt-1 text-sm text-surface-500">Price: {formatPrice(booking.final_price)}</p>
                  </div>
                  {['pending', 'confirmed'].includes(booking.status) && (
                    <button
                      type="button"
                      onClick={() => cancelBooking(booking)}
                      className="btn-ghost text-red-600 hover:border-red-200 hover:bg-red-50"
                    >
                      <XCircle className="h-4 w-4" />
                      Cancel
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
