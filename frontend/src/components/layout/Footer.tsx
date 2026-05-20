'use client';
// src/components/layout/Footer.tsx
// ─────────────────────────────────────────────────────────────
// Premium Corporate Footer — MyLocalBazaar.store
// Design: Charcoal/dark background | White + light grey text
// Per master prompt: Company info | Social | Categories |
//                    Support | Newsletter | Legal bar
// ─────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  MapPin, Phone, Mail, Send, ArrowRight,
  Instagram, Twitter, Facebook, Youtube, Linkedin,
  Store, ShieldCheck, Clock, Zap,
} from 'lucide-react';

// ── Social icon component ──────────────────────────────────────
function SocialLink({ href, icon: Icon, label, color }: {
  href: string; icon: React.ElementType; label: string; color: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={`w-9 h-9 rounded-xl border border-white/10 flex items-center justify-center
                  text-white/50 transition-all duration-200
                  hover:border-white/30 hover:text-white hover:bg-white/10
                  hover:scale-110 hover:shadow-lg`}
    >
      <Icon className="w-4 h-4" />
    </a>
  );
}

// ── Footer link ────────────────────────────────────────────────
function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block text-sm text-white/50 hover:text-white transition-colors duration-200
                 hover:translate-x-1 transform py-0.5"
    >
      {children}
    </Link>
  );
}

// ── Newsletter signup ──────────────────────────────────────────
function NewsletterForm() {
  const [email, setEmail]   = useState('');
  const [sent,  setSent]    = useState(false);
  const [error, setError]   = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) { setError('Please enter a valid email'); return; }
    setError('');
    setSent(true);
    setEmail('');
  };

  if (sent) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2 text-brand-green"
      >
        <ShieldCheck className="w-5 h-5" />
        <span className="text-sm font-semibold">You're subscribed! Thanks 🎉</span>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="flex-1">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="w-full bg-white/8 border border-white/15 rounded-xl
                     px-4 py-2.5 text-sm text-white placeholder-white/35
                     focus:outline-none focus:border-brand-green/60
                     focus:ring-2 focus:ring-brand-green/20 transition-all"
        />
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </div>
      <button
        type="submit"
        className="flex-shrink-0 bg-brand-green text-white font-semibold text-sm
                   px-4 py-2.5 rounded-xl hover:bg-green-500 transition-colors
                   flex items-center gap-1.5 shadow-sm"
      >
        <Send className="w-4 h-4" />
        <span className="hidden sm:inline">Subscribe</span>
      </button>
    </form>
  );
}

// ── Trust badges ───────────────────────────────────────────────
const TRUST = [
  { icon: ShieldCheck, label: 'Verified Merchants' },
  { icon: Clock,       label: 'Fast Delivery'      },
  { icon: Zap,         label: 'Emergency Services' },
  { icon: Store,       label: '500+ Stores'        },
];

// ═══════════════════════════════════════════════════════════════
// MAIN FOOTER
// ═══════════════════════════════════════════════════════════════
export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#1A1A1A]" role="contentinfo">

      {/* ── Trust belt ──────────────────────────────────────── */}
      <div className="border-b border-white/8">
        <div className="container-mlb py-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {TRUST.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-brand-green/15 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-brand-green" />
                </div>
                <span className="text-sm font-semibold text-white/70">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main footer body ─────────────────────────────────── */}
      <div className="container-mlb py-12 md:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-10">

          {/* ── Column 1: Brand + About ─────────────────────── */}
          <div className="lg:col-span-2">
            {/* Logo */}
            <Link href="/" className="inline-flex items-center gap-3 mb-5 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-green to-brand-orange
                              flex items-center justify-center flex-shrink-0 shadow-lg
                              group-hover:shadow-glow-green transition-shadow">
                <span className="text-white font-display font-black text-lg leading-none">M</span>
              </div>
              <div>
                <p className="font-display text-xl font-extrabold text-white leading-none">
                  MyLocalBazaar
                </p>
                <p className="text-[10px] font-semibold text-white/35 uppercase tracking-widest leading-none mt-0.5">
                  .store
                </p>
              </div>
            </Link>

            <p className="text-sm text-white/50 leading-relaxed mb-5 max-w-xs">
              Har Local Vyapar aur Har Zaroori Service — Ab Digital Bharat Ka Hissa.
              Empowering local merchants and connecting communities across Navi Mumbai.
            </p>

            {/* Contact info */}
            <div className="space-y-2.5 mb-6">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-brand-green flex-shrink-0 mt-0.5" />
                <span className="text-sm text-white/50">
                  Kharghar, Navi Mumbai, Maharashtra 410210
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-brand-green flex-shrink-0" />
                <a href="tel:+919999999999"
                   className="text-sm text-white/50 hover:text-white transition-colors">
                  +91 99999 99999
                </a>
              </div>
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-brand-green flex-shrink-0" />
                <a href="mailto:support@mylocalbazaar.store"
                   className="text-sm text-white/50 hover:text-white transition-colors">
                  support@mylocalbazaar.store
                </a>
              </div>
            </div>

            {/* Social icons */}
            <div className="flex items-center gap-2">
              <SocialLink href="https://instagram.com/mylocalbazaar" icon={Instagram} label="Instagram" color="pink" />
              <SocialLink href="https://facebook.com/mylocalbazaar"  icon={Facebook}  label="Facebook"  color="blue" />
              <SocialLink href="https://twitter.com/mylocalbazaar"   icon={Twitter}   label="Twitter"   color="sky"  />
              <SocialLink href="https://youtube.com/@mylocalbazaar"  icon={Youtube}   label="YouTube"   color="red"  />
              <SocialLink href="https://linkedin.com/company/mylocalbazaar" icon={Linkedin} label="LinkedIn" color="blue" />
            </div>
          </div>

          {/* ── Column 2: Marketplace ────────────────────────── */}
          <div>
            <h4 className="text-xs font-bold text-white/35 uppercase tracking-widest mb-4">
              Marketplace
            </h4>
            <div className="space-y-1">
              <FooterLink href="/categories/grocery-fmcg">🛒 Grocery & FMCG</FooterLink>
              <FooterLink href="/categories/electronics">📱 Electronics</FooterLink>
              <FooterLink href="/categories/medical">💊 Medical Store</FooterLink>
              <FooterLink href="/categories/clothing">👗 Clothing & Fashion</FooterLink>
              <FooterLink href="/categories/hardware">🔧 Hardware</FooterLink>
              <FooterLink href="/categories/wholesale">🏭 Wholesale Market</FooterLink>
              <FooterLink href="/categories/specialty">⭐ Specialty Stores</FooterLink>
            </div>
          </div>

          {/* ── Column 3: Services ───────────────────────────── */}
          <div>
            <h4 className="text-xs font-bold text-white/35 uppercase tracking-widest mb-4">
              Book Services
            </h4>
            <div className="space-y-1">
              <FooterLink href="/categories/doctor-booking">👨‍⚕️ Doctor Booking</FooterLink>
              <FooterLink href="/categories/mens-salon">💈 Men's Salon</FooterLink>
              <FooterLink href="/categories/womens-salon">💅 Women's Salon</FooterLink>
              <FooterLink href="/categories/home-services">🔨 Home Services</FooterLink>
              <FooterLink href="/categories/tea-stall">☕ Tea Stall</FooterLink>
              <FooterLink href="/categories/chaat-chinese">🍜 Chaat & Chinese</FooterLink>
            </div>

            <h4 className="text-xs font-bold text-white/35 uppercase tracking-widest mb-4 mt-6">
              Quick Links
            </h4>
            <div className="space-y-1">
              <FooterLink href="/merchant/register">🏪 Sell on MyLocalBazaar</FooterLink>
              <FooterLink href="/merchant/login">🔐 Merchant Login</FooterLink>
              <FooterLink href="/about">ℹ️ About Us</FooterLink>
              <FooterLink href="/blog">📖 Blog</FooterLink>
              <FooterLink href="/careers">💼 Careers</FooterLink>
            </div>
          </div>

          {/* ── Column 4: Support + Newsletter ──────────────── */}
          <div>
            <h4 className="text-xs font-bold text-white/35 uppercase tracking-widest mb-4">
              Customer Support
            </h4>
            <div className="space-y-1 mb-6">
              <FooterLink href="/help">Help Center</FooterLink>
              <FooterLink href="/orders">Track Order</FooterLink>
              <FooterLink href="/returns">Returns & Refunds</FooterLink>
              <FooterLink href="/contact">Contact Us</FooterLink>
              <FooterLink href="/faq">FAQs</FooterLink>
            </div>

            {/* Newsletter */}
            <div>
              <h4 className="text-xs font-bold text-white/35 uppercase tracking-widest mb-3">
                Stay Updated
              </h4>
              <p className="text-xs text-white/40 mb-3 leading-relaxed">
                Get exclusive deals and local store updates delivered to your inbox.
              </p>
              <NewsletterForm />
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom copyright bar ─────────────────────────────── */}
      <div className="border-t border-white/8">
        <div className="container-mlb py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">

            {/* Left: Copyright */}
            <p className="text-xs text-white/35 font-medium text-center sm:text-left">
              © {year}{' '}
              <span className="text-white/50 font-semibold">
                Catalyst Service Private Limited
              </span>
              . All Rights Reserved.
            </p>

            {/* Right: Legal links */}
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              {[
                ['Privacy Policy',        '/privacy'],
                ['Refund Policy',         '/refund-policy'],
                ['Shipping Policy',       '/shipping-policy'],
                ['Terms & Conditions',    '/terms'],
                ['Responsible Disclosure','/security'],
              ].map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="text-[11px] text-white/30 hover:text-white/70
                             transition-colors whitespace-nowrap"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* GST + Made in India */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-3 pt-3
                          border-t border-white/5">
            <p className="text-[10px] text-white/25">
              GST Registered | PAN: XXXXXXXX | CIN: UXXXXXXXXXXXXXXXX
            </p>
            <p className="text-[10px] text-white/25 flex items-center gap-1">
              Made with ❤️ in{' '}
              <span className="font-bold text-brand-orange">India</span>
              {' '}🇮🇳 · Powered by Digital Bharat
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
