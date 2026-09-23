/**
 * Ingestion contracts.
 *
 * Three layers, deliberately kept apart:
 *
 *   adapter  → parses one site's markup into that show's `RawSeasonFacts`.
 *              Knows HTML, knows nothing about EventDefinitions or our
 *              database. Declares which show it serves.
 *   mapper   → turns a show's facts into `CandidateEvent[]` using that show's
 *              rule codes. Knows the show, knows nothing about HTML.
 *   pipeline → resolves candidates against the database and publishes them.
 *              Reads only the show-agnostic part of the facts.
 *
 * A new site needs only a new adapter. A new show needs a facts shape, a
 * mapper, and a registry entry in pipeline.ts — never a pipeline change.
 */

/** A player as the source identifies them. */
export interface RawPlayerRef {
  /** The source's stable id — a slug, not a display name. */
  externalId: string;
  name: string;
  photoUrl?: string;
}

/**
 * What the pipeline needs to know about one cycle of any show: which one it
 * is, whether it has happened, and who left the game in it. Everything a
 * show adds on top (who won what, who was in danger) is that show's own
 * extension, read only by its mapper.
 */
export interface RawCycleResult {
  /** The source's own label, e.g. "W3". */
  weekLabel: string;
  weekNumber: number;
  /**
   * False for a scheduled cycle that has not aired. Decided by the adapter,
   * which knows what an empty row on its site looks like; the pipeline must
   * not guess, or a future week gets created as already settled.
   */
  aired: boolean;
  /** Everyone who left the game this cycle, whatever the show calls it. */
  eliminated: RawPlayerRef[];
  /**
   * When the cycle aired, where the source says so outright. The pipeline
   * prefers this to interpolating from elimination dates.
   */
  airsAt?: Date | null;
}

export interface RawPlacementEntry {
  /**
   * The source's row number, which is NOT a finish position — a completed
   * season lists the winner first, an in-progress one lists the most recent
   * elimination first. Use `placeLabel` for placement; never infer from this.
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
  /** Whatever else the source knows — age, hometown, tribe — stored on the contestant as is. */
  metadata?: Record<string, unknown>;
}

export interface RawSeasonFacts<TCycle extends RawCycleResult = RawCycleResult> {
  sourceSlug: string;
  sourceUrl: string;
  seasonLabel: string;
  premiereDate: Date | null;
  finaleDate: Date | null;
  weeks: TCycle[];
  /** The elimination table: who left, when, and where they finished. */
  placements: RawPlacementEntry[];
  cast: RawCastMember[];
  fetchedAt: Date;
}

// ---------------------------------------------------------------------------
// Per-show facts. Each is the generic cycle plus what that show's results
// grid actually reports.
// ---------------------------------------------------------------------------

export interface BigBrotherWeekResult extends RawCycleResult {
  hoh: RawPlayerRef[];
  veto: RawPlayerRef[];
  nominees: RawPlayerRef[];
}

export type BigBrotherSeasonFacts = RawSeasonFacts<BigBrotherWeekResult>;

/** How someone left the game, as far as the source states it. */
export interface SurvivorExit {
  player: RawPlayerRef;
  how: 'voted' | 'fire' | 'evacuated' | 'quit' | 'unknown';
}

export interface SurvivorEpisodeResult extends RawCycleResult {
  /** Every departure, with how it happened; `eliminated` holds the same players. */
  exits: SurvivorExit[];
  /** Individual immunity winners (post-merge, or a tribe swap twist). */
  immunity: RawPlayerRef[];
  /** Every member of a tribe that won immunity (pre-merge). */
  tribalImmunity: RawPlayerRef[];
  /** Individuals who won or were chosen for a reward. */
  reward: RawPlayerRef[];
  /** Every member of a tribe that won a reward (pre-merge). */
  tribalReward: RawPlayerRef[];
  /** Idols played at tribal, and whether each one actually cancelled votes. */
  idolsPlayed: Array<{ player: RawPlayerRef; negatedVotes: boolean }>;
  /** Votes received at tribal council, per player. */
  votes: Array<{ player: RawPlayerRef; count: number }>;
  /** Everyone whose vote landed on someone who went home this episode. */
  correctVoters: RawPlayerRef[];
  /** Who won the final-four fire-making challenge, when this episode had it. */
  fireMakingWinner: RawPlayerRef | null;
}

export interface SurvivorSeasonFacts extends RawSeasonFacts<SurvivorEpisodeResult> {
  /** The episode in which the tribes merged; null before it airs. */
  mergeEpisode: number | null;
  /** Votes to win at the final tribal council, per finalist. Empty until the finale. */
  juryVotes: Array<{ player: RawPlayerRef; count: number }>;
}

/** A Round Table ballot: who voted to banish whom. */
export interface TraitorsBallot {
  voter: RawPlayerRef;
  target: RawPlayerRef;
  /** Which round of voting in the episode: 1 at the Round Table, more after a tie or in the end game. */
  round: number;
  /** Whether this round of voting banished its target — a tied first round did not. */
  banished: boolean;
  /** Whether the player it banished turned out to be a Traitor at the time. */
  caughtTraitor: boolean;
}

export interface TraitorsEpisodeResult extends RawCycleResult {
  /** Murdered by the Traitors — revealed at breakfast this episode. */
  murdered: RawPlayerRef[];
  /** Banished at the Round Table or in the end game. */
  banished: RawPlayerRef[];
  /** Everyone who won a shield in this episode's missions. */
  shields: RawPlayerRef[];
  /** Named on the Traitors' murder shortlist this episode. */
  shortlisted: RawPlayerRef[];
  ballots: TraitorsBallot[];
  /** Who became a Traitor in this episode: the opening selection, a recruitment, an ultimatum. */
  newTraitors: RawPlayerRef[];
  /**
   * The Traitors in the game on the night of each murder revealed this
   * episode, once per murder — they choose together, so they share the kill.
   */
  murderers: RawPlayerRef[][];
}

export interface TraitorsSeasonFacts extends RawSeasonFacts<TraitorsEpisodeResult> {
  /** Everyone who reached the end game. Empty until the finale airs. */
  endGame: RawPlayerRef[];
}

// ---------------------------------------------------------------------------

export interface SeasonSourceAdapter<TFacts extends RawSeasonFacts = RawSeasonFacts> {
  slug: string;
  /** `Show.slug` of the show this site covers. The pipeline refuses a mismatch. */
  showSlug: string;
  /** Builds the page URL for a season's id on this source. */
  seasonUrl(seasonExternalId: string): string;
  /** Pure: parse already-fetched markup. Unit tested against fixtures. */
  parseSeason(html: string, sourceUrl: string): TFacts;
  /** Fetches and parses. The only method that touches the network. */
  fetchSeason(seasonExternalId: string): Promise<TFacts>;
}

export type SeasonMapper<TFacts extends RawSeasonFacts = RawSeasonFacts> = (
  facts: TFacts,
  seasonExternalId: string,
) => CandidateEvent[];

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
  /**
   * The value of a variable event (the order of eviction), worked out by the
   * mapper from what the source states. Absent for a fixed-value event, which
   * scores the EventDefinition's points.
   */
  points?: number;
}

/** "Winner" → 1, "Runner-Up" → 2, "9th Place" → 9. Null when unplaced. */
export function placementFromLabel(label: string): number | null {
  const value = label.trim().toLowerCase();
  if (!value) return null;
  if (value === 'winner' || value === 'sole survivor') return 1;
  if (value.startsWith('runner')) return 2;
  const match = /^(\d+)(st|nd|rd|th)/.exec(value);
  return match ? Number(match[1]) : null;
}

export const PLACEMENT_CODE_BY_LABEL: Record<string, string> = {
  winner: 'PLACEMENT_WINNER',
  'sole survivor': 'PLACEMENT_WINNER',
  'runner-up': 'PLACEMENT_RUNNER_UP',
  'runner up': 'PLACEMENT_RUNNER_UP',
  '2nd place': 'PLACEMENT_RUNNER_UP',
  '3rd place': 'PLACEMENT_THIRD',
};

export class IngestionError extends Error {
  constructor(
    message: string,
    readonly sourceSlug: string,
  ) {
    super(message);
    this.name = 'IngestionError';
  }
}
