import { Doodle } from '@/components/doodles/Doodle';

/**
 * The decoration behind the page on a wide screen: three of the app's own
 * stickers — the HOH key, the veto medallion, the wordmark's tally — set
 * faint in the gutters either side of the column, drifting a few pixels
 * on slow transform-only keyframes.
 *
 * This replaces a first pass of blurred colour blooms and a moulded ring,
 * which read as smudges: soft shapes with no edge have no reason to be
 * there, and a brown ring at the foot of a dark page looked like a stain.
 * Stickers are the language the rest of the page already speaks, so the
 * same objects at a quarter of their opacity read as a set dressing rather
 * than a bug.
 *
 * Gutters only: below `lg` there is no gutter, and anything drifting
 * behind a single column of tiles competes with the tiles. On a phone the
 * page is busy enough. Opacity 0.16 is measured against `muted` text over
 * the worst case (the gold key) at 4.5:1 and above, and the column's tiles
 * are opaque anyway. `fixed`, `-z-10`, and no pointer events, so they stay
 * behind everything and never catch a tap. Under reduced motion
 * `.ambient-shape` parks (globals.css); the stickers stay.
 */
export function AmbientStickers() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden lg:block">
      {/* Position and resting tilt live on the wrapper; the drift keyframes
          own `transform` on the glyph itself, so the two never fight. The
          column is centred at max-w-3xl (768px), so the gutter is
          (100vw − 768px) / 2 wide: these sit inside it from ~1100px up and
          slide behind the column's own opaque tiles on anything narrower. */}
      <span className="absolute left-[max(2rem,calc(50vw-32rem))] top-[18%] block -rotate-12 opacity-[0.16]">
        <Doodle kind="key" className="ambient-shape h-20 w-20 animate-float will-change-transform" />
      </span>
      <span className="absolute left-[max(3rem,calc(50vw-30rem))] top-[64%] block rotate-6 opacity-[0.16]">
        <Doodle
          kind="tally"
          className="ambient-shape h-16 w-16 animate-float-alt will-change-transform [animation-delay:-11s]"
        />
      </span>
      <span className="absolute right-[max(2.5rem,calc(50vw-31rem))] top-[38%] block rotate-[14deg] opacity-[0.16]">
        <Doodle
          kind="veto"
          tone="lavender"
          className="ambient-shape h-[4.5rem] w-[4.5rem] animate-float-alt will-change-transform [animation-delay:-5s]"
        />
      </span>
    </div>
  );
}
