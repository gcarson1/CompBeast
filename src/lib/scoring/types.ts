/**
 * Scoring engine types.
 *
 * Deliberately free of Prisma imports: the engine is a pure function over
 * plain data so it can be unit tested, run in an edge function, or reused by a
 * background worker without a database connection. The repository layer is
 * responsible for mapping Prisma rows (including Decimal) into these shapes.
 */

export type EventCategory = 'COMPETITION_GAMEPLAY' | 'ELIMINATION_ENDGAME' | 'SOCIAL_DRAMA';

/** One rule as it applies inside a specific ruleset, with overrides resolved. */
export interface ScoringRule {
  eventDefinitionId: string;
  code: string;
  label: string;
  category: EventCategory;
  /** Effective point value for this ruleset (override already applied). */
  points: number;
  /**
   * The ruleset's own value for this event, when it sets one — Balanced's +5
   * for an HOH, Lauren's Way's −3 for a nomination. It always wins: it is what
   * the league chose, and the ledger's snapshot only records the catalogue's
   * value at the time.
   */
  override: number | null;
  /**
   * The value is set per occurrence (order of eviction), so the recorded
   * value is the value — there is no catalogue value to restate it to.
   */
  variable: boolean;
}

export interface ResolvedRuleset {
  id: string;
  slug: string;
  name: string;
  /** Keyed by eventDefinitionId. Absence means the event is not scored here. */
  rules: Map<string, ScoringRule>;
}

export interface ScoredEventInput {
  id: string;
  contestantId: string;
  eventDefinitionId: string;
  cycleId: string;
  /** Point value snapshotted when the event was recorded. */
  pointsAwarded: number;
  isVoided: boolean;
  occurredAt: Date;
}

/** A contestant's membership on a team, scoped to a single cycle. */
export interface RosterAssignment {
  teamId: string;
  contestantId: string;
  cycleId: string;
}

export interface CycleRef {
  id: string;
  label: string;
  sequence: number;
}

export interface TeamRef {
  id: string;
  name: string;
  ownerName?: string | null;
}

/**
 * Which point value wins when the ledger snapshot disagrees with the
 * catalogue's current value. A ruleset's own override wins in both modes —
 * the snapshot records the catalogue value at the time, not the league's.
 *
 * - `snapshot` (default): honor the value recorded at the time. Settled weeks
 *   never move under players' feet because a catalogue value was edited.
 * - `ruleset`: re-resolve every fixed-value event against the live catalogue.
 *   This is the retroactive-correction path — used when a rule value is
 *   genuinely wrong and the league wants history restated. A variable event
 *   keeps its recorded value: there is nothing to restate it to.
 */
export type PointsSource = 'snapshot' | 'ruleset';

export interface AggregateOptions {
  pointsSource?: PointsSource;
  /** Ignore cycles after this sequence. Used for "standings as of week N". */
  throughCycleSequence?: number;
  /** Include voided events in the output breakdown (never in totals). */
  includeVoided?: boolean;
}

export interface ScoreLine {
  scoredEventId: string;
  cycleId: string;
  contestantId: string;
  eventDefinitionId: string;
  code: string;
  label: string;
  category: EventCategory;
  points: number;
  occurredAt: Date;
  isVoided: boolean;
  /** True when `points` differs from the stored snapshot — a ruleset override, or a restatement. */
  wasRestated: boolean;
}

export interface ContestantBreakdown {
  contestantId: string;
  points: number;
  lines: ScoreLine[];
}

export interface CycleBreakdown {
  cycleId: string;
  sequence: number;
  label: string;
  points: number;
  lines: ScoreLine[];
}

export interface TeamScore {
  teamId: string;
  teamName: string;
  totalPoints: number;
  rank: number;
  /** Points earned in the most recent cycle that has any scoring. */
  lastCyclePoints: number;
  cycles: CycleBreakdown[];
  contestants: ContestantBreakdown[];
}

export interface LeagueScoreSnapshot {
  rulesetId: string;
  rulesetName: string;
  pointsSource: PointsSource;
  computedAt: Date;
  teams: TeamScore[];
  /** Events that could not be attributed to any team (unrostered contestant). */
  unattributedEventIds: string[];
  /** Events whose EventDefinition is not part of the league's ruleset. */
  outOfRulesetEventIds: string[];
}
