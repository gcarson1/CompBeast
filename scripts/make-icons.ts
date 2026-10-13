/**
 * Renders the PWA / home-screen icons from the logo mark.
 *
 *   npx tsx scripts/make-icons.ts
 *
 * Uses the same renderer the Open Graph images use (`next/og`), so the mark
 * is drawn from the geometry in `src/lib/brand.ts` — the same numbers the
 * header logo uses — rather than from a binary somebody once exported. Re-run after changing the mark or the
 * palette; the PNGs in public/icons are committed so a build needs nothing.
 *
 *  - icon-192 / icon-512: the manifest icons, on the canvas colour.
 *  - maskable-512: same, with the mark inside the 80% safe zone Android masks to.
 *  - apple-touch-icon: 180px, square — iOS applies its own corner radius.
 *  - badge-96: white mark on transparent, for Android's monochrome status-bar badge.
 *
 * And the iOS app's (ios/App/App/Assets.xcassets):
 *
 *  - AppIcon 1024: the one size Xcode needs; it derives the rest. Written
 *    without an alpha channel, because App Store Connect rejects an app icon
 *    that has one even when every pixel is opaque.
 *  - BrandMark @1x/@2x/@3x: the bare mark, for the launch screen and the
 *    native offline screen.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { createElement } from 'react';
import { ImageResponse } from 'next/og';
import { markDataUrl } from '../src/lib/brand';

const CANVAS = '#0F172A';
const IOS_ASSETS = 'ios/App/App/Assets.xcassets';

function mark(mono?: string): string {
  return markDataUrl({ square: true, mono });
}

async function draw(
  size: number,
  options: { background: string; markScale: number; radius?: number; mono?: string },
): Promise<Buffer> {
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
    createElement('img', { src: mark(options.mono), width: markSize, height: markSize }),
  );
  const response = new ImageResponse(element, { width: size, height: size });
  return Buffer.from(await response.arrayBuffer());
}

function write(path: string, bytes: Buffer, note: string) {
  writeFileSync(path, bytes);
  console.log(`${path.split('/').pop()!.padEnd(22)} ${note}  ${bytes.length} bytes`);
}

async function render(
  file: string,
  size: number,
  options: { background: string; markScale: number; radius?: number; mono?: string },
) {
  write(`public/icons/${file}`, await draw(size, options), `${size}px`);
}

/** The mark alone at its own 60:44 proportions, on transparent. */
async function renderMark(width: number): Promise<Buffer> {
  const height = Math.round((width * 44) / 60);
  const element = createElement('img', { src: markDataUrl(), width, height });
  const response = new ImageResponse(element, { width, height });
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  mkdirSync('public/icons', { recursive: true });
  await render('icon-192.png', 192, { background: CANVAS, markScale: 0.72 });
  await render('icon-512.png', 512, { background: CANVAS, markScale: 0.72 });
  await render('maskable-512.png', 512, { background: CANVAS, markScale: 0.56 });
  await render('apple-touch-icon.png', 180, { background: CANVAS, markScale: 0.7 });
  await render('badge-96.png', 96, { background: 'transparent', markScale: 0.9, mono: '#FFFFFF' });

  // iOS rounds the corners itself and wants the art clear of them, hence a
  // smaller mark than the 0.72 the square web icons use.
  const appIcon = await draw(1024, { background: CANVAS, markScale: 0.62 });
  write(`${IOS_ASSETS}/AppIcon.appiconset/AppIcon-1024.png`, withoutAlpha(appIcon), '1024px, opaque');

  // 120×88 points: the size the launch and offline screens draw it at.
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? '' : `@${scale}x`;
    write(
      `${IOS_ASSETS}/BrandMark.imageset/brand-mark${suffix}.png`,
      await renderMark(120 * scale),
      `@${scale}x`,
    );
  }
}

/**
 * Re-encodes an 8-bit RGBA PNG as RGB, dropping the alpha channel. Only for
 * images drawn on an opaque background, where alpha is 255 throughout; the
 * five PNG row filters are undone first, since the renderer picks one per row.
 */
function withoutAlpha(png: Buffer): Buffer {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (png[24] !== 8 || png[25] !== 6) throw new Error('Expected an 8-bit RGBA PNG');

  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
  }
  const filtered = inflateSync(Buffer.concat(chunks));

  const stride = width * 4;
  const rgba = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = filtered[y * (stride + 1)];
    const row = filtered.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? rgba[y * stride + x - 4] : 0;
      const up = y > 0 ? rgba[(y - 1) * stride + x] : 0;
      const upLeft = x >= 4 && y > 0 ? rgba[(y - 1) * stride + x - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      rgba[y * stride + x] = (row[x] + predictor) & 0xff;
    }
  }

  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x += 1) {
      rgba.copy(raw, y * (width * 3 + 1) + 1 + x * 3, y * stride + x * 4, y * stride + x * 4 + 3);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit, truecolour (RGB), deflate, no filter, no interlace
  return Buffer.concat([
    png.subarray(0, 8),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
