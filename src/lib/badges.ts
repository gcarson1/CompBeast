/**
 * Badges for lifetime points.
 *
 * Derived, never stored: a badge is a pure function of the account's total
 * points, so there is no row to fall out of sync with the ledger and nothing
 * to backfill for accounts that existed before badges did. The total itself
 * comes from `getAccountOverview`, which counts closed leagues through
 * `CareerRecord` — a badge earned in a league that was later deleted stays
 * earned.
 *
 * The thresholds are set against real numbers, not round ones. In the
 * completed Big Brother 27 season the average contestant scored about 52
 * points under Classic rules, so a default five-player roster comes out
 * near 260 for a season and a very good one near 600. The ladder is: your
 * first points, a third of a season, a full season, two seasons, four, and a
 * decade of play at the top. The names are the arc of any reality
 * competition — make the cast, win a comp, run the game, reach the jury,
 * make the finale — so they read the same to a Big Brother fan and a
 * Survivor fan, and no show's word is borrowed for an account-wide ladder.
 */

export interface Badge {
  slug: string;
  name: string;
  /** Lifetime points at which the badge is earned. */
  threshold: number;
  /** One line, in the second person, for the tile and the alert. */
  blurb: string;
}

/** Ascending by threshold; the order the shelf renders in. */
export const BADGES: readonly Badge[] = [
  {
    slug: 'castmate',
    name: 'Castmate',
    threshold: 1,
    blurb: "You're on the cast. Your first points are on the board.",
  },
  {
    slug: 'comp-winner',
    name: 'Comp Winner',
    threshold: 100,
    blurb: 'A hundred lifetime points — about a third of a season.',
  },
  {
    slug: 'power-player',
    name: 'Power Player',
    threshold: 250,
    blurb: 'A full season of scoring, or one very good roster.',
  },
  {
    slug: 'jury-member',
    name: 'Jury Member',
    threshold: 500,
    blurb: 'Two seasons deep. You have seen a finale from the inside.',
  },
  {
    slug: 'finalist',
    name: 'Finalist',
    threshold: 1000,
    blurb: 'A thousand points. Four seasons, or two dominant ones.',
  },
  {
    slug: 'comp-beast',
    name: 'Comp Beast',
    threshold: 2500,
    blurb: 'A decade of play. The badge the app is named after.',
  },
];

export function earnedBadges(points: number): Badge[] {
  return BADGES.filter((badge) => points >= badge.threshold);
}

export function highestBadge(points: number): Badge | null {
  return earnedBadges(points).at(-1) ?? null;
}

export interface BadgeProgress {
  badge: Badge;
  /** Points still needed; always positive. */
  remaining: number;
  /** 0–1 progress from the previous tier's threshold (or zero) to this one. */
  fraction: number;
}

/** The next tier to reach, or null once every badge is earned. */
export function nextBadge(points: number): BadgeProgress | null {
  const index = BADGES.findIndex((badge) => points < badge.threshold);
  if (index === -1) return null;
  const badge = BADGES[index];
  const floor = index === 0 ? 0 : BADGES[index - 1].threshold;
  const span = badge.threshold - floor;
  return {
    badge,
    remaining: Math.round((badge.threshold - points) * 100) / 100,
    fraction: Math.min(1, Math.max(0, (points - floor) / span)),
  };
}
