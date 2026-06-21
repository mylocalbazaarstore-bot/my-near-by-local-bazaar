'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CalendarDays, ChevronLeft, Clock, Loader2, MapPin, Star, UserRound } from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { CATEGORIES } from '@/types';
import { appointmentApi, formatPrice } from '@/lib/appointments';
import { getErrorMessage } from '@/lib/api';
import type { AppointmentProvider, AppointmentService } from '@/types/appointment';

export default function ServiceCategoryPage() {
  const params = useParams();
  const categorySlug = params.categorySlug as string;
  const category = useMemo(
    () => CATEGORIES.find((cat) => cat.slug === categorySlug),
    [categorySlug]
  );

  const [services, setServices] = useState<AppointmentService[]>([]);
  const [providers, setProviders] = useState<AppointmentProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');

    Promise.all([
      appointmentApi.listServices({ category: categorySlug, limit: 50 }),
      appointmentApi.listProviders({ category: categorySlug, limit: 50 }),
    ])
      .then(([serviceRes, providerRes]) => {
        if (!mounted) return;
        setServices(serviceRes.data || []);
        setProviders(providerRes.data || []);
      })
      .catch((err) => {
        if (mounted) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [categorySlug]);

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />
      <main className="container-mlb py-6 sm:py-10">
        <Link href="/services" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-surface-600 hover:text-brand-green">
          <ChevronLeft className="h-4 w-4" />
          All services
        </Link>

        <section
          className="mb-8 overflow-hidden rounded-3xl p-6 text-white sm:p-8"
          style={{ background: category?.gradient || 'linear-gradient(135deg, #22C55E 0%, #0284C7 100%)' }}
        >
          <p className="text-xs font-bold uppercase tracking-widest text-white/70">Appointment category</p>
          <h1 className="mt-2 font-display text-3xl font-black sm:text-4xl">
            {category?.emoji} {category?.label || 'Services'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/80">
            Select a service, choose a provider and book a time slot that works for you.
          </p>
        </section>

        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="skeleton h-48 rounded-2xl" />
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-2xl font-bold text-surface-900">Available services</h2>
                <span className="text-sm font-semibold text-surface-500">{services.length} listed</span>
              </div>

              {services.length === 0 ? (
                <div className="rounded-2xl border border-surface-100 bg-white p-8 text-center">
                  <CalendarDays className="mx-auto mb-3 h-10 w-10 text-surface-300" />
                  <h3 className="font-display text-xl font-bold text-surface-900">No appointment services yet</h3>
                  <p className="mt-2 text-sm text-surface-500">
                    Verified merchants can add services and slots from their appointment dashboard.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {services.map((service) => (
                    <Link
                      key={service.id}
                      href={`/services/${categorySlug}/${service.id}`}
                      className="group flex h-full flex-col rounded-2xl border border-surface-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
                    >
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-brand-green">{service.store_name}</p>
                          <h3 className="mt-1 font-display text-xl font-bold text-surface-900 group-hover:text-brand-green">
                            {service.name}
                          </h3>
                        </div>
                        <span className="rounded-full bg-brand-green/10 px-3 py-1 text-xs font-bold text-brand-green">
                          {formatPrice(service.final_price ?? service.discount_price ?? service.price)}
                        </span>
                      </div>
                      <p className="line-clamp-3 flex-1 text-sm text-surface-500">
                        {service.description || 'Book a verified local appointment slot.'}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-surface-500">
                        <span className="inline-flex items-center gap-1 rounded-full bg-surface-50 px-2.5 py-1">
                          <Clock className="h-3.5 w-3.5" />
                          {service.duration_minutes} min
                        </span>
                        {service.is_home_visit && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-surface-50 px-2.5 py-1">
                            <MapPin className="h-3.5 w-3.5" />
                            Home visit
                          </span>
                        )}
                        {service.provider_name && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-surface-50 px-2.5 py-1">
                            <UserRound className="h-3.5 w-3.5" />
                            {service.provider_name}
                          </span>
                        )}
                      </div>
                      <span className="mt-5 btn-primary w-full">Book appointment</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <aside className="space-y-4">
              <div className="rounded-2xl border border-surface-100 bg-white p-5">
                <h2 className="font-display text-xl font-bold text-surface-900">Providers</h2>
                <p className="mt-1 text-sm text-surface-500">Choose from verified local professionals.</p>
                <div className="mt-4 space-y-3">
                  {providers.length === 0 ? (
                    <p className="text-sm text-surface-400">No providers are active for this category yet.</p>
                  ) : (
                    providers.slice(0, 6).map((provider) => (
                      <div key={provider.id} className="rounded-xl border border-surface-100 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-surface-900">
                              {provider.staff_name || provider.store_name || 'Service provider'}
                            </p>
                            <p className="text-xs text-surface-500">{provider.specialization || provider.store_name}</p>
                          </div>
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-yellow-600">
                            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                            {Number(provider.rating || 0).toFixed(1)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}

        {loading && (
          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-surface-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading appointment options
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
