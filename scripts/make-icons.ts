/**
 * Renders the PWA / home-screen icons from the logo mark.
 *
 *   npx tsx scripts/make-icons.ts
 *
 * Uses the same renderer the Open Graph images use (`next/og`), so the mark
 * is drawn from the SVG in AppHeader's `CompBeastLogo` rather than from a
 * binary somebody once exported. Re-run after changing the mark or the
 * palette; the PNGs in public/icons are committed so a build needs nothing.
 *
 *  - icon-192 / icon-512: the manifest icons, on the canvas colour.
 *  - maskable-512: same, with the mark inside the 80% safe zone Android masks to.
 *  - apple-touch-icon: 180px, square — iOS applies its own corner radius.
 *  - badge-96: white mark on transparent, for Android's monochrome status-bar badge.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createElement } from 'react';
import { ImageResponse } from 'next/og';

const CANVAS = '#0F172A';

function mark(colors: { slate: string; gold: string; red: string }): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<g transform="translate(4 10)">` +
    `<polygon points="7,24 14,24 7,44 0,44" fill="${colors.slate}"/>` +
    `<polygon points="22,12 29,12 21,44 14,44" fill="${colors.gold}"/>` +
    `<polygon points="37,0 45,0 35,44 27,44" fill="${colors.gold}"/>` +
    `<circle cx="53" cy="7" r="4.5" fill="${colors.red}"/>` +
    `</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const BRAND = { slate: '#64748B', gold: '#F59E0B', red: '#EF4444' };
const MONO = { slate: '#FFFFFF', gold: '#FFFFFF', red: '#FFFFFF' };

async function render(
  file: string,
  size: number,
  options: { background: string; markScale: number; radius?: number; colors?: typeof BRAND },
) {
  const markSize = Math.round(size * options.markScale);
  const element = createElement(
    'div',
    {
      style: {
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: options.background,
        borderRadius: options.radius ?? 0,
      },
    },
    createElement('img', { src: mark(options.colors ?? BRAND), width: markSize, height: markSize }),
  );
  const response = new ImageResponse(element, { width: size, height: size });
  const bytes = Buffer.from(await response.arrayBuffer());
  writeFileSync(`public/icons/${file}`, bytes);
  console.log(`${file.padEnd(22)} ${size}px  ${bytes.length} bytes`);
}

async function main() {
  mkdirSync('public/icons', { recursive: true });
  await render('icon-192.png', 192, { background: CANVAS, markScale: 0.72 });
  await render('icon-512.png', 512, { background: CANVAS, markScale: 0.72 });
  await render('maskable-512.png', 512, { background: CANVAS, markScale: 0.56 });
  await render('apple-touch-icon.png', 180, { background: CANVAS, markScale: 0.7 });
  await render('badge-96.png', 96, { background: 'transparent', markScale: 0.9, colors: MONO });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
