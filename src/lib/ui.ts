import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Scores read better with an explicit sign — "+12" vs "-4" vs "0". */
export function formatPoints(points: number): string {
  if (points === 0) return '0';
  const rounded = Math.round(points * 100) / 100;
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

/**
 * Tone for a point value. Both accents use their `deep` variant because these
 * are *text* on a dark surface — the base #EF4444 measures 3.89:1 on
 * `surface`, under the 4.5:1 floor, while #F87171 clears it at 5.3:1.
 *
 * Colour is never the only signal here: `formatPoints` always carries an
 * explicit +/- sign, so the meaning survives for anyone who cannot separate
 * red from gold.
 */
export function pointsTone(points: number): string {
  if (points > 0) return 'text-brand-gold-deep';
  if (points < 0) return 'text-danger-deep';
  return 'text-muted';
}

/**
 * Deterministic avatar color so the same person is the same color everywhere.
 *
 * These are all ~700-level jewel tones rather than the bright primaries this
 * list used to hold: those were left over from the light theme (one was the
 * old `lime` the rebrand removed) and glowed against the dark canvas. Every
 * one of these clears 4.5:1 against the white initials drawn on top, which the
 * lighter originals did not.
 */
const AVATAR_COLORS = [
  'bg-[#B45309]', // bronze
  'bg-[#0F766E]', // teal
  'bg-[#4338CA]', // indigo
  'bg-[#BE123C]', // rose
  'bg-[#6D28D9]', // violet — echoes brand-velvet
  'bg-[#1D4ED8]', // blue
  'bg-[#047857]', // emerald
  'bg-[#A21CAF]', // fuchsia
];

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function relativeTime(date: Date | string): string {
  const then = typeof date === 'string' ? new Date(date) : date;
  const diffMs = then.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  const format = (value: number, unit: string) => {
    const n = Math.round(value);
    const plural = n === 1 ? unit : `${unit}s`;
    return diffMs > 0 ? `in ${n} ${plural}` : `${n} ${plural} ago`;
  };

  if (abs < minute) return 'just now';
  if (abs < hour) return format(abs / minute, 'min');
  if (abs < day) return format(abs / hour, 'hour');
  return format(abs / day, 'day');
}
