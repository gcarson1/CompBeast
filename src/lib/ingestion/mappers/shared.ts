import { PLACEMENT_CODE_BY_LABEL, placementFromLabel } from '../types';
import type { CandidateEvent, Confidence, RawCycleResult, RawPlayerRef, RawSeasonFacts } from '../types';

/**
 * What every show's mapper does the same way: the candidate factory, the
 * final placements, and the jury cohort. Show-specific mappers compose these
 * with their own reading of the weekly grid.
 */

export type PushCandidate = (
  code: string,
  player: RawPlayerRef,
  weekNumber: number | null,
  weekLabel: string,
  confidence?: Confidence,
  reasons?: string[],
  /**
   * Distinguishes repeats of one code for one player in one cycle — the
   * third vote against someone — so each gets its own dedupe key.
   */
  refSuffix?: string,
  /** The value of a variable event; see `CandidateEvent.points`. */
  points?: number,
) => void;

export function candidateCollector(seasonExternalId: string): {
  candidates: CandidateEvent[];
  push: PushCandidate;
} {
  const candidates: CandidateEvent[] = [];
  const push: PushCandidate = (
    code,
    player,
    weekNumber,
    weekLabel,
    confidence = 'HIGH',
    reasons = [],
    refSuffix,
    points,
  ) => {
    candidates.push({
      sourceRef: `${seasonExternalId}:${weekLabel.toLowerCase()}:${code}:${player.externalId}${refSuffix ? `:${refSuffix}` : ''}`,
      eventCode: code,
      player,
      weekNumber,
      weekLabel,
      confidence,
      reasons,
      ...(points === undefined ? {} : { points }),
    });
  };
  return { candidates, push };
}

/**
 * Everyone who appears anywhere in the season — the cast list plus anyone
 * the weekly grid names — so per-cycle survival can be derived without
 * assuming the cast list is complete.
 */
export function collectPlayers<TCycle extends RawCycleResult>(
  facts: RawSeasonFacts<TCycle>,
  columns: (week: TCycle) => RawPlayerRef[][],
): Map<string, RawPlayerRef> {
  const players = new Map<string, RawPlayerRef>();
  for (const member of facts.cast) players.set(member.externalId, member);
  for (const week of facts.weeks) {
    if (!week.aired) continue;
    for (const column of columns(week)) {
      for (const player of column)
        if (!players.has(player.externalId)) players.set(player.externalId, player);
    }
  }
  return players;
}

/**
 * One survival award per aired cycle for everyone not yet eliminated by the
 * end of it.
 */
export function pushSurvival(
  facts: RawSeasonFacts,
  players: Map<string, RawPlayerRef>,
  code: string,
  push: PushCandidate,
): void {
  const gone = new Set<string>();
  const aired = facts.weeks.filter((week) => week.aired).sort((a, b) => a.weekNumber - b.weekNumber);
  for (const week of aired) {
    for (const player of week.eliminated) gone.add(player.externalId);
    for (const [externalId, player] of players) {
      if (gone.has(externalId)) continue;
      push(code, player, week.weekNumber, week.weekLabel);
    }
  }
}

/**
 * The order of eviction, scored: every houseguest who left costs one point
 * for each houseguest who finished ahead of them — the first of seventeen out
 * is recorded at −16, the runner-up at −1, the winner not at all. Pinned to
 * the cycle they left in (the finale's cycle for the runner-up), and read from
 * the placement table, so a double eviction still gives each evictee their
 * own place in the order.
 */
export function pushEvictionOrder(
  facts: RawSeasonFacts,
  players: Map<string, RawPlayerRef>,
  code: string,
  push: PushCandidate,
): void {
  const aired = facts.weeks.filter((week) => week.aired);
  const finalWeek = aired.at(-1);
  const leftIn = new Map<string, RawCycleResult>();
  for (const week of aired) {
    for (const player of week.eliminated) leftIn.set(player.externalId, week);
  }

  for (const entry of facts.placements) {
    const placement = placementFromLabel(entry.placeLabel);
    if (placement === null || placement < 2) continue;
    const week = leftIn.get(entry.player.externalId) ?? finalWeek;
    if (!week) continue;
    const player = players.get(entry.player.externalId) ?? entry.player;
    push(code, player, week.weekNumber, week.weekLabel, 'HIGH', [], undefined, -(placement - 1));
  }
}

/**
 * Final placements and the jury cohort, both pinned to the last aired cycle.
 *
 * Jury membership is derived rather than assumed. Neither obvious signal
 * works alone: the placement table's row numbers count from the winner on a
 * finished season but from the latest elimination on a live one, so a
 * threshold over them means different things at different times; and the
 * cast's status tag prefers the more notable label (a fan favourite who also
 * sat on the jury is tagged as the favourite), so filtering on it drops real
 * jury members. Instead: take the worst finish among players the source does
 * tag as jury and treat that as the boundary. The cohort comes out of the
 * data rather than a hardcoded jury size that varies by season.
 */
export function pushPlacementsAndJury(
  facts: RawSeasonFacts,
  players: Map<string, RawPlayerRef>,
  push: PushCandidate,
): void {
  const finalWeek = facts.weeks.filter((week) => week.aired).at(-1);
  const finalWeekLabel = finalWeek?.weekLabel ?? 'season';
  const finalWeekNumber = finalWeek?.weekNumber ?? null;

  for (const entry of facts.placements) {
    const code = PLACEMENT_CODE_BY_LABEL[entry.placeLabel.trim().toLowerCase()];
    if (code) push(code, entry.player, finalWeekNumber, finalWeekLabel);
  }

  const placementByPlayer = new Map<string, number>();
  for (const entry of facts.placements) {
    const placement = placementFromLabel(entry.placeLabel);
    if (placement !== null) placementByPlayer.set(entry.player.externalId, placement);
  }

  const taggedJuryPlacements = facts.cast
    .filter((member) => member.statusLabel?.trim().toLowerCase() === 'jury')
    .map((member) => placementByPlayer.get(member.externalId))
    .filter((placement): placement is number => placement !== undefined);

  if (taggedJuryPlacements.length === 0) return;

  const juryBoundary = Math.max(...taggedJuryPlacements);
  for (const [externalId, placement] of placementByPlayer) {
    if (placement > juryBoundary) continue;
    const player = players.get(externalId);
    if (player) push('REACHED_JURY', player, finalWeekNumber, finalWeekLabel);
  }
}
