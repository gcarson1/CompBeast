import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#f4f4f5',
        surface: '#ffffff',
        ink: '#0d0d0f',
        muted: '#8a8a94',
        hairline: '#ebebed',
        lime: {
          DEFAULT: '#b8f14c',
          soft: '#e8fbc4',
          deep: '#8fd11a',
        },
        danger: '#f03d3d',
        warn: '#f5a524',
      },
      borderRadius: {
        card: '20px',
        pill: '999px',
      },
      fontSize: {
        '2xs': ['10px', '13px'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(13,13,15,0.04), 0 8px 24px rgba(13,13,15,0.04)',
        nav: '0 -1px 0 rgba(13,13,15,0.06)',
      },
    },
  },
  plugins: [],
};

export default config;
