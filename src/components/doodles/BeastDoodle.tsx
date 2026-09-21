import { cn } from '@/lib/ui';

/**
 * The Beast: the app's mascot as a die-cut sticker.
 *
 * One-eyed, fuzzy, grinning — drawn in the same 2px stroke as every other
 * icon in the app, filled in HOH gold, and cut out with the thick white
 * edge that makes it read as a sticker laid on the tile rather than a
 * picture printed in it. `paint-order: stroke` is what puts that white
 * edge *behind* the fill on a single path, so the outline costs no second
 * copy of the shape.
 *
 * Hand-drawn on purpose: the paths are slightly off-symmetric, the teeth
 * are uneven, and the horns do not match. A perfect mascot would look
 * generated.
 *
 * Decorative everywhere it appears, so it is `aria-hidden`; if a caller
 * ever needs it announced it can pass a `title`.
 */
export function BeastDoodle({
  mood = 'grin',
  className,
  title,
}: {
  mood?: 'grin' | 'wink' | 'shock';
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 72 72"
      className={cn('block overflow-visible', className)}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}

      {/* Body, with the sticker edge. The fur tufts are part of the same
          path so the white cut-out follows them. */}
      <path
        d="M36 10c2-4 3-6 4-8 1 3 1 6 1 8 3-2 6-3 8-3-1 2-2 4-4 6 8 4 13 11 13 21 0 15-9 26-22 26S14 49 14 34c0-10 5-17 13-21-2-2-4-4-5-6 3 0 6 1 8 3 0-3 1-6 2-8 2 2 3 4 4 8Z"
        fill="#F59E0B"
        stroke="#FFFFFF"
        strokeWidth="7"
        strokeLinejoin="round"
        paintOrder="stroke"
      />
      <path
        d="M36 10c2-4 3-6 4-8 1 3 1 6 1 8 3-2 6-3 8-3-1 2-2 4-4 6 8 4 13 11 13 21 0 15-9 26-22 26S14 49 14 34c0-10 5-17 13-21-2-2-4-4-5-6 3 0 6 1 8 3 0-3 1-6 2-8 2 2 3 4 4 8Z"
        fill="none"
        stroke="#1A1206"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />

      {/* Arms: one waving, one on the hip. */}
      <path
        d="M15 38c-5-1-8 2-8 5s3 4 6 3M57 36c5-3 9-1 9 3s-3 5-6 4"
        fill="#F59E0B"
        stroke="#1A1206"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Feet. */}
      <path
        d="M28 59c-1 3-1 5 0 7h7c0-2 0-4-1-7M40 59c1 3 1 5 0 7h-7"
        fill="#F59E0B"
        stroke="#1A1206"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* The eye. */}
      {mood === 'wink' ? (
        <path
          d="M25 31c3-4 7-6 11-6s8 2 11 6"
          fill="none"
          stroke="#1A1206"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      ) : (
        <>
          <circle
            cx="36"
            cy="30"
            r={mood === 'shock' ? 12 : 11}
            fill="#FFFFFF"
            stroke="#1A1206"
            strokeWidth="2.2"
          />
          <circle cx="37" cy="31" r={mood === 'shock' ? 4 : 6} fill="#1A1206" />
          <circle cx="39" cy="28.5" r="1.8" fill="#FFFFFF" />
        </>
      )}

      {/* The grin: wide, with uneven teeth. */}
      {mood === 'shock' ? (
        <ellipse cx="36" cy="49" rx="5" ry="6" fill="#1A1206" />
      ) : (
        <>
          <path
            d="M21 44c4 5 9 8 15 8s11-3 15-8"
            fill="#1A1206"
            stroke="#1A1206"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <path d="M24 45.5l2.5 3 2.5-3 3 3.5 3-3.5 3 3.5 3-3.5 2.5 3 2.5-3" fill="#FFFFFF" stroke="none" />
        </>
      )}

      {/* Blush. */}
      <circle cx="22" cy="38" r="2.4" fill="#EF4444" opacity="0.55" />
      <circle cx="51" cy="38" r="2.4" fill="#EF4444" opacity="0.55" />
    </svg>
  );
}
