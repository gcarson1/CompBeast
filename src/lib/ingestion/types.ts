/**
 * Ingestion contracts.
 *
 * Three layers, deliberately kept apart:
 *
 *   adapter  → parses one site's markup into `RawSeasonFacts`. Knows HTML,
 *              knows nothing about EventDefinitions or our database.
 *   mapper   → turns `RawSeasonFacts` into `CandidateEvent[]` using a show's
 *              rule codes. Knows the show, knows nothing about HTML.
 *   pipeline → resolves candidates against the database and publishes them.
 *
 * A new site needs only a new adapter. A new show needs only a new mapper.
 */

/** A player as the source identifies them. */
export interface RawPlayerRef {
  /** The source's stable id — a slug, not a display name. */
  externalId: string;
  name: string;
  photoUrl?: string;
}

export interface RawWeekResult {
  /** The source's own label, e.g. "W3". */
  weekLabel: string;
  weekNumber: number;
  hoh: RawPlayerRef[];
  veto: RawPlayerRef[];
  nominees: RawPlayerRef[];
  evicted: RawPlayerRef[];
}

export interface RawEvictionEntry {
  /**
   * The source's row number, which is NOT a finish position — a completed
   * season lists the winner first, an in-progress one lists the most recent
   * eviction first. Use `placeLabel` for placement; never infer from this.
   */
  order: number | null;
  player: RawPlayerRef;
  dateLabel: string;
  dayLabel: string;
  placeLabel: string;
}

export interface RawCastMember extends RawPlayerRef {
  /** Source's status tag, e.g. "Winner", "Jury", "Out". */
  statusLabel: string | null;
  placeLabel: string | null;
}

export interface RawSeasonFacts {
  sourceSlug: string;
  sourceUrl: string;
  seasonLabel: string;
  premiereDate: Date | null;
  finaleDate: Date | null;
  weeks: RawWeekResult[];
  evictionOrder: RawEvictionEntry[];
  cast: RawCastMember[];
  fetchedAt: Date;
}

/** True when a week's grid is entirely empty — a scheduled week that has not aired. */
export function isEmptyWeek(week: RawWeekResult): boolean {
  return (
    week.hoh.length === 0 && week.veto.length === 0 && week.nominees.length === 0 && week.evicted.length === 0
  );
}

export interface SeasonSourceAdapter {
  slug: string;
  /** Builds the page URL for a season's id on this source. */
  seasonUrl(seasonExternalId: string): string;
  /** Pure: parse already-fetched markup. Unit tested against fixtures. */
  parseSeason(html: string, sourceUrl: string): RawSeasonFacts;
  /** Fetches and parses. The only method that touches the network. */
  fetchSeason(seasonExternalId: string): Promise<RawSeasonFacts>;
}

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

/** A proposed scoring event, before it is resolved against the database. */
export interface CandidateEvent {
  /** Stable identity for this fact, used to dedupe across re-syncs. */
  sourceRef: string;
  eventCode: string;
  player: RawPlayerRef;
  /** Null when the event belongs to the season rather than one week. */
  weekNumber: number | null;
  weekLabel: string;
  confidence: Confidence;
  /** Why confidence is below HIGH. Empty for clean matches. */
  reasons: string[];
}

export class IngestionError extends Error {
  constructor(
    message: string,
    readonly sourceSlug: string,
  ) {
    super(message);
    this.name = 'IngestionError';
  }
}
