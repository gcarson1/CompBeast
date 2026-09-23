/**
 * Show vocabulary for the UI.
 *
 * The platform core says "contestant", "cycle" and "eliminated". A show's
 * fans do not — they say houseguest, castaway, player, week, episode,
 * evicted, voted out, banished — and copy that uses the generic word on a
 * show page reads as written by someone who has never watched it. Every
 * show-scoped page reads its words from here instead of hardcoding one
 * show's.
 *
 * Resolution is layered: the platform default, then the vocabulary this
 * module knows for the slug, then whatever `Show.lexicon` holds in the
 * database. The middle layer is what keeps a deployed database that predates
 * a new key from falling back to the generic word for a show we know; the
 * last layer is what lets an operator change a word without a release.
 */

export interface ShowLexicon {
  cycleSingular: string;
  cyclePlural: string;
  contestantSingular: string;
  contestantPlural: string;
  /** Past participle, used as a status label: "Evicted", "Voted out". */
  eliminationVerb: string;
  /** Status label for someone still playing: "In the house". */
  activeLabel: string;
  /** The place the game happens, with its article: "the house", "the island". */
  arena: string;
  /** The show's phrase for "might go home this cycle": "on the block". */
  atRiskLabel: string;
}

export const DEFAULT_LEXICON: ShowLexicon = {
  cycleSingular: 'Round',
  cyclePlural: 'Rounds',
  contestantSingular: 'Contestant',
  contestantPlural: 'Contestants',
  eliminationVerb: 'Eliminated',
  activeLabel: 'Still in the game',
  arena: 'the game',
  atRiskLabel: 'at risk',
};

export const BIG_BROTHER_LEXICON: ShowLexicon = {
  cycleSingular: 'Week',
  cyclePlural: 'Weeks',
  contestantSingular: 'Houseguest',
  contestantPlural: 'Houseguests',
  eliminationVerb: 'Evicted',
  activeLabel: 'In the house',
  arena: 'the house',
  atRiskLabel: 'on the block',
};

export const SURVIVOR_LEXICON: ShowLexicon = {
  cycleSingular: 'Episode',
  cyclePlural: 'Episodes',
  contestantSingular: 'Castaway',
  contestantPlural: 'Castaways',
  eliminationVerb: 'Voted out',
  activeLabel: 'Still in the game',
  arena: 'the island',
  atRiskLabel: 'in danger at tribal',
};

export const TRAITORS_LEXICON: ShowLexicon = {
  cycleSingular: 'Episode',
  cyclePlural: 'Episodes',
  contestantSingular: 'Player',
  contestantPlural: 'Players',
  eliminationVerb: 'Banished',
  activeLabel: 'In the castle',
  arena: 'the castle',
  atRiskLabel: 'on the murder shortlist',
};

const KNOWN_LEXICONS: Record<string, ShowLexicon> = {
  'big-brother': BIG_BROTHER_LEXICON,
  survivor: SURVIVOR_LEXICON,
  traitors: TRAITORS_LEXICON,
};

const KEYS = Object.keys(DEFAULT_LEXICON) as Array<keyof ShowLexicon>;

/**
 * The vocabulary for a show. `stored` is `Show.lexicon` as Prisma hands it
 * over — untyped JSON, possibly null, possibly written by an older seed with
 * fewer keys — so only string values under known keys are taken from it.
 */
export function lexiconFor(showSlug: string, stored?: unknown): ShowLexicon {
  const result: ShowLexicon = { ...DEFAULT_LEXICON, ...(KNOWN_LEXICONS[showSlug] ?? {}) };
  if (stored && typeof stored === 'object') {
    const record = stored as Record<string, unknown>;
    for (const key of KEYS) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) result[key] = value;
    }
  }
  return result;
}

/** "Houseguest" → "houseguest", for mid-sentence use. */
export function lower(word: string): string {
  return word.charAt(0).toLowerCase() + word.slice(1);
}

/**
 * How a contestant left, as a status label. A source that knows the
 * difference — voted out, lost fire-making, evacuated, quit — writes it to
 * the contestant's metadata as `exit`; the show's general verb is the
 * fallback for one that does not.
 */
export function eliminationLabel(lexicon: ShowLexicon, metadata: unknown): string {
  const exit = (metadata as { exit?: unknown } | null)?.exit;
  return typeof exit === 'string' && exit.trim() ? exit : lexicon.eliminationVerb;
}
