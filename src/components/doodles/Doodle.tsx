import { cn } from '@/lib/ui';

export type DoodleKind =
  | 'key'
  | 'veto'
  | 'crown'
  | 'tally'
  | 'camera'
  | 'door'
  | 'star'
  | 'alert'
  | 'lock'
  | 'lock-open';

const TONE = {
  gold: '#F59E0B',
  lavender: '#C4B5FD',
  mint: '#A7F3D0',
  sky: '#BAE6FD',
  red: '#EF4444',
  paper: '#FFF8EC',
} as const;

const INK = '#1A1206';
const EDGE = '#FFFFFF';

/**
 * The sticker set. Every glyph is something from the game or from the
 * app's own marks — the HOH key, the veto medallion, the crown, the
 * wordmark's climbing tally, the house camera, the front door, a star, a
 * warning, and the roster lock open and shut — drawn in the same 2px
 * rounded stroke as every icon in the app, filled in a tile tone and cut
 * out with a white edge. No generic bursts or sparkles: a sticker that
 * could be on any app is a sticker that says nothing about this one.
 *
 * Silhouettes are filled with `paint-order: stroke`, so a glyph built from
 * several overlapping pieces (a key's bow, shaft and teeth) shows one
 * outline and no seams — the fill covers whatever stroke falls inside it.
 * That needs every piece wound the same way (clockwise on screen), which
 * the paths below are. Pieces that are lines rather than shapes (a
 * shackle, a chain) are stroked in ink instead, with the same white edge.
 *
 * Decorative — always `aria-hidden`. Anything a glyph stands beside says
 * the same thing in text; the crown is never the only way you learn who
 * is leading.
 */
export function Doodle({
  kind,
  tone = 'gold',
  className,
}: {
  kind: DoodleKind;
  tone?: keyof typeof TONE;
  className?: string;
}) {
  const glyph = GLYPHS[kind];
  const fill = TONE[tone];

  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('block overflow-visible', className)}>
      {/* The die-cut edge: 3px of white outside the ink line (10 − 4, halved). */}
      <g fill="none" stroke={EDGE} strokeWidth="10" strokeLinejoin="round" strokeLinecap="round">
        <path d={glyph.body} />
        {glyph.line && <path d={glyph.line} />}
        {glyph.accent && <path d={glyph.accent} />}
      </g>
      {glyph.line && (
        <path d={glyph.line} fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
      <path d={glyph.body} fill={fill} stroke={INK} strokeWidth="4" strokeLinejoin="round" paintOrder="stroke" />
      {glyph.accent && (
        <path d={glyph.accent} fill={TONE.red} stroke={INK} strokeWidth="3" strokeLinejoin="round" paintOrder="stroke" />
      )}
      {glyph.detail && (
        <path d={glyph.detail} fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {glyph.dots?.map((dot) => (
        <circle key={`${dot.cx}-${dot.cy}`} cx={dot.cx} cy={dot.cy} r={dot.r} fill={INK} />
      ))}
    </svg>
  );
}

interface Glyph {
  /** The filled silhouette; may be several clockwise subpaths. */
  body: string;
  /** Ink-stroked open lines that are part of the silhouette (a shackle). */
  line?: string;
  /** A red-filled piece: the tally's pip, the camera's record light. */
  accent?: string;
  /** Ink lines drawn inside the fill. */
  detail?: string;
  /** Ink dots drawn inside the fill. */
  dots?: Array<{ cx: number; cy: number; r: number }>;
}

const GLYPHS: Record<DoodleKind, Glyph> = {
  // The Head of Household key: bow, shaft, two teeth.
  key: {
    body: 'M10 9a6 6 0 1 1 12 0a6 6 0 1 1-12 0Z M14 13h4v16h-4Z M18 20h4v3h-4Z M18 25h3v3h-3Z',
    detail: 'M13.8 9a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0Z',
  },
  // The Power of Veto medallion on its chain.
  veto: {
    body: 'M7.5 19a8.5 8.5 0 1 1 17 0a8.5 8.5 0 1 1-17 0Z M13.2 7a2.8 2.8 0 1 1 5.6 0a2.8 2.8 0 1 1-5.6 0Z M15 9.5h2v1.5h-2Z',
    detail: 'M12 15.5L16 23.5L20 15.5 M15 7a1 1 0 1 0 2 0a1 1 0 1 0-2 0Z',
  },
  crown: {
    body: 'M5 27V10l6 5.5L16 6.5l5 9 6-5.5v17Z',
    detail: 'M7 22.5h18',
    dots: [
      { cx: 10, cy: 18, r: 1.3 },
      { cx: 16, cy: 15.5, r: 1.3 },
      { cx: 22, cy: 18, r: 1.3 },
    ],
  },
  // The wordmark's ascending tally, with its red clutch-veto pip.
  tally: {
    body: 'M6.1 18.5h4.2L7.7 28H3.5Z M14.6 14.5h4.2L15.2 28H11Z M23.2 10.5h4.2L22.7 28h-4.2Z',
    accent: 'M26.1 6a2.4 2.4 0 1 1 4.8 0a2.4 2.4 0 1 1-4.8 0Z',
  },
  // The house camera, record light on.
  camera: {
    body: 'M6 7h13a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V10a3 3 0 0 1 3-3Z M22 13l7-3.5v13L22 19Z',
    detail: 'M9 16a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0Z',
    accent: 'M16.8 11a1.4 1.4 0 1 1 2.8 0a1.4 1.4 0 1 1-2.8 0Z',
    dots: [{ cx: 12.5, cy: 16, r: 1.2 }],
  },
  // The front door.
  door: {
    body: 'M8 28V8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v20Z',
    detail: 'M11.5 24.5V9.5h9v15',
    dots: [{ cx: 18, cy: 17, r: 1.4 }],
  },
  star: {
    body: 'M16 3l3.7 7.8 8.5 1-6.3 5.9 1.7 8.5L16 22l-7.6 4.2 1.7-8.5-6.3-5.9 8.5-1Z',
  },
  alert: {
    body: 'M14.2 5.3a2.1 2.1 0 0 1 3.6 0l11.4 19.4a2.1 2.1 0 0 1-1.8 3.2H4.6a2.1 2.1 0 0 1-1.8-3.2Z',
    detail: 'M16 12v7',
    dots: [{ cx: 16, cy: 23.2, r: 1.5 }],
  },
  lock: {
    body: 'M8.5 12.5h15a2.5 2.5 0 0 1 2.5 2.5v10.5a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 6 25.5V15a2.5 2.5 0 0 1 2.5-2.5Z',
    line: 'M10.5 12.5V9.5a5.5 5.5 0 0 1 11 0v3',
    detail: 'M16 20v3.5',
    dots: [{ cx: 16, cy: 19, r: 1.7 }],
  },
  'lock-open': {
    body: 'M8.5 12.5h15a2.5 2.5 0 0 1 2.5 2.5v10.5a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 6 25.5V15a2.5 2.5 0 0 1 2.5-2.5Z',
    line: 'M21.5 12.5V9a5.5 5.5 0 0 0-11 0v1',
    detail: 'M16 20v3.5',
    dots: [{ cx: 16, cy: 19, r: 1.7 }],
  },
};
