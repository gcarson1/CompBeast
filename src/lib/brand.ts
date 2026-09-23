/**
 * The mark, defined once: three bars climbing on one lean, and the red pip
 * of a camera's tally light over the tallest. The header logo, the
 * decorative `<TallyMark>`, the Open Graph cards, the favicon and the
 * home-screen icons all draw from these numbers, so a change here is a
 * change everywhere (re-run `scripts/make-icons.ts` for the PNGs).
 *
 * Every bar leans by the same amount — a quarter of its height, about 14°,
 * between the tags' 12° and the section bar's 16° — and they share a width
 * and a spacing. The first cut of the mark had three different angles and
 * two widths, which is the difference between a logo and three strokes that
 * happen to be near each other.
 */

const LEAN = 0.25;
const BAR_WIDTH = 8.5;
const BAR_STEP = 14;
const HEIGHT = 44;
const BAR_HEIGHTS = [18, 31, 44] as const;

const round = (n: number) => Math.round(n * 100) / 100;

/** The mark's own box: 60 wide, 44 tall, bars on the baseline. */
export const MARK_VIEWBOX = '0 0 60 44';

/** A square box around the same drawing, for icons: the mark centred in it. */
export const MARK_VIEWBOX_SQUARE = '-2 -10 64 64';

/** The three bars as SVG polygon point lists, short to tall. */
export const MARK_BARS: readonly string[] = BAR_HEIGHTS.map((height, i) => {
  const x = i * BAR_STEP;
  const top = HEIGHT - height;
  const run = LEAN * height;
  return [
    `${round(x + run)},${top}`,
    `${round(x + run + BAR_WIDTH)},${top}`,
    `${round(x + BAR_WIDTH)},${HEIGHT}`,
    `${x},${HEIGHT}`,
  ].join(' ');
});

export const MARK_PIP = { cx: 54.5, cy: 5, r: 4.5 } as const;

/**
 * The palette, as vertical gradients: slate for the early game, amber
 * climbing to a pale gold at the peak, lit from above the way the medals
 * and the rank plates are.
 */
export const MARK_FILLS = {
  slate: ['#94A3B8', '#475569'],
  amber: ['#FCD34D', '#D97706'],
  gold: ['#FEF3C7', '#FBBF24', '#F59E0B'],
  pip: ['#FCA5A5', '#DC2626'],
} as const;

/**
 * The mark as a standalone SVG document, for renderers that take an image
 * (`next/og`, the icon script, the static favicon). `mono` draws it in one
 * colour, for Android's status-bar badge.
 */
export function markSvg({ mono, square = false }: { mono?: string; square?: boolean } = {}): string {
  const stops = (colors: readonly string[]) =>
    colors
      .map(
        (color, i) =>
          `<stop offset="${colors.length === 3 && i === 1 ? 0.35 : i / (colors.length - 1)}" stop-color="${color}"/>`,
      )
      .join('');
  const defs = mono
    ? ''
    : '<defs>' +
      `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1">${stops(MARK_FILLS.slate)}</linearGradient>` +
      `<linearGradient id="a" x1="0" y1="0" x2="0" y2="1">${stops(MARK_FILLS.amber)}</linearGradient>` +
      `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">${stops(MARK_FILLS.gold)}</linearGradient>` +
      `<radialGradient id="p" cx="0.35" cy="0.35" r="0.7">${stops(MARK_FILLS.pip)}</radialGradient>` +
      '</defs>';
  const fill = (id: string) => mono ?? `url(#${id})`;
  const [short, middle, tall] = MARK_BARS;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${square ? MARK_VIEWBOX_SQUARE : MARK_VIEWBOX}">` +
    defs +
    `<polygon points="${short}" fill="${fill('s')}"/>` +
    `<polygon points="${middle}" fill="${fill('a')}"/>` +
    `<polygon points="${tall}" fill="${fill('g')}"/>` +
    `<circle cx="${MARK_PIP.cx}" cy="${MARK_PIP.cy}" r="${MARK_PIP.r}" fill="${fill('p')}"/>` +
    '</svg>'
  );
}

export function markDataUrl(options?: Parameters<typeof markSvg>[0]): string {
  return `data:image/svg+xml;base64,${Buffer.from(markSvg(options)).toString('base64')}`;
}
