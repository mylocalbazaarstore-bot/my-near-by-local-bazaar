// next.config.js
// ─────────────────────────────────────────────────────────────
// MyLocalBazaar Frontend — Next.js Configuration
// Allows next/image to load merchant/product images hosted on
// Cloudinary (store_logo_url, store_banner_url, primary_image, etc.)
// ─────────────────────────────────────────────────────────────

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;
