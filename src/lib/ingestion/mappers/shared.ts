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
 * The aired cycles that are over, and so safe to reward survival in.
 *
 * A cycle reaches the page before it has finished: a Big Brother week has its
 * HOH days before its eviction, and a Wikipedia episode row fills in over the
 * hours after it airs. Anything that pays for still being in the game has to
 * wait for the result that ends the cycle, or it pays the person about to
 * leave — Big Brother 28 paid two houseguests "survive the week" in the week
 * they were evicted. `closes` is the show's ending result (an eviction, a
 * banishment); a cycle is also over once a later one has begun, or once the
 * season has a winner.
 */
export function settledCycles<TCycle extends RawCycleResult>(
  facts: RawSeasonFacts<TCycle>,
  closes: (cycle: TCycle) => boolean,
): Set<number> {
  const aired = facts.weeks.filter((week) => week.aired).sort((a, b) => a.weekNumber - b.weekNumber);
  const seasonOver = facts.placements.some((entry) => placementFromLabel(entry.placeLabel) === 1);
  const settled = new Set<number>();
  aired.forEach((week, index) => {
    if (seasonOver || index < aired.length - 1 || closes(week)) settled.add(week.weekNumber);
  });
  return settled;
}

/**
 * One survival award per settled cycle for everyone not yet eliminated by the
 * end of it.
 */
export function pushSurvival(
  facts: RawSeasonFacts,
  players: Map<string, RawPlayerRef>,
  code: string,
  push: PushCandidate,
  settled: Set<number>,
): void {
  const gone = new Set<string>();
  const aired = facts.weeks.filter((week) => week.aired).sort((a, b) => a.weekNumber - b.weekNumber);
  for (const week of aired) {
    if (!settled.has(week.weekNumber)) break;
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
    // The runner-up leaves on finale night, not in a week's eviction. Anyone
    // else the grid never shows leaving cannot be placed in time, and a guess
    // at "the latest week" would move every week.
    const week = leftIn.get(entry.player.externalId) ?? (placement === 2 ? finalWeek : undefined);
    if (!week) continue;
    const player = players.get(entry.player.externalId) ?? entry.player;
    push(code, player, week.weekNumber, week.weekLabel, 'HIGH', [], undefined, -(placement - 1));
  }
}

/** Final placements, pinned to the last aired cycle — the finale. */
export function pushPlacements(facts: RawSeasonFacts, push: PushCandidate): void {
  const finalWeek = facts.weeks.filter((week) => week.aired).at(-1);
  if (!finalWeek) return;
  for (const entry of facts.placements) {
    const code = PLACEMENT_CODE_BY_LABEL[entry.placeLabel.trim().toLowerCase()];
    if (code) push(code, entry.player, finalWeek.weekNumber, finalWeek.weekLabel);
  }
}

/**
 * The jury, scored once for everyone in it, in the cycle it began.
 *
 * Once the first juror leaves, everyone still in the game will either join
 * the jury or sit in front of it — so they have all reached it, and are paid
 * then, together, rather than one by one as they leave. Paying on the way
 * out handed each juror a lump that the players still in the game had not
 * had yet, which made the middle of the season read as if the evicted were
 * winning it; and pinning the award to "the latest cycle" gave it a new
 * dedupe key every week, so a live sync paid every juror again each week.
 *
 * Membership is derived rather than assumed. Neither obvious signal works
 * alone: the placement table's row numbers count from the winner on a
 * finished season but from the latest elimination on a live one, and the
 * cast's status tag prefers the more notable label (a fan favourite who also
 * sat on the jury is tagged as the favourite), so filtering on it drops real
 * jurors. Instead, the worst finish among players the source does tag as
 * jury is the boundary: everyone who finished at or above it is in, and so is
 * everyone who has not finished yet. The first cycle in which someone inside
 * the boundary left is when the jury began.
 */
export function pushJury(
  facts: RawSeasonFacts,
  players: Map<string, RawPlayerRef>,
  push: PushCandidate,
): void {
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
  const boundary = Math.max(...taggedJuryPlacements);

  const aired = facts.weeks.filter((week) => week.aired).sort((a, b) => a.weekNumber - b.weekNumber);
  const juryBegan = aired.find((week) =>
    week.eliminated.some((player) => (placementByPlayer.get(player.externalId) ?? Infinity) <= boundary),
  );
  if (!juryBegan) return;

  const everEliminated = new Set(aired.flatMap((week) => week.eliminated.map((p) => p.externalId)));
  for (const [externalId, player] of players) {
    const placement = placementByPlayer.get(externalId);
    const inJury = placement === undefined ? !everEliminated.has(externalId) : placement <= boundary;
    if (inJury) push('REACHED_JURY', player, juryBegan.weekNumber, juryBegan.weekLabel);
  }
}
