// src/app/page.tsx
// ─────────────────────────────────────────────────────────────
// Homepage — MyLocalBazaar.store
// Assembles all sections in mobile-first order
// ─────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import HeroSection from '@/components/home/HeroSection';
import CategoryGrid from '@/components/home/CategoryGrid';
import FeaturedMerchants from '@/components/home/FeaturedMerchants';
import {
  HowItWorks,
  ImpactSection,
  MerchantCTA,
  TestimonialsStrip,
} from '@/components/home/HomeExtras';

export const metadata: Metadata = {
  title: 'MyLocalBazaar — Your Local Market, Digitally Connected | Kharghar, Navi Mumbai',
  description:
    'Shop local groceries, electronics, medical, fashion. Book doctors, salons, home services in Kharghar and Navi Mumbai. Same-day delivery from 500+ verified local stores.',
};

export default function HomePage() {
  return (
    <>
      <Header />

      <main>
        {/* 1. Hero — search-first, pincode discovery */}
        <HeroSection />

        {/* 2. All 16 category cards with brand colors */}
        <CategoryGrid />

        {/* 3. Featured & nearest merchant rows */}
        <FeaturedMerchants />

        {/* 4. How it works — 3-step explainer */}
        <HowItWorks />

        {/* 5. Platform impact stats — dark section */}
        <ImpactSection />

        {/* 6. Customer testimonials */}
        <TestimonialsStrip />

        {/* 7. Merchant CTA banner */}
        <MerchantCTA />
      </main>

      <Footer />
    </>
  );
}
