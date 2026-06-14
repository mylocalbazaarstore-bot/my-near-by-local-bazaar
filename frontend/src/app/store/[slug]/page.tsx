// src/app/store/[slug]/page.tsx
// ─────────────────────────────────────────────────────────────
// Merchant Storefront — Server Component shell
// Fetches merchant detail server-side for SEO, renders header,
// product grid, and reviews via client components
// ─────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import StoreHeader from '@/components/store/StoreHeader';
import StoreProducts from '@/components/store/StoreProducts';
import StoreReviews from '@/components/store/StoreReviews';
import type { MerchantDetail } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

async function getMerchant(slug: string): Promise<MerchantDetail | null> {
  try {
    const res = await fetch(`${API_BASE}/merchants/${slug}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.merchant ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const merchant = await getMerchant(params.slug);
  if (!merchant) {
    return { title: 'Store Not Found | MyLocalBazaar' };
  }

  const description = merchant.store_description
    || `Shop from ${merchant.store_name} on MyLocalBazaar — local delivery, great prices.`;

  return {
    title: `${merchant.store_name} | MyLocalBazaar`,
    description,
    openGraph: {
      title: merchant.store_name,
      description,
      images: merchant.store_banner_url ? [merchant.store_banner_url] : undefined,
    },
  };
}

export default async function StorePage({ params }: { params: { slug: string } }) {
  const merchant = await getMerchant(params.slug);
  if (!merchant) notFound();

  return (
    <>
      <Header />
      <main className="min-h-screen bg-surface-50">
        <StoreHeader merchant={merchant} />
        <StoreProducts
          merchantId={merchant.id}
          storeSlug={merchant.store_slug}
          storeName={merchant.store_name}
          isOpen={merchant.is_open}
        />
        <div id="reviews" className="container-mlb pb-16 scroll-mt-24">
          <StoreReviews
            merchantId={merchant.id}
            rating={merchant.rating}
            totalReviews={merchant.total_reviews}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
