import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { appBaseUrl } from '../site';

/**
 * The Open Graph card — what a link to Comp Beast looks like when it is
 * pasted into iMessage, WhatsApp, Discord or X.
 *
 * One layout for every page: the wordmark, an eyebrow, one big line in the
 * display face, a sentence under it, and up to four stat chips. The
 * per-page routes only decide the words. Rendered by satori (`next/og`),
 * which lays out a subset of CSS — flex only, no grid — with the two brand
 * faces read from disk (see fonts/LICENSE.md), because it cannot use the
 * fonts `next/font` serves to browsers.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;

export interface OgCardProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  stats?: Array<{ value: string; label: string }>;
}

const CANVAS = '#0F172A';
const SURFACE = '#1E293B';
const INK = '#F8FAFC';
const MUTED = '#94A3B8';
const GOLD = '#F59E0B';
const GOLD_DEEP = '#FBBF24';
const HAIRLINE = 'rgba(248,250,252,0.10)';

const MARK =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g transform="translate(4 10)">' +
      '<polygon points="7,24 14,24 7,44 0,44" fill="#64748B"/>' +
      '<polygon points="22,12 29,12 21,44 14,44" fill="#F59E0B"/>' +
      '<polygon points="37,0 45,0 35,44 27,44" fill="#F59E0B"/>' +
      '<circle cx="53" cy="7" r="4.5" fill="#EF4444"/></g></svg>',
  ).toString('base64');

let fontsPromise: Promise<Array<{ name: string; data: ArrayBuffer; weight: 400 | 600; style: 'normal' }>> | null =
  null;

/** Read once per process; three files, ~540 KB, and every card needs them. */
function loadFonts() {
  if (!fontsPromise) {
    const dir = path.join(process.cwd(), 'src', 'lib', 'og', 'fonts');
    const read = async (file: string) => {
      const buffer = await readFile(path.join(dir, file));
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    };
    fontsPromise = Promise.all([
      read('Anton-Regular.ttf').then((data) => ({ name: 'Anton', data, weight: 400 as const, style: 'normal' as const })),
      read('Archivo-Regular.ttf').then((data) => ({ name: 'Archivo', data, weight: 400 as const, style: 'normal' as const })),
      read('Archivo-SemiBold.ttf').then((data) => ({ name: 'Archivo', data, weight: 600 as const, style: 'normal' as const })),
    ]);
  }
  return fontsPromise;
}

function Card({ eyebrow, title, subtitle, stats = [] }: OgCardProps) {
  const host = appBaseUrl().replace(/^https?:\/\//, '');
  // Long league or player names shrink rather than wrap into a fourth line.
  const titleSize = title.length > 26 ? 84 : title.length > 18 ? 104 : 124;

  return (
    <div
      style={{
        width: OG_SIZE.width,
        height: OG_SIZE.height,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '56px 64px',
        backgroundColor: CANVAS,
        backgroundImage: 'radial-gradient(60% 90% at 30% 0%, rgba(245,158,11,0.16), rgba(15,23,42,0) 70%)',
        color: INK,
        fontFamily: 'Archivo',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARK} width={56} height={56} alt="" />
        <div style={{ display: 'flex', fontFamily: 'Anton', fontSize: 40, letterSpacing: 2 }}>
          <span style={{ color: INK }}>COMP</span>
          <span style={{ color: GOLD, marginLeft: 12 }}>BEAST</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: 5,
            textTransform: 'uppercase',
            color: GOLD_DEEP,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            marginTop: 16,
            fontFamily: 'Anton',
            fontSize: titleSize,
            lineHeight: 1,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: INK,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{ marginTop: 20, fontSize: 30, lineHeight: 1.35, color: MUTED, maxWidth: 1000 }}>
            {subtitle}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 16 }}>
          {stats.slice(0, 4).map((stat) => (
            <div
              key={stat.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '16px 22px',
                borderRadius: 14,
                backgroundColor: SURFACE,
                border: `1px solid ${HAIRLINE}`,
              }}
            >
              <div style={{ fontFamily: 'Anton', fontSize: 40, lineHeight: 1, color: GOLD }}>{stat.value}</div>
              <div style={{ marginTop: 8, fontSize: 20, color: MUTED }}>{stat.label}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 24, color: MUTED }}>{host}</div>
      </div>
    </div>
  );
}

/** The response every OG route returns. Cached by the CDN like any image. */
export async function renderOgCard(props: OgCardProps): Promise<ImageResponse> {
  const fonts = await loadFonts();
  return new ImageResponse(<Card {...props} />, {
    ...OG_SIZE,
    fonts,
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
