import { prisma } from '../lib/db';
import { computeLeagueSnapshot } from '../lib/scoring/repository';
import type { LeagueScoreSnapshot, TeamScore } from '../lib/scoring/types';

export async function getLeaguesForUser(userId: string) {
  return prisma.league.findMany({
    where: { members: { some: { userId, status: 'ACTIVE' } } },
    select: {
      id: true,
      name: true,
      draftStatus: true,
      rosterSize: true,
      inviteCode: true,
      season: { select: { name: true, show: { select: { name: true, slug: true } } } },
      scoringRuleset: { select: { name: true, slug: true } },
      _count: { select: { teams: true } },
      teams: {
        where: { ownerId: userId },
        select: { id: true, name: true },
      },
      members: {
        take: 4,
        select: { user: { select: { name: true, handle: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getLeagueOverview(leagueId: string) {
  return prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      name: true,
      inviteCode: true,
      rosterSize: true,
      draftType: true,
      draftStatus: true,
      isPublic: true,
      commissionerId: true,
      season: {
        select: {
          id: true,
          name: true,
          show: { select: { name: true, slug: true, lexicon: true } },
        },
      },
      scoringRuleset: { select: { id: true, name: true, slug: true, description: true } },
      teams: {
        select: {
          id: true,
          name: true,
          draftOrderPosition: true,
          owner: { select: { id: true, name: true, handle: true } },
        },
        orderBy: { draftOrderPosition: 'asc' },
      },
    },
  });
}

/** Current cycle = the earliest cycle not yet fully scored. */
export async function getCurrentCycle(seasonId: string) {
  return (
    (await prisma.cycle.findFirst({
      where: { seasonId, status: { not: 'SCORED' } },
      orderBy: { sequence: 'asc' },
    })) ??
    (await prisma.cycle.findFirst({ where: { seasonId }, orderBy: { sequence: 'desc' } }))
  );
}

export async function getSeasonCycles(seasonId: string) {
  return prisma.cycle.findMany({
    where: { seasonId },
    orderBy: { sequence: 'asc' },
    select: { id: true, label: true, sequence: true, status: true, locksAt: true, airsAt: true },
  });
}

export interface LeaderboardRow {
  teamId: string;
  teamName: string;
  ownerName: string | null;
  rank: number;
  totalPoints: number;
  lastCyclePoints: number;
  rosterCount: number;
  activeCount: number;
}

export async function getLeagueLeaderboard(leagueId: string): Promise<{
  snapshot: LeagueScoreSnapshot;
  rows: LeaderboardRow[];
}> {
  const [snapshot, teams] = await Promise.all([
    computeLeagueSnapshot(leagueId),
    prisma.team.findMany({
      where: { leagueId },
      select: {
        id: true,
        owner: { select: { name: true } },
        draftPicks: { select: { contestant: { select: { isActive: true } } } },
      },
    }),
  ]);

  const meta = new Map(teams.map((t) => [t.id, t]));

  const rows = snapshot.teams.map((team) => {
    const picks = meta.get(team.teamId)?.draftPicks ?? [];
    return {
      teamId: team.teamId,
      teamName: team.teamName,
      ownerName: meta.get(team.teamId)?.owner?.name ?? null,
      rank: team.rank,
      totalPoints: team.totalPoints,
      lastCyclePoints: team.lastCyclePoints,
      rosterCount: picks.length,
      activeCount: picks.filter((p) => p.contestant.isActive).length,
    };
  });

  return { snapshot, rows };
}

export interface TeamDetail {
  team: { id: string; name: string; leagueId: string; ownerName: string | null };
  score: TeamScore | null;
  roster: Array<{
    contestantId: string;
    name: string;
    photoUrl: string | null;
    isActive: boolean;
    metadata: unknown;
    points: number;
    eliminatedLabel: string | null;
  }>;
}

export async function getTeamDetail(teamId: string): Promise<TeamDetail | null> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      leagueId: true,
      owner: { select: { name: true } },
      draftPicks: {
        orderBy: { pickNumber: 'asc' },
        select: {
          contestant: {
            select: {
              id: true,
              name: true,
              photoUrl: true,
              isActive: true,
              metadata: true,
              eliminatedCycle: { select: { label: true } },
            },
          },
        },
      },
    },
  });
  if (!team) return null;

  const snapshot = await computeLeagueSnapshot(team.leagueId);
  const score = snapshot.teams.find((t) => t.teamId === teamId) ?? null;
  const pointsByContestant = new Map(
    (score?.contestants ?? []).map((c) => [c.contestantId, c.points]),
  );

  return {
    team: { id: team.id, name: team.name, leagueId: team.leagueId, ownerName: team.owner?.name ?? null },
    score,
    roster: team.draftPicks.map((pick) => ({
      contestantId: pick.contestant.id,
      name: pick.contestant.name,
      photoUrl: pick.contestant.photoUrl,
      isActive: pick.contestant.isActive,
      metadata: pick.contestant.metadata,
      points: pointsByContestant.get(pick.contestant.id) ?? 0,
      eliminatedLabel: pick.contestant.eliminatedCycle?.label ?? null,
    })),
  };
}

export async function getDraftBoard(leagueId: string) {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: { id: true, seasonId: true, rosterSize: true, draftType: true, draftStatus: true },
  });

  const [picks, contestants, teams] = await Promise.all([
    prisma.draftPick.findMany({
      where: { leagueId },
      orderBy: { pickNumber: 'asc' },
      select: {
        pickNumber: true,
        round: true,
        teamId: true,
        contestantId: true,
        team: { select: { name: true } },
        contestant: { select: { name: true } },
      },
    }),
    prisma.contestant.findMany({
      where: { seasonId: league.seasonId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, photoUrl: true, isActive: true, metadata: true },
    }),
    prisma.team.findMany({
      where: { leagueId },
      orderBy: { draftOrderPosition: 'asc' },
      select: { id: true, name: true, draftOrderPosition: true, owner: { select: { name: true } } },
    }),
  ]);

  return { league, picks, contestants, teams };
}

export async function getContestantProfile(contestantId: string) {
  const contestant = await prisma.contestant.findUnique({
    where: { id: contestantId },
    select: {
      id: true,
      name: true,
      photoUrl: true,
      isActive: true,
      metadata: true,
      placement: true,
      seasonId: true,
      eliminatedCycle: { select: { label: true } },
      season: { select: { name: true, show: { select: { name: true } } } },
      scoredEvents: {
        where: { isVoided: false },
        orderBy: [{ cycle: { sequence: 'asc' } }, { createdAt: 'asc' }],
        select: {
          id: true,
          pointsAwarded: true,
          note: true,
          cycle: { select: { id: true, label: true, sequence: true } },
          eventDefinition: { select: { code: true, label: true, category: true } },
        },
      },
      draftPicks: {
        select: {
          team: { select: { id: true, name: true, league: { select: { id: true, name: true } } } },
        },
      },
    },
  });
  if (!contestant) return null;

  const events = contestant.scoredEvents.map((e) => ({
    id: e.id,
    points: Number(e.pointsAwarded),
    note: e.note,
    cycleLabel: e.cycle.label,
    cycleSequence: e.cycle.sequence,
    code: e.eventDefinition.code,
    label: e.eventDefinition.label,
    category: e.eventDefinition.category,
  }));

  const byCycle = new Map<number, { label: string; points: number; count: number }>();
  for (const event of events) {
    const bucket = byCycle.get(event.cycleSequence) ?? { label: event.cycleLabel, points: 0, count: 0 };
    bucket.points += event.points;
    bucket.count += 1;
    byCycle.set(event.cycleSequence, bucket);
  }

  return {
    ...contestant,
    events,
    totalPoints: events.reduce((sum, e) => sum + e.points, 0),
    gameLog: [...byCycle.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([sequence, v]) => ({ sequence, ...v })),
  };
}

export async function getRuleBook(showSlug: string) {
  return prisma.scoringRuleset.findMany({
    where: { show: { slug: showSlug } },
    orderBy: { isDefault: 'desc' },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      isDefault: true,
      eventDefinitions: {
        select: {
          pointsOverride: true,
          eventDefinition: {
            select: { id: true, code: true, label: true, category: true, points: true, description: true },
          },
        },
      },
    },
  });
}
