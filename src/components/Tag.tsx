import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/ui';

export type TagTone =
  'ink' | 'outline' | 'gold' | 'silver' | 'bronze' | 'show' | 'red' | 'mint' | 'lavender' | 'sky';

// Spelled out so Tailwind's content scan finds every class; a template
// string here would leave the unused tones out of the stylesheet.
const TONE_CLASS: Record<TagTone, string> = {
  ink: '',
  outline: 'tag-outline',
  gold: 'tag-gold',
  silver: 'tag-silver',
  bronze: 'tag-bronze',
  /** The accent of whichever show the page belongs to (see `ShowTheme`). */
  show: 'tag-show',
  red: 'tag-red',
  mint: 'tag-mint',
  lavender: 'tag-lavender',
  sky: 'tag-sky',
};

const SIZE_CLASS = { sm: 'tag-sm', md: '', lg: 'tag-lg' } as const;

/**
 * A label on the slant (`.tag` in globals.css): a status, a rank, a points
 * value, a show. Cut on the wordmark's angle, like a network's on-screen
 * graphics, and level — the lean is in the shape, never in the placement.
 *
 * A tag is never a control. Anything you can press is a level `.btn`; a
 * tag only ever says what something is.
 *
 * `live` adds the on-air dot, for the one thing on a page that is happening
 * right now.
 */
export function Tag({
  tone = 'ink',
  size = 'md',
  live = false,
  className,
  children,
  ...rest
}: {
  tone?: TagTone;
  /** `lg` names a page, `md` names a tile, `sm` sits inline in a row. */
  size?: keyof typeof SIZE_CLASS;
  live?: boolean;
  className?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn('tag', TONE_CLASS[tone], SIZE_CLASS[size], className)} {...rest}>
      {live && <span aria-hidden className="tag-dot" />}
      {children}
    </span>
  );
}

/** The podium in metal, everyone else plain — for a rank written as a tag. */
export function rankTone(rank: number): TagTone {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return 'ink';
}

// Spelled out for Tailwind's content scan, as above.
const PODIUM = ['rank-gold', 'rank-silver', 'rank-bronze'] as const;

/**
 * A rank as a numbered plate on the slant — gold, silver and bronze for the
 * podium, an outlined plate after. The numeral is the fact; the metal is
 * how the eye finds the top three before reading a name.
 */
export function RankPlate({ rank, className }: { rank: number; className?: string }) {
  return (
    <span className={cn('rank-plate', rank >= 1 && rank <= 3 && PODIUM[rank - 1], className)}>{rank}</span>
  );
}
