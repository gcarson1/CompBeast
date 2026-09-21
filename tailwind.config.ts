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
          // Destructive *buttons* only. White on the #EF4444 fill measures
          // 3.77:1, under the 4.5:1 floor for a 14px semibold label, so the
          // one control in the app that must not be misread cannot use it.
          // White on this is 6.5:1.
          strong: '#B91C1C',
        },
        warn: '#FB923C', // kept distinct from brand-gold
        'brand-velvet': {
          DEFAULT: '#4C1D95', // Diary Room purple — commissioner, special powers
          soft: 'rgba(139,92,246,0.18)',
          deep: '#C4B5FD', // text-on-dark only
        },
        /**
         * Pop tiles — the bento "colour block" surfaces, layered on top of the
         * dark arena palette rather than replacing it. Gold is the brand fill
         * itself; lavender is `brand-velvet-deep` promoted from a text colour
         * to a surface; mint and sky are the two new accents. Every fill is a
         * *light* surface, so text on it is dark: `ink` is the primary text
         * (8.6–11.5:1 measured against its fill) and `muted` the secondary
         * (5.6–6.7:1). `deep` is the tone as text on the dark surfaces
         * (≥ 8.7:1 on `surface`). `glow` is the hover halo — a colour, not a
         * shadow, because on a near-black canvas a coloured bloom reads as
         * lift where a black drop shadow reads as a smudge.
         */
        'pop-gold': {
          DEFAULT: '#F59E0B',
          ink: '#1A1206',
          muted: '#4A3208',
          deep: '#FBBF24',
          glow: 'rgba(245,158,11,0.45)',
        },
        'pop-lavender': {
          DEFAULT: '#C4B5FD',
          ink: '#1E1046',
          muted: '#3F2E7A',
          deep: '#C4B5FD',
          glow: 'rgba(196,181,253,0.45)',
        },
        'pop-mint': {
          DEFAULT: '#A7F3D0',
          ink: '#052E23',
          muted: '#0F5A46',
          deep: '#6EE7B7',
          glow: 'rgba(167,243,208,0.45)',
        },
        'pop-sky': {
          DEFAULT: '#BAE6FD',
          ink: '#0C2A3F',
          muted: '#1D4E70',
          deep: '#7DD3FC',
          glow: 'rgba(186,230,253,0.45)',
        },
        /**
         * Tone-agnostic text inside a tile. `.card` and every `.card-pop-*`
         * set these custom properties (globals.css), so a component such as a
         * stat readout can say `text-tile-muted` once and be correct whether
         * it lands on the dark surface or on a mint block. Prefer these over
         * `text-muted` in anything that can be dropped into a pop tile.
         */
        tile: {
          ink: 'var(--tile-ink)',
          muted: 'var(--tile-muted)',
          line: 'var(--tile-line)',
        },
        /** Sticker paper: the off-white a die-cut badge is printed on. */
        paper: '#FFF8EC',
        /**
         * The show accent. `<ShowTheme>` sets these custom properties on a
         * league, season, team or player page from the show's entry in
         * `src/lib/shows/registry.ts`; outside one they hold the brand gold
         * (`:root` in globals.css). `accent` is a fill that takes `on-gold`
         * ink, `deep` is the hue as text on the dark surfaces.
         */
        show: {
          accent: 'var(--show-accent)',
          deep: 'var(--show-accent-deep)',
          soft: 'var(--show-accent-soft)',
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
        /**
         * Bento tile radius. Sits in the 16–32px band the tile system wants,
         * and every nested corner is derived from it: `nested` is
         * `card − 12px`, so a button, image slot or inner card inside a
         * tile padded `p-3` (12px) shares the outer curve concentrically
         * rather than fighting it. Tiles padded wider than that hold text,
         * not nested boxes. The previous 10px was right for the hairline
         * dark UI this grew out of; it is too tight for a colour block.
         */
        card: '24px',
        nested: '12px',
        // Tappable controls. Equal to `nested` on purpose — a button inside a
        // tile is the most common nested corner, so the two stay concentric.
        btn: '12px',
        // Non-tappable badges only (see `.pill` in globals.css).
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
      maxWidth: {
        /**
         * Body-copy measure. 60–80 characters is the readable band; `ch` keys
         * that to the rendered font rather than to a pixel guess, so it holds
         * when someone raises their browser's base font size.
         */
        measure: '68ch',
      },
      /**
       * The entrance used by the landing hero and the headline ticker. CSS
       * rather than Framer Motion, and a *transform only* — no fade — for
       * one reason: Largest Contentful Paint. Rendered with
       * `initial={{ opacity: 0 }}` the hero reached the browser as
       * `style="opacity:0"` and was invisible until the JavaScript had
       * downloaded and hydrated, so LCP was gated on the bundle; and Chrome
       * never counts an element whose first paint is at opacity 0 as an LCP
       * candidate even once a CSS animation fades it in — measured, that
       * handed LCP to the ticker text at 6.3s. A slide needs no script,
       * starts on the first frame the browser paints, leaves the text
       * visible throughout, and the reduce-motion block in globals.css
       * collapses it to an instant settle. `both` holds the final frame.
       */
      keyframes: {
        rise: {
          from: { transform: 'translateY(12px)' },
          to: { transform: 'translateY(0)' },
        },
        // Ambient shapes. Transform only, so the compositor owns it and a busy
        // main thread cannot stutter it (the same lesson as the marquee).
        float: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) rotate(0deg)' },
          '50%': { transform: 'translate3d(14px, -22px, 0) rotate(8deg)' },
        },
        'float-alt': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) rotate(0deg)' },
          '50%': { transform: 'translate3d(-18px, 16px, 0) rotate(-10deg)' },
        },
        // A sticker settling: overshoots, then lands.
        'pop-in': {
          '0%': { transform: 'scale(0.6) rotate(-8deg)' },
          '70%': { transform: 'scale(1.08) rotate(2deg)' },
          '100%': { transform: 'scale(1) rotate(var(--sticker-tilt, 0deg))' },
        },
        // Elastic nudge for a badge that just changed (a rank moving).
        wobble: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-4deg) scale(1.04)' },
          '75%': { transform: 'rotate(3deg) scale(1.02)' },
        },
      },
      animation: {
        // 280ms, inside the 150–300ms band. Longer reads as the page
        // assembling itself in front of you rather than as a settle.
        rise: 'rise 280ms ease-out both',
        float: 'float 18s ease-in-out infinite',
        'float-alt': 'float-alt 22s ease-in-out infinite',
        'pop-in': 'pop-in 420ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        wobble: 'wobble 500ms ease-in-out',
      },
      transitionTimingFunction: {
        // Spring-ish overshoot for anything that should feel elastic — a
        // button press, a sticker straightening, a toggle knob. The second
        // curve is the soft settle for lifts and glows, where an overshoot
        // would read as jitter.
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        soft: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      boxShadow: {
        /**
         * Boundaries come from the 1px hairline border on `.card` and from the
         * surface/canvas value step. The shadow only adds the light top edge
         * that reads as elevation on a dark UI.
         *
         * This used to end in `0 8px 24px rgba(0,0,0,0.28)` — a 28% ambient
         * drop shadow, which on a near-black canvas is not elevation, it is
         * just a smudge. The ambient pass is now 4%: present on the darker
         * card-on-card cases, invisible everywhere it was only adding weight.
         */
        card: 'inset 0 1px 0 rgba(248,250,252,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        /**
         * Hover lift. The glow colour comes from `--lift-glow`, set per tone
         * by `.card-pop-*` and defaulting to the gold bloom, so one utility
         * lifts every tile in its own colour.
         */
        lift: '0 14px 32px -14px var(--lift-glow, rgba(245,158,11,0.35)), 0 2px 0 rgba(255,255,255,0.05) inset',
        // The hard 2px offset that makes a badge read as a die-cut sticker
        // laid on the page rather than a pill drawn in it.
        sticker: '0 2px 0 rgba(0,0,0,0.35)',
        // Claymation chip: a lit top edge, a shaded bottom edge, and a soft
        // ground shadow, which together are what make a flat disc read as a
        // moulded object.
        clay: 'inset 0 2px 0 rgba(255,255,255,0.45), inset 0 -4px 0 rgba(0,0,0,0.18), 0 10px 18px -8px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
};

export default config;
