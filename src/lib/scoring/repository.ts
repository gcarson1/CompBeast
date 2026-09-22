import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { aggregateTeamScores, cumulativeByCycle, resolveRuleset } from './engine';
import type {
  AggregateOptions,
  CycleRef,
  LeagueScoreSnapshot,
  ResolvedRuleset,
  RosterAssignment,
  ScoredEventInput,
  TeamRef,
} from './types';

/** Prisma returns Decimal objects; the engine works in plain numbers. */
const toNumber = (value: Prisma.Decimal | number): number => Number(value);

export async function loadResolvedRuleset(rulesetId: string): Promise<ResolvedRuleset> {
  const ruleset = await prisma.scoringRuleset.findUniqueOrThrow({
    where: { id: rulesetId },
    include: { eventDefinitions: { include: { eventDefinition: true } } },
  });

  return resolveRuleset({
    id: ruleset.id,
    slug: ruleset.slug,
    name: ruleset.name,
    entries: ruleset.eventDefinitions.map((link) => ({
      eventDefinitionId: link.eventDefinitionId,
      code: link.eventDefinition.code,
      label: link.eventDefinition.label,
      category: link.eventDefinition.category,
      basePoints: toNumber(link.eventDefinition.points),
      pointsOverride: link.pointsOverride === null ? null : toNumber(link.pointsOverride),
      isVariable: link.eventDefinition.isVariable,
    })),
  });
}

/**
 * Pulls everything the engine needs for one league in a fixed number of
 * queries, regardless of league size. Scoped to the league's season so a large
 * platform never scans the whole ledger to score one league.
 */
export async function computeLeagueSnapshot(
  leagueId: string,
  options: AggregateOptions = {},
): Promise<LeagueScoreSnapshot> {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: { id: true, seasonId: true, scoringRulesetId: true },
  });

  const [ruleset, teamRows, cycleRows, rosterRows, eventRows] = await Promise.all([
    loadResolvedRuleset(league.scoringRulesetId),
    prisma.team.findMany({
      where: { leagueId },
      select: { id: true, name: true, owner: { select: { name: true } } },
    }),
    prisma.cycle.findMany({
      where: { seasonId: league.seasonId },
      select: { id: true, label: true, sequence: true },
      orderBy: { sequence: 'asc' },
    }),
    prisma.rosterSlot.findMany({
      where: { team: { leagueId } },
      select: { teamId: true, contestantId: true, cycleId: true },
    }),
    prisma.scoredEvent.findMany({
      where: { cycle: { seasonId: league.seasonId } },
      select: {
        id: true,
        contestantId: true,
        eventDefinitionId: true,
        cycleId: true,
        pointsAwarded: true,
        isVoided: true,
        occurredAt: true,
      },
    }),
  ]);

  const teams: TeamRef[] = teamRows.map((t) => ({
    id: t.id,
    name: t.name,
    ownerName: t.owner?.name ?? null,
  }));
  const cycles: CycleRef[] = cycleRows;
  const roster: RosterAssignment[] = rosterRows;
  const events: ScoredEventInput[] = eventRows.map((e) => ({
    id: e.id,
    contestantId: e.contestantId,
    eventDefinitionId: e.eventDefinitionId,
    cycleId: e.cycleId,
    pointsAwarded: toNumber(e.pointsAwarded),
    isVoided: e.isVoided,
    occurredAt: e.occurredAt,
  }));

  return aggregateTeamScores({ teams, cycles, roster, events, ruleset, options });
}

/**
 * Scores a single team, with the per-event line items the team page shows.
 *
 * The materialized table only holds per-cycle totals, so a breakdown still
 * needs the ledger — but only this team's share of it. Scoping the event query
 * to the contestants this team actually rosters keeps the cost flat as a
 * league adds teams, instead of replaying every rival's roster to render one
 * page.
 */
export async function computeTeamSnapshot(
  teamId: string,
  options: AggregateOptions = {},
): Promise<LeagueScoreSnapshot> {
  const team = await prisma.team.findUniqueOrThrow({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      owner: { select: { name: true } },
      league: { select: { seasonId: true, scoringRulesetId: true } },
    },
  });

  const [ruleset, cycleRows, rosterRows] = await Promise.all([
    loadResolvedRuleset(team.league.scoringRulesetId),
    prisma.cycle.findMany({
      where: { seasonId: team.league.seasonId },
      select: { id: true, label: true, sequence: true },
      orderBy: { sequence: 'asc' },
    }),
    prisma.rosterSlot.findMany({
      where: { teamId },
      select: { teamId: true, contestantId: true, cycleId: true },
    }),
  ]);

  const contestantIds = [...new Set(rosterRows.map((r) => r.contestantId))];
  const eventRows = await prisma.scoredEvent.findMany({
    where: { contestantId: { in: contestantIds }, cycle: { seasonId: team.league.seasonId } },
    select: {
      id: true,
      contestantId: true,
      eventDefinitionId: true,
      cycleId: true,
      pointsAwarded: true,
      isVoided: true,
      occurredAt: true,
    },
  });

  return aggregateTeamScores({
    teams: [{ id: team.id, name: team.name, ownerName: team.owner?.name ?? null }],
    cycles: cycleRows,
    roster: rosterRows,
    events: eventRows.map((e) => ({
      id: e.id,
      contestantId: e.contestantId,
      eventDefinitionId: e.eventDefinitionId,
      cycleId: e.cycleId,
      pointsAwarded: toNumber(e.pointsAwarded),
      isVoided: e.isVoided,
      occurredAt: e.occurredAt,
    })),
    ruleset,
    options,
  });
}

/**
 * The score-distribution job.
 *
 * Recomputes the whole league from the ledger and rewrites the materialized
 * TeamCycleScore rows in a single transaction. Full recomputation rather than
 * incremental deltas is deliberate: it makes a retroactive correction (a voided
 * event in week 2, a rule value fixed in week 9) self-healing — there is no
 * incremental path that can drift from the ledger.
 */
export async function recalculateLeague(
  leagueId: string,
  options: AggregateOptions = {},
): Promise<LeagueScoreSnapshot> {
  const snapshot = await computeLeagueSnapshot(leagueId, options);

  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: { seasonId: true },
  });
  const cycles = await prisma.cycle.findMany({
    where: { seasonId: league.seasonId },
    select: { id: true, label: true, sequence: true },
    orderBy: { sequence: 'asc' },
  });

  // cycleId -> [{ teamId, cumulative }] so ranks can be assigned per cycle.
  const perCycle = new Map<
    string,
    Array<{ teamId: string; cyclePoints: number; cumulativePoints: number }>
  >();
  for (const team of snapshot.teams) {
    for (const row of cumulativeByCycle(team, cycles)) {
      const bucket = perCycle.get(row.cycleId) ?? [];
      bucket.push({
        teamId: team.teamId,
        cyclePoints: row.cyclePoints,
        cumulativePoints: row.cumulativePoints,
      });
      perCycle.set(row.cycleId, bucket);
    }
  }

  const writes: Prisma.PrismaPromise<unknown>[] = [];
  for (const [cycleId, rows] of perCycle) {
    rows.sort((a, b) => b.cumulativePoints - a.cumulativePoints);
    let lastPoints: number | null = null;
    let lastRank = 0;

    rows.forEach((row, index) => {
      const rank = lastPoints !== null && row.cumulativePoints === lastPoints ? lastRank : index + 1;
      lastRank = rank;
      lastPoints = row.cumulativePoints;

      writes.push(
        prisma.teamCycleScore.upsert({
          where: { teamId_cycleId: { teamId: row.teamId, cycleId } },
          create: {
            teamId: row.teamId,
            cycleId,
            cyclePoints: row.cyclePoints,
            cumulativePoints: row.cumulativePoints,
            rank,
          },
          update: {
            cyclePoints: row.cyclePoints,
            cumulativePoints: row.cumulativePoints,
            rank,
            computedAt: new Date(),
          },
        }),
      );
    });
  }

  await prisma.$transaction(writes);
  return snapshot;
}

/**
 * Recalculates every league on a season.
 *
 * A league's recompute already covers the whole season, so this is the unit
 * callers should reach for when several cycles changed at once — running it
 * per-cycle repeats identical work for every cycle touched.
 */
export async function recalculateSeasonLeagues(seasonId: string): Promise<string[]> {
  const leagues = await prisma.league.findMany({
    where: { seasonId },
    select: { id: true },
  });

  // Sequential on purpose: each recompute ends in a transaction, and a season
  // with many leagues would otherwise open them all against the connection
  // pool at once.
  for (const league of leagues) {
    await recalculateLeague(league.id);
  }
  return leagues.map((l) => l.id);
}

/** Recalculates every league playing the season a cycle belongs to. */
export async function recalculateLeaguesForCycle(cycleId: string): Promise<string[]> {
  const cycle = await prisma.cycle.findUniqueOrThrow({
    where: { id: cycleId },
    select: { seasonId: true },
  });
  return recalculateSeasonLeagues(cycle.seasonId);
}
