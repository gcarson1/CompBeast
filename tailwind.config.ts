import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark "Outlaw/Competitor" arena palette. Semantic names are kept
        // (canvas/surface/ink/muted/hairline) so every existing call site
        // repaints from one token change instead of a per-component edit —
        // only `lime` was renamed, to `brand-gold`, since keeping that name
        // would be actively misleading once it renders amber.
        canvas: '#0F172A', // brand-surface: deep OLED slate, main canvas
        surface: '#1E293B', // brand-card: elevated panels, match cards, rosters
        'surface-raised': '#273449', // one step above surface, for rows inside cards
        ink: '#F8FAFC',
        muted: '#94A3B8',
        // `muted` is the floor for body text on canvas (4.9:1). Anything
        // smaller or less important than that should get more contrast, not
        // less, so there is deliberately no dimmer text token.
        hairline: 'rgba(248,250,252,0.08)',
        'brand-gold': {
          DEFAULT: '#F59E0B', // HOH Gold — fills: primary CTA, active state
          soft: 'rgba(245,158,11,0.16)',
          deep: '#FBBF24', // text-on-dark only — 9.4:1 on canvas
        },
        // Gold is a *light* fill, so anything sitting on it needs dark ink.
        // Using `ink` there was a 2.05:1 contrast failure on every primary
        // button in the app; this token exists so that cannot recur.
        'on-gold': '#1A1206',
        danger: {
          DEFAULT: '#EF4444', // Eviction Red — fills, borders, indicator dots
          soft: 'rgba(239,68,68,0.16)',
          deep: '#F87171', // text-on-dark only — #EF4444 is 3.9:1 on surface
        },
        warn: '#FB923C', // kept distinct from brand-gold
        'brand-velvet': {
          DEFAULT: '#4C1D95', // Diary Room purple — commissioner, special powers
          soft: 'rgba(139,92,246,0.18)',
          deep: '#C4B5FD', // text-on-dark only
        },
      },
      fontFamily: {
        // Anton (display) and Archivo (text) are both Omnibus-Type grotesques,
        // so the headline and body voices are actually related rather than an
        // arbitrary pairing — Anton reads as a condensed cut of the same idea.
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-text)', 'ui-sans-serif', '-apple-system', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '20px',
        pill: '999px',
      },
      // Named scale in rem, replacing ~200 one-off `text-[13px]`-style values.
      // rem matters for more than tidiness: px ignores the reader's browser
      // font-size setting outright, which is the first accommodation someone
      // with low vision actually reaches for. Sizes match the old px values
      // 1:1 so nothing reflows, except that the former 10px and 11px text is
      // folded up into a 12px floor — three near-identical micro sizes were
      // scale noise, and 10px is below what most people can comfortably read.
      fontSize: {
        '2xs': ['0.75rem', { lineHeight: '1rem' }], // 12px — uppercase micro-labels, meta
        xs: ['0.8125rem', { lineHeight: '1.125rem' }], // 13px
        sm: ['0.875rem', { lineHeight: '1.25rem' }], // 14px
        base: ['0.9375rem', { lineHeight: '1.375rem' }], // 15px — default body
        md: ['1rem', { lineHeight: '1.5rem' }], // 16px
        lg: ['1.0625rem', { lineHeight: '1.5rem' }], // 17px — card titles
        xl: ['1.25rem', { lineHeight: '1.625rem' }], // 20px
        '2xl': ['1.5rem', { lineHeight: '1.75rem' }], // 24px
        '3xl': ['1.625rem', { lineHeight: '1.875rem' }], // 26px — page titles
        '4xl': ['1.75rem', { lineHeight: '2rem' }], // 28px
        '5xl': ['2.625rem', { lineHeight: '1' }], // 42px — landing hero
        '6xl': ['3.5rem', { lineHeight: '1' }], // 56px — score readout
      },
      boxShadow: {
        // Dark UI reads elevation from a light top edge far more than from a
        // drop shadow; the shadow alone just muddies against a near-black
        // canvas. Inset hairline first, then a soft ambient shadow.
        card: 'inset 0 1px 0 rgba(248,250,252,0.06), 0 1px 2px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.28)',
        raised:
          'inset 0 1px 0 rgba(248,250,252,0.08), 0 2px 4px rgba(0,0,0,0.34), 0 12px 32px rgba(0,0,0,0.34)',
        nav: '0 -1px 0 rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
};

export default config;
