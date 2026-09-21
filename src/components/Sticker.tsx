import { Children, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/ui';

type Tone = 'paper' | 'gold' | 'lavender' | 'mint' | 'sky' | 'ink' | 'red';

// Spelled out so Tailwind's content scan finds every class; a template
// string here would leave the unused tones out of the stylesheet.
const TONE_CLASS: Record<Tone, string> = {
  paper: '',
  gold: 'sticker-gold',
  lavender: 'sticker-lavender',
  mint: 'sticker-mint',
  sky: 'sticker-sky',
  ink: 'sticker-ink',
  red: 'sticker-red',
};

/**
 * One set of angles per side, in half-degree steps between 2° and 6½°.
 * Under 2° reads as a rendering error; over 6½° as a mistake; and a page
 * where every tag sits at the same 4° reads as copy-and-paste, which is
 * why the angle is picked per sticker rather than fixed per side.
 */
const LEFT = [-2.5, -3.5, -4.5, -5.5, -6.5];
const RIGHT = [2, 3, 4, 5, 6.5];

/**
 * A die-cut status badge (`.sticker` in globals.css): the sticker-book
 * version of `.pill`, and bound by the same rule — it is never a control.
 *
 * `tilt` is a side; the exact angle is derived from `seed` (or, failing
 * that, the label text) so it is stable across renders — the server and
 * the client agree, and the same tag lands the same way on every visit —
 * while two tags on one page almost never match. Pass an explicit number
 * to place one by hand. A `.card-lift` parent straightens it on hover.
 */
export function Sticker({
  tone = 'paper',
  tilt,
  seed,
  className,
  style,
  children,
  ...rest
}: {
  tone?: Tone;
  tilt?: 'l' | 'r' | number;
  /** Varies the angle between stickers that share a label (rank tags, "+5"s). */
  seed?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
} & HTMLAttributes<HTMLSpanElement>) {
  const label = textOf(children);
  const angle = typeof tilt === 'number' ? tilt : tilt ? angleFor(`${seed ?? ''}${label}`, tilt, label) : 0;

  return (
    <span
      className={cn('sticker', TONE_CLASS[tone], className)}
      // `--sticker-angle`, not `--sticker-tilt`: an inline custom property
      // would beat the `.card-lift:hover` rule that levels the tag, so the
      // angle goes in one variable and the hover rule wins on the other.
      style={angle ? { ...style, ['--sticker-angle' as string]: `${angle}deg` } : style}
      {...rest}
    >
      {children}
    </span>
  );
}

/**
 * The seed is `seed + label`, so the label's length is in it too: a long
 * tag — a sentence-length eyebrow — is held to the gentler half of the
 * set, because a 6° slant on 250px of text drops one end a quarter of a
 * line and reads as crooked rather than stuck on.
 */
function angleFor(seed: string, side: 'l' | 'r', label: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const full = side === 'l' ? LEFT : RIGHT;
  const set = label.length > 18 ? full.slice(0, 3) : full;
  return set[hash % set.length];
}

function textOf(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
    .join('');
}
