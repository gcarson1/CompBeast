/**
 * Presentation metadata about shows, keyed by `Show.slug`.
 *
 * Shows are rows in the database; what this module holds is the part of a
 * show that is about *how it looks on this site* — its accent colours, the
 * hashtag its fans use, which of its events the landing page should lead
 * with. None of it belongs in the rule catalogue the seed consumes, and none
 * of it needs a migration to change. A show with no entry here still works:
 * every lookup falls back to the platform default.
 */

/**
 * The show the site leads with when nothing narrows it down — the signed-out
 * landing page with no airing season, the rule book fallback. One constant so
 * the choice is made in one place rather than as a scattered string literal.
 */
export const FLAGSHIP_SHOW_SLUG = 'big-brother';

export interface ShowTheme {
  /** Fill for stickers and small accents. Dark ink (`on-gold`) goes on it. */
  accent: string;
  /** The same hue as text on the dark surfaces — must clear 4.5:1 on canvas. */
  accentDeep: string;
  /** The accent at ~16%, for tinted backgrounds behind accent text. */
  accentSoft: string;
  /** The hover bloom, for tiles that lift. */
  glow: string;
}

/**
 * The brand palette (see tailwind.config.ts) is the default: gold is the
 * site's own colour and anything not in this map simply wears it. The two
 * shows are given a hue each so a league page reads as that show's league at
 * a glance, without repainting the whole app.
 */
export const DEFAULT_THEME: ShowTheme = {
  accent: '#F59E0B',
  accentDeep: '#FBBF24',
  accentSoft: 'rgba(245,158,11,0.16)',
  glow: 'rgba(245,158,11,0.45)',
};

const SHOW_THEMES: Record<string, ShowTheme> = {
  // The neon house: electric sky blue. #7DD3FC on the canvas is 10.6:1.
  'big-brother': {
    accent: '#38BDF8',
    accentDeep: '#7DD3FC',
    accentSoft: 'rgba(56,189,248,0.16)',
    glow: 'rgba(56,189,248,0.45)',
  },
  // Torch fire: ember orange. #FDBA74 on the canvas is 9.9:1.
  survivor: {
    accent: '#F97316',
    accentDeep: '#FDBA74',
    accentSoft: 'rgba(249,115,22,0.16)',
    glow: 'rgba(249,115,22,0.45)',
  },
};

export function themeFor(showSlug: string | null | undefined): ShowTheme {
  return (showSlug && SHOW_THEMES[showSlug]) || DEFAULT_THEME;
}

/**
 * The community hashtag for a season.
 *
 * Fans do not always tag a season the way its slug would suggest, so a known
 * season can be pinned here and wins over the derivation. Everything else is
 * derived from the season's slug: the show's initials when it has a common
 * abbreviation, otherwise its name run together, then the season number.
 */
const HASHTAG_OVERRIDES: Record<string, string> = {
  'big-brother-28': 'BB28',
};

const SHOW_TAG_PREFIX: Record<string, string> = {
  'big-brother': 'BB',
  survivor: 'Survivor',
};

export function hashtagFor(showSlug: string, seasonSlug: string): string {
  const pinned = HASHTAG_OVERRIDES[seasonSlug];
  if (pinned) return pinned;

  const number = /(\d+)$/.exec(seasonSlug)?.[1] ?? '';
  const prefix =
    SHOW_TAG_PREFIX[showSlug] ??
    showSlug
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  return `${prefix}${number}`;
}

/**
 * The events the landing page's scoring table shows for a show, in this
 * order: the ones every viewer already knows, then one only the drama ruleset
 * scores, so the dash column is visibly a choice and not missing data. The
 * first `HEADLINE_EVENT_COUNT` also make the prose example. Codes absent from
 * the rule book are skipped, so the table is never wrong, only shorter.
 */
const SHOWCASE_EVENTS: Record<string, string[]> = {
  'big-brother': [
    'HOH_WIN',
    'VETO_WIN',
    'NOMINATED',
    'WEEK_SURVIVED',
    'REACHED_JURY',
    'PLACEMENT_WINNER',
    'JURY_VOTE_RECEIVED',
    'CONFRONTATION_WIN',
    'CRIED',
  ],
  survivor: [
    'IMMUNITY_WIN',
    'IDOL_PLAYED_SUCCESSFULLY',
    'VOTE_RECEIVED',
    'EPISODE_SURVIVED',
    'MADE_MERGE',
    'PLACEMENT_WINNER',
    'JURY_VOTE_RECEIVED',
    'BLINDSIDE_ORCHESTRATED',
    'CRIED',
  ],
};

export const HEADLINE_EVENT_COUNT = 6;

export function showcaseEventsFor(showSlug: string): string[] {
  return SHOWCASE_EVENTS[showSlug] ?? ['REACHED_JURY', 'JURY_VOTE_RECEIVED', 'PLACEMENT_WINNER'];
}
