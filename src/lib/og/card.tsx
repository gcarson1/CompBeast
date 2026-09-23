import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { MARK_BARS, markDataUrl } from '../brand';
import { DEFAULT_THEME, type ShowTheme } from '../shows/registry';
import { appBaseUrl } from '../site';

/**
 * The Open Graph card — what a link to Comp Beast looks like when it is
 * pasted into iMessage, WhatsApp, Discord or X.
 *
 * One layout for every page: the wordmark, the eyebrow as a slanted gold
 * tag, one big line in the display face, a sentence under it, and up to
 * four stat chips, over the wordmark's tally set large and faint. The
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
  /**
   * The show's colour (`themeFor(slug)`) on a show's own card — the eyebrow
   * tag and the light behind the title. The site's gold everywhere else.
   */
  theme?: ShowTheme;
}

const CANVAS = '#0F172A';
const INK = '#F8FAFC';
const MUTED = '#94A3B8';
const GOLD_DEEP = '#FBBF24';
const ON_GOLD = '#1A1206';
const HAIRLINE = 'rgba(248,250,252,0.10)';

const MARK = markDataUrl({ square: true });

let fontsPromise: Promise<
  Array<{ name: string; data: ArrayBuffer; weight: 400 | 600; style: 'normal' }>
> | null = null;

/** Read once per process; three files, ~540 KB, and every card needs them. */
function loadFonts() {
  if (!fontsPromise) {
    const dir = path.join(process.cwd(), 'src', 'lib', 'og', 'fonts');
    const read = async (file: string) => {
      const buffer = await readFile(path.join(dir, file));
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    };
    fontsPromise = Promise.all([
      read('Anton-Regular.ttf').then((data) => ({
        name: 'Anton',
        data,
        weight: 400 as const,
        style: 'normal' as const,
      })),
      read('Archivo-Regular.ttf').then((data) => ({
        name: 'Archivo',
        data,
        weight: 400 as const,
        style: 'normal' as const,
      })),
      read('Archivo-SemiBold.ttf').then((data) => ({
        name: 'Archivo',
        data,
        weight: 600 as const,
        style: 'normal' as const,
      })),
    ]);
  }
  return fontsPromise;
}

/** The wordmark's three bars, gold and faint: the card's backdrop. */
const TALLY =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 44" fill="#F59E0B">' +
      `<polygon points="${MARK_BARS[0]}" fill="#64748B"/>` +
      `<polygon points="${MARK_BARS[1]}"/>` +
      `<polygon points="${MARK_BARS[2]}"/></svg>`,
  ).toString('base64');

function Card({ eyebrow, title, subtitle, stats = [], theme = DEFAULT_THEME }: OgCardProps) {
  const host = appBaseUrl().replace(/^https?:\/\//, '');
  // "Draft the cast. Own the leaderboard." sets its second sentence in gold,
  // as the landing page does; a name is one colour.
  const split = /^(.+?\.)\s+(.+)$/.exec(title);
  const [lead, follow] = split ? [split[1], split[2]] : [title, null];
  // Long league or player names shrink rather than wrap into a fourth line.
  const longest = Math.max(lead.length, follow?.length ?? 0);
  const titleSize = longest > 26 ? 70 : longest > 18 ? 88 : 108;

  return (
    <div
      style={{
        position: 'relative',
        width: OG_SIZE.width,
        height: OG_SIZE.height,
        display: 'flex',
        flexDirection: 'column',
        padding: '44px 64px 48px',
        backgroundColor: CANVAS,
        backgroundImage: `radial-gradient(55% 80% at 25% 20%, ${theme.accentSoft}, rgba(15,23,42,0) 70%)`,
        color: INK,
        fontFamily: 'Archivo',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={TALLY}
        width={600}
        height={550}
        alt=""
        style={{ position: 'absolute', right: -70, top: 40, opacity: 0.08 }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK} width={56} height={56} alt="" />
          {/* On the mark's lean, as in the header. */}
          <div
            style={{
              display: 'flex',
              fontFamily: 'Anton',
              fontSize: 40,
              letterSpacing: 1.5,
              transform: 'skewX(-8deg)',
            }}
          >
            <span style={{ color: INK }}>COMP</span>
            <span
              style={{
                marginLeft: 10,
                backgroundImage: 'linear-gradient(180deg, #FDE68A, #FBBF24 45%, #F59E0B)',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              BEAST
            </span>
          </div>
        </div>
        <div style={{ fontSize: 24, color: MUTED }}>{host}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
        {/* The eyebrow as the app's tag: a gold label on the wordmark's slant. */}
        <div style={{ display: 'flex', position: 'relative', alignSelf: 'flex-start', padding: '9px 20px' }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              borderRadius: 4,
              backgroundColor: theme.accent,
              transform: 'skewX(-12deg)',
            }}
          />
          <span
            style={{
              position: 'relative',
              fontSize: 21,
              fontWeight: 600,
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: ON_GOLD,
            }}
          >
            {eyebrow}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 22,
            fontFamily: 'Anton',
            fontSize: titleSize,
            lineHeight: 0.96,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          <span style={{ color: INK }}>{lead}</span>
          {follow && (
            // Struck gold, as BEAST is in the wordmark.
            <span
              style={{
                backgroundImage: 'linear-gradient(180deg, #FDE68A, #FBBF24 45%, #F59E0B)',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              {follow}
            </span>
          )}
        </div>
        {subtitle && (
          <div style={{ marginTop: 20, fontSize: 25, lineHeight: 1.4, color: MUTED, maxWidth: 960 }}>
            {subtitle}
          </div>
        )}
      </div>

      {stats.length > 0 && (
        // The figures ruled into a strip, as the app sets them — not chips.
        <div
          style={{
            display: 'flex',
            marginTop: 28,
            borderTop: `1px solid ${HAIRLINE}`,
            borderBottom: `1px solid ${HAIRLINE}`,
          }}
        >
          {stats.slice(0, 4).map((stat, i) => (
            <div
              key={stat.label}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 12,
                padding: i === 0 ? '14px 28px 14px 0' : '14px 28px',
                borderLeft: i === 0 ? 'none' : `1px solid ${HAIRLINE}`,
              }}
            >
              <div style={{ fontFamily: 'Anton', fontSize: 34, lineHeight: 1, color: GOLD_DEEP }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 20, color: MUTED }}>{stat.label}</div>
            </div>
          ))}
        </div>
      )}
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
