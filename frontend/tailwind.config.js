/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ── Brand Fonts ──────────────────────────────────────────
      fontFamily: {
        display: ['var(--font-display)', 'serif'],   // Playfair Display — headlines
        body:    ['var(--font-body)',    'sans-serif'], // Plus Jakarta Sans — body
        mono:    ['var(--font-mono)',    'monospace'],
      },

      // ── Brand Color Palette ──────────────────────────────────
      colors: {
        // Primary brand
        brand: {
          orange: '#F97316',
          green:  '#22C55E',
          dark:   '#0F172A',
        },

        // Category-specific theme colors (from master prompt)
        grocery:    { DEFAULT: '#22C55E', accent: '#F97316', bg: '#F0FDF4' },
        wholesale:  { DEFAULT: '#F97316', accent: '#EA580C', bg: '#FFF7ED' },
        electronics:{ DEFAULT: '#3B82F6', accent: '#1D4ED8', bg: '#EFF6FF' },
        hardware:   { DEFAULT: '#78716C', accent: '#57534E', bg: '#FAFAF9' },
        clothing:   { DEFAULT: '#EC4899', accent: '#DB2777', bg: '#FDF2F8' },
        medical:    { DEFAULT: '#EF4444', accent: '#3B82F6', bg: '#FFF1F2' },
        doctor:     { DEFAULT: '#06B6D4', accent: '#0284C7', bg: '#F0FDFF' },
        mens_salon: { DEFAULT: '#1E3A8A', accent: '#94A3B8', bg: '#EFF6FF' },
        womens_salon:{ DEFAULT: '#F9A8D4', accent: '#FBBF24', bg: '#FFF0F7' },
        home_services:{ DEFAULT: '#EAB308', accent: '#3B82F6', bg: '#FEFCE8' },
        tea_stall:  { DEFAULT: '#F97316', accent: '#DC2626', bg: '#FFF7ED' },
        food:       { DEFAULT: '#DC2626', accent: '#F97316', bg: '#FFF1F2' },
        specialty:  { DEFAULT: '#8B5CF6', accent: '#6D28D9', bg: '#F5F3FF' },

        // UI neutrals
        surface: {
          50:  '#FAFAFA',
          100: '#F4F4F5',
          200: '#E4E4E7',
          300: '#D4D4D8',
          400: '#A1A1AA',
          800: '#27272A',
          900: '#18181B',
          950: '#09090B',
        },
      },

      // ── Spacing & Size Tokens ────────────────────────────────
      maxWidth: {
        container: '1280px',
        prose:     '72ch',
      },

      // ── Border Radius ─────────────────────────────────────────
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },

      // ── Box Shadows ───────────────────────────────────────────
      boxShadow: {
        'card':     '0 2px 8px 0 rgba(0,0,0,0.06), 0 1px 3px 0 rgba(0,0,0,0.04)',
        'card-hover': '0 12px 32px 0 rgba(0,0,0,0.10), 0 4px 12px 0 rgba(0,0,0,0.06)',
        'hero':     '0 32px 80px 0 rgba(0,0,0,0.20)',
        'glow-green': '0 0 24px rgba(34,197,94,0.35)',
        'glow-orange': '0 0 24px rgba(249,115,22,0.35)',
      },

      // ── Keyframe Animations ───────────────────────────────────
      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-8px)' },
        },
        'pulse-ring': {
          '0%':   { transform: 'scale(0.95)', boxShadow: '0 0 0 0 rgba(34,197,94,0.7)' },
          '70%':  { transform: 'scale(1)',    boxShadow: '0 0 0 10px rgba(34,197,94,0)' },
          '100%': { transform: 'scale(0.95)', boxShadow: '0 0 0 0 rgba(34,197,94,0)' },
        },
      },
      animation: {
        'fade-up':    'fade-up 0.5s ease-out forwards',
        'fade-in':    'fade-in 0.4s ease-out forwards',
        shimmer:      'shimmer 2s linear infinite',
        float:        'float 3s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.455,0.03,0.515,0.955) infinite',
      },
    },
  },
  plugins: [],
};
