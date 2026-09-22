import type {
  AggregateOptions,
  ContestantBreakdown,
  CycleBreakdown,
  CycleRef,
  LeagueScoreSnapshot,
  ResolvedRuleset,
  RosterAssignment,
  ScoreLine,
  ScoredEventInput,
  ScoringRule,
  TeamRef,
  TeamScore,
} from './types';

export interface AggregateInput {
  teams: TeamRef[];
  cycles: CycleRef[];
  roster: RosterAssignment[];
  events: ScoredEventInput[];
  ruleset: ResolvedRuleset;
  options?: AggregateOptions;
}

/**
 * Points are authored as small decimals (whole numbers and halves). Summing
 * them as IEEE floats accumulates drift, so every sum funnels through here.
 */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Core aggregation.
 *
 * Show-agnostic by construction: the only thing it knows about a "rule" is a
 * point value keyed by eventDefinitionId. Big Brother's HOH win and Survivor's
 * immunity idol play are indistinguishable to this function, which is the whole
 * point of the EventDefinition indirection.
 *
 * Attribution rule: an event counts for a team only if that team rostered the
 * contestant *in the cycle the event belongs to*. That is what makes weekly
 * roster locks meaningful and what keeps a mid-season roster change from
 * retroactively stealing or donating points.
 */
export function aggregateTeamScores({
  teams,
  cycles,
  roster,
  events,
  ruleset,
  options = {},
}: AggregateInput): LeagueScoreSnapshot {
  const { pointsSource = 'snapshot', throughCycleSequence, includeVoided = false } = options;

  const cycleById = new Map(cycles.map((c) => [c.id, c]));

  // cycleId -> contestantId -> teamIds. A list rather than a single id because
  // nothing in the engine should assume exclusive rostering; formats where a
  // contestant can appear on several teams still aggregate correctly.
  const ownership = new Map<string, Map<string, string[]>>();
  for (const slot of roster) {
    let byContestant = ownership.get(slot.cycleId);
    if (!byContestant) {
      byContestant = new Map();
      ownership.set(slot.cycleId, byContestant);
    }
    const owners = byContestant.get(slot.contestantId);
    if (owners) owners.push(slot.teamId);
    else byContestant.set(slot.contestantId, [slot.teamId]);
  }

  const accumulators = new Map<string, TeamAccumulator>(
    teams.map((team) => [team.id, createAccumulator(team)]),
  );

  const unattributedEventIds: string[] = [];
  const outOfRulesetEventIds: string[] = [];

  for (const event of events) {
    const cycle = cycleById.get(event.cycleId);
    if (!cycle) continue;
    if (throughCycleSequence !== undefined && cycle.sequence > throughCycleSequence) continue;

    const rule = ruleset.rules.get(event.eventDefinitionId);
    if (!rule) {
      outOfRulesetEventIds.push(event.id);
      continue;
    }

    const owners = ownership.get(event.cycleId)?.get(event.contestantId);
    if (!owners || owners.length === 0) {
      unattributedEventIds.push(event.id);
      continue;
    }

    // The league's own value first; then, only when restating, the live
    // catalogue value; otherwise what was recorded.
    const restate = pointsSource === 'ruleset' && !rule.variable;
    const points = rule.override ?? (restate ? rule.points : event.pointsAwarded);

    const line: ScoreLine = {
      scoredEventId: event.id,
      cycleId: event.cycleId,
      contestantId: event.contestantId,
      eventDefinitionId: event.eventDefinitionId,
      code: rule.code,
      label: rule.label,
      category: rule.category,
      points,
      occurredAt: event.occurredAt,
      isVoided: event.isVoided,
      wasRestated: points !== event.pointsAwarded,
    };

    // Voided events are excluded from totals but can be surfaced in the
    // breakdown so a player can see *why* their score changed after an audit.
    if (event.isVoided && !includeVoided) continue;
    const contributes = !event.isVoided;

    for (const teamId of owners) {
      const acc = accumulators.get(teamId);
      if (!acc) continue;
      pushLine(acc, cycle, line, contributes);
    }
  }

  const scored = [...accumulators.values()].map((acc) => finalizeTeam(acc));
  rankTeams(scored);

  return {
    rulesetId: ruleset.id,
    rulesetName: ruleset.name,
    pointsSource,
    computedAt: new Date(),
    teams: scored,
    unattributedEventIds,
    outOfRulesetEventIds,
  };
}

interface TeamAccumulator {
  team: TeamRef;
  total: number;
  cycles: Map<string, CycleBreakdown>;
  contestants: Map<string, ContestantBreakdown>;
}

function createAccumulator(team: TeamRef): TeamAccumulator {
  return { team, total: 0, cycles: new Map(), contestants: new Map() };
}

function pushLine(acc: TeamAccumulator, cycle: CycleRef, line: ScoreLine, contributes: boolean): void {
  let cycleBucket = acc.cycles.get(cycle.id);
  if (!cycleBucket) {
    cycleBucket = { cycleId: cycle.id, sequence: cycle.sequence, label: cycle.label, points: 0, lines: [] };
    acc.cycles.set(cycle.id, cycleBucket);
  }
  cycleBucket.lines.push(line);

  let contestantBucket = acc.contestants.get(line.contestantId);
  if (!contestantBucket) {
    contestantBucket = { contestantId: line.contestantId, points: 0, lines: [] };
    acc.contestants.set(line.contestantId, contestantBucket);
  }
  contestantBucket.lines.push(line);

  if (!contributes) return;
  acc.total = round2(acc.total + line.points);
  cycleBucket.points = round2(cycleBucket.points + line.points);
  contestantBucket.points = round2(contestantBucket.points + line.points);
}

function finalizeTeam(acc: TeamAccumulator): TeamScore {
  const cycles = [...acc.cycles.values()].sort((a, b) => a.sequence - b.sequence);
  for (const cycle of cycles) {
    cycle.lines.sort(sortLines);
  }

  const contestants = [...acc.contestants.values()].sort((a, b) => b.points - a.points);
  for (const contestant of contestants) {
    contestant.lines.sort(sortLines);
  }

  return {
    teamId: acc.team.id,
    teamName: acc.team.name,
    totalPoints: acc.total,
    rank: 0,
    lastCyclePoints: cycles.length > 0 ? cycles[cycles.length - 1].points : 0,
    cycles,
    contestants,
  };
}

function sortLines(a: ScoreLine, b: ScoreLine): number {
  const byTime = a.occurredAt.getTime() - b.occurredAt.getTime();
  return byTime !== 0 ? byTime : a.scoredEventId.localeCompare(b.scoredEventId);
}

/**
 * Mutates `teams` in place: sorts by standing and assigns ranks, sharing a rank
 * across ties (1, 2, 2, 4) so the leaderboard never invents a winner where the
 * league's own rules would call for a tiebreak.
 */
export function rankTeams(teams: TeamScore[]): TeamScore[] {
  teams.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.lastCyclePoints !== a.lastCyclePoints) return b.lastCyclePoints - a.lastCyclePoints;
    return a.teamName.localeCompare(b.teamName);
  });

  let lastPoints: number | null = null;
  let lastRank = 0;
  teams.forEach((team, index) => {
    if (lastPoints !== null && team.totalPoints === lastPoints) {
      team.rank = lastRank;
    } else {
      team.rank = index + 1;
      lastRank = team.rank;
      lastPoints = team.totalPoints;
    }
  });

  return teams;
}

/**
 * Cumulative points per cycle for one team — the shape the leaderboard chart
 * and the materialized TeamCycleScore rows both need.
 */
export function cumulativeByCycle(
  team: TeamScore,
  cycles: CycleRef[],
): Array<{ cycleId: string; sequence: number; cyclePoints: number; cumulativePoints: number }> {
  const byCycle = new Map(team.cycles.map((c) => [c.cycleId, c]));
  let running = 0;
  return [...cycles]
    .sort((a, b) => a.sequence - b.sequence)
    .map((cycle) => {
      const cyclePoints = byCycle.get(cycle.id)?.points ?? 0;
      running = round2(running + cyclePoints);
      return {
        cycleId: cycle.id,
        sequence: cycle.sequence,
        cyclePoints,
        cumulativePoints: running,
      };
    });
}

/**
 * Builds the ruleset lookup the engine consumes, applying per-ruleset point
 * overrides. Kept here (rather than in the repository) so the override
 * precedence rule lives next to the code that depends on it.
 */
export function resolveRuleset(input: {
  id: string;
  slug: string;
  name: string;
  entries: Array<{
    eventDefinitionId: string;
    code: string;
    label: string;
    category: ScoringRule['category'];
    basePoints: number;
    pointsOverride: number | null;
    isVariable?: boolean;
  }>;
}): ResolvedRuleset {
  const rules = new Map<string, ScoringRule>();
  for (const entry of input.entries) {
    rules.set(entry.eventDefinitionId, {
      eventDefinitionId: entry.eventDefinitionId,
      code: entry.code,
      label: entry.label,
      category: entry.category,
      points: entry.pointsOverride ?? entry.basePoints,
      override: entry.pointsOverride,
      variable: entry.isVariable ?? false,
    });
  }
  return { id: input.id, slug: input.slug, name: input.name, rules };
}
