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
        ink: '#F8FAFC',
        muted: '#94A3B8',
        hairline: 'rgba(248,250,252,0.08)',
        'brand-gold': {
          DEFAULT: '#F59E0B', // HOH Gold — primary CTA, positive scoring
          soft: 'rgba(245,158,11,0.16)',
          deep: '#FBBF24', // brighter for text-on-dark contrast
        },
        danger: '#EF4444', // Eviction Red — negative scoring, block nominees
        warn: '#FB923C', // kept distinct from brand-gold
        'brand-velvet': '#4C1D95', // Diary Room purple — special advantages, VIP
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '20px',
        pill: '999px',
      },
      fontSize: {
        '2xs': ['10px', '13px'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.24), 0 8px 24px rgba(0,0,0,0.32)',
        nav: '0 -1px 0 rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
};

export default config;
