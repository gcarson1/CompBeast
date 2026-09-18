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

export function pointsTone(points: number): string {
  if (points > 0) return 'text-brand-gold-deep';
  if (points < 0) return 'text-danger';
  return 'text-muted';
}

/** Deterministic avatar color so the same person is the same color everywhere. */
const AVATAR_COLORS = [
  'bg-[#f5a524]',
  'bg-[#8fd11a]',
  'bg-[#3d8bf0]',
  'bg-[#c14ef0]',
  'bg-[#f0574e]',
  'bg-[#14b8a6]',
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
