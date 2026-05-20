'use client';
// src/components/home/HomeExtras.tsx
// ─────────────────────────────────────────────────────────────
// Supporting Homepage Sections — MyLocalBazaar.store
// Includes: How It Works | Local Impact Stats | App Download CTA
// ─────────────────────────────────────────────────────────────

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { MapPin, ShoppingCart, Package, ArrowRight, Star } from 'lucide-react';

// ── How It Works ───────────────────────────────────────────────
const STEPS = [
  {
    step: '01',
    icon: MapPin,
    title: 'Set Your Location',
    desc: 'Enter your pincode or area name. We find all verified merchants and services near you.',
    color: 'text-brand-green',
    bg:    'bg-green-50',
    border: 'border-green-200',
    glow:  'shadow-green-100',
  },
  {
    step: '02',
    icon: ShoppingCart,
    title: 'Shop or Book',
    desc: 'Browse products across 13 categories or book services like doctor, salon, home repair.',
    color: 'text-brand-orange',
    bg:    'bg-orange-50',
    border: 'border-orange-200',
    glow:  'shadow-orange-100',
  },
  {
    step: '03',
    icon: Package,
    title: 'Fast Local Delivery',
    desc: 'Merchant confirms your order. Get same-day delivery or schedule at your convenience.',
    color: 'text-blue-500',
    bg:    'bg-blue-50',
    border: 'border-blue-200',
    glow:  'shadow-blue-100',
  },
];

export function HowItWorks() {
  return (
    <section className="py-12 md:py-16 bg-surface-50">
      <div className="container-mlb">
        <div className="text-center mb-10">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-xs font-bold text-brand-green uppercase tracking-widest mb-2"
          >
            Simple as 1-2-3
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.05 }}
            className="section-heading"
          >
            How MyLocalBazaar Works
          </motion.h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {/* Connecting dashed line */}
          <div className="hidden md:block absolute top-12 left-1/3 right-1/3 h-px
                          border-t-2 border-dashed border-surface-200 z-0" />

          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.12 }}
                className="relative z-10"
              >
                <div className="card p-6 text-center hover:-translate-y-1 transition-transform">
                  {/* Step number */}
                  <div className="inline-flex items-center justify-center
                                  w-8 h-8 rounded-full bg-surface-100
                                  text-xs font-black text-surface-400 mb-4">
                    {step.step}
                  </div>

                  {/* Icon */}
                  <div className={`inline-flex items-center justify-center
                                    w-14 h-14 rounded-2xl ${step.bg} border ${step.border}
                                    mb-4 shadow-sm ${step.glow}`}>
                    <Icon className={`w-7 h-7 ${step.color}`} />
                  </div>

                  <h3 className="font-display font-bold text-surface-900 text-lg mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-surface-500 leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Local Impact Stats ─────────────────────────────────────────
const IMPACT_STATS = [
  { value: '500+',  label: 'Verified Merchants',   emoji: '🏪' },
  { value: '10K+',  label: 'Happy Customers',       emoji: '😊' },
  { value: '50K+',  label: 'Products Listed',       emoji: '📦' },
  { value: '4.8★',  label: 'Average Store Rating',  emoji: '⭐' },
];

export function ImpactSection() {
  return (
    <section className="py-12 md:py-14 bg-brand-dark relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-64 h-64 rounded-full
                        bg-brand-green/10 blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full
                        bg-brand-orange/10 blur-3xl translate-x-1/2 translate-y-1/2" />
      </div>

      <div className="container-mlb relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {IMPACT_STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="text-center"
            >
              <div className="text-3xl mb-2">{stat.emoji}</div>
              <div className="font-display text-3xl md:text-4xl font-extrabold text-white mb-1">
                {stat.value}
              </div>
              <p className="text-sm text-white/50 font-medium">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Merchant CTA Banner ────────────────────────────────────────
export function MerchantCTA() {
  return (
    <section className="py-12 md:py-16 bg-white">
      <div className="container-mlb">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="rounded-3xl overflow-hidden relative"
          style={{
            background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
          }}
        >
          {/* Glows */}
          <div className="absolute top-0 left-0 w-96 h-96 rounded-full
                          bg-brand-green/15 blur-3xl -translate-x-1/3 -translate-y-1/3" />
          <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full
                          bg-brand-orange/15 blur-3xl translate-x-1/3 translate-y-1/3" />

          <div className="relative z-10 flex flex-col md:flex-row items-center
                          gap-8 p-8 md:p-12">
            {/* Left */}
            <div className="flex-1 text-center md:text-left">
              <span className="badge bg-brand-orange/20 text-brand-orange border border-brand-orange/30 mb-4">
                🚀 For Merchants
              </span>
              <h2 className="font-display text-3xl md:text-4xl font-extrabold text-white
                             leading-tight mb-3">
                Bring Your Store{' '}
                <span className="text-gradient">Online Today</span>
              </h2>
              <p className="text-white/60 text-base leading-relaxed mb-6 max-w-md">
                Join 500+ verified local merchants on MyLocalBazaar. Free registration,
                easy KYC, and start selling within 48 hours. Digital Bharat awaits!
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
                <Link href="/merchant/register" className="btn-primary text-base !px-7 !py-3.5">
                  Register Your Store <ArrowRight className="w-4 h-4" />
                </Link>
                <Link href="/merchant/learn-more" className="btn-ghost !text-white !border-white/20
                                                              hover:!bg-white/10 text-sm !px-5">
                  Learn More
                </Link>
              </div>
            </div>

            {/* Right: Quick benefits */}
            <div className="grid grid-cols-2 gap-3 md:w-72 flex-shrink-0">
              {[
                { icon: '✅', text: 'Free Registration' },
                { icon: '🚀', text: 'Go Live in 48hrs' },
                { icon: '💳', text: 'Weekly Payouts'   },
                { icon: '📊', text: 'Sales Dashboard'  },
                { icon: '📣', text: 'Marketing Support' },
                { icon: '🛡️', text: 'Verified Badge'   },
              ].map(({ icon, text }) => (
                <div key={text}
                     className="flex items-center gap-2 bg-white/8 rounded-xl px-3 py-2.5
                                border border-white/10">
                  <span className="text-base">{icon}</span>
                  <span className="text-xs font-semibold text-white/80">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ── Testimonials strip ─────────────────────────────────────────
const TESTIMONIALS = [
  { name: 'Priya Sharma', area: 'Kharghar Sec 12', text: 'Got fresh veggies from my local vendor in 30 mins. Amazing!', rating: 5 },
  { name: 'Rahul Patil',  area: 'Kharghar Sec 20', text: 'Booked a plumber through the app — he arrived in an hour. Incredible service.', rating: 5 },
  { name: 'Meera Joshi',  area: 'Panvel',           text: 'Doctor consultation booking was so easy. No more waiting in queues!', rating: 4 },
];

export function TestimonialsStrip() {
  return (
    <section className="py-12 bg-surface-50">
      <div className="container-mlb">
        <div className="text-center mb-8">
          <p className="text-xs font-bold text-brand-orange uppercase tracking-widest mb-1">
            What locals say
          </p>
          <h2 className="section-heading">Customer Stories</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="card p-5"
            >
              <div className="flex items-center gap-1 mb-3">
                {Array.from({ length: t.rating }).map((_, j) => (
                  <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="text-sm text-surface-600 leading-relaxed mb-4 italic">
                "{t.text}"
              </p>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-green to-brand-orange
                                flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {t.name[0]}
                </div>
                <div>
                  <p className="text-sm font-bold text-surface-900">{t.name}</p>
                  <p className="text-xs text-surface-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {t.area}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
