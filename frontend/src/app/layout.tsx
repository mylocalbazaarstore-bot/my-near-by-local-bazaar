// src/app/layout.tsx — Root Layout — MyLocalBazaar

import type { Metadata } from 'next';
import { Playfair_Display, Plus_Jakarta_Sans } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import Providers from '@/components/providers/Providers';
import '../globals.css';

const playfair = Playfair_Display({
  subsets: ['latin'], variable: '--font-display', display: 'swap',
  weight: ['400','600','700','800'],
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'], variable: '--font-body', display: 'swap',
  weight: ['300','400','500','600','700','800'],
});

export const metadata: Metadata = {
  title: {
    default:  'MyLocalBazaar — Your Local Market, Digitally Connected',
    template: '%s | MyLocalBazaar',
  },
  description: 'Shop local, book local, grow local. Discover grocery, medical, salons & home services from verified merchants in Kharghar, Navi Mumbai.',
  keywords: ['local marketplace Navi Mumbai','hyperlocal shopping Kharghar','online grocery','MyLocalBazaar'],
  authors:   [{ name: 'Catalyst Service Private Limited' }],
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://mylocalbazaar.store'),
  openGraph: {
    type: 'website', locale: 'en_IN', siteName: 'MyLocalBazaar',
    title: 'MyLocalBazaar — Your Local Market, Digitally Connected',
    description: 'Har Local Vyapar aur Har Zaroori Service, Ab Digital Bharat Ka Hissa',
  },
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${playfair.variable} ${jakarta.variable}`}>
      <body className="font-body bg-white text-surface-900 antialiased">
        <Providers>
          {children}
        </Providers>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#18181B', color: '#FAFAFA',
              fontFamily: 'var(--font-body)', fontSize: '14px',
              borderRadius: '12px', padding: '12px 16px',
            },
            success: { iconTheme: { primary: '#22C55E', secondary: '#fff' } },
            error:   { iconTheme: { primary: '#EF4444', secondary: '#fff' } },
          }}
        />
      </body>
    </html>
  );
}
