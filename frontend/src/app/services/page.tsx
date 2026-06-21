'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, ChevronRight, Loader2 } from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { CATEGORIES } from '@/types';
import { appointmentApi } from '@/lib/appointments';
import type { ServiceCategory } from '@/types/appointment';

const SERVICE_SLUGS = ['doctor-booking', 'mens-salon', 'womens-salon', 'home-services'];

export default function ServicesPage() {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fallback = useMemo(
    () => CATEGORIES.filter((cat) => SERVICE_SLUGS.includes(cat.slug)),
    []
  );

  useEffect(() => {
    let mounted = true;
    appointmentApi.getCategories()
      .then((rows) => {
        if (mounted) setCategories(rows);
      })
      .catch(() => {
        if (mounted) setError('Service categories could not be loaded from server.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const cards = fallback.map((ui) => {
    const apiCategory = categories.find((cat) => cat.slug === ui.slug);
    return { ...ui, apiName: apiCategory?.name };
  });

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />
      <main className="container-mlb py-8 sm:py-12">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-green">Appointments</p>
            <h1 className="font-display text-3xl font-black text-surface-900 sm:text-4xl">
              Book local services
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-surface-600">
              Choose a service category, compare providers, pick an available slot, and confirm your appointment.
            </p>
          </div>
          <Link href="/appointments/my-bookings" className="btn-ghost">
            <CalendarCheck className="h-4 w-4" />
            My bookings
          </Link>
        </div>

        {loading && (
          <div className="flex items-center gap-2 rounded-xl border border-surface-100 bg-white px-4 py-3 text-sm text-surface-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading service categories...
          </div>
        )}

        {error && !loading && (
          <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            {error} Showing local category configuration.
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((cat) => (
            <Link
              key={cat.slug}
              href={`/services/${cat.slug}`}
              className="group rounded-2xl border border-surface-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div
                className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl text-3xl text-white"
                style={{ background: cat.gradient }}
              >
                {cat.emoji}
              </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-bold text-surface-900">
                    {cat.apiName || cat.label}
                  </h2>
                  <p className="mt-1 text-sm text-surface-500">
                    View providers, services, prices, and available slots.
                  </p>
                </div>
                <ChevronRight className="mt-1 h-5 w-5 text-surface-300 transition-transform group-hover:translate-x-1 group-hover:text-brand-green" />
              </div>
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
