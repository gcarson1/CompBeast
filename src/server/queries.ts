import { prisma } from '../lib/db';
import { effectiveLockAt, isCycleLocked } from '../lib/cycles';
import { DRAFT_TEAM_ORDER } from '../lib/draft/snake';
import { atRiskMessage, isAtRiskCode, nearMissMessage } from '../lib/engagement';
import { computeLeagueSnapshot, computeTeamSnapshot } from '../lib/scoring/repository';
import type { LeagueScoreSnapshot, TeamScore } from '../lib/scoring/types';

export async function getLeaguesForUser(userId: string) {
  return prisma.league.findMany({
    where: { members: { some: { userId, status: 'ACTIVE' } } },
    select: {
      id: true,
      name: true,
      draftStatus: true,
      rosterSize: true,
      maxTeams: true,
      inviteCode: true,
      lockOffsetMinutes: true,
      season: { select: { id: true, name: true, show: { select: { name: true, slug: true } } } },
      scoringRuleset: { select: { name: true, slug: true } },
      // Filtered relation count: `members` below is capped at 4 for avatars,
      // so the true size has to come from a count, not from that sample.
      _count: { select: { teams: true, members: { where: { status: { not: 'REMOVED' } } } } },
      teams: {
        where: { ownerId: userId },
        select: { id: true, name: true },
      },
      members: {
        take: 4,
        where: { status: { not: 'REMOVED' } },
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
      maxTeams: true,
      draftType: true,
      draftStatus: true,
      isPublic: true,
      lockOffsetMinutes: true,
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
        orderBy: DRAFT_TEAM_ORDER,
      },
      // Members were never selected here, so anyone without a team was
      // invisible on the league page — which, until the join bug was fixed,
      // was everyone who joined by invite code.
      members: {
        where: { status: { not: 'REMOVED' } },
        select: {
          role: true,
          status: true,
          joinedAt: true,
          user: { select: { id: true, name: true, handle: true, avatarUrl: true } },
        },
        orderBy: { joinedAt: 'asc' },
      },
    },
  });
}

export interface LeagueMessageView {
  id: string;
  body: string;
  createdAt: Date;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  isMine: boolean;
  hype: number;
  shade: number;
  myHype: boolean;
  myShade: boolean;
}

/**
 * The league feed, newest first.
 *
 * Reaction counts and the viewer's own reactions are resolved here rather than
 * in the component so the feed is one round trip: the counts come back grouped
 * and the viewer's own rows come back as a single scoped query, instead of the
 * per-message lookups a naive render would produce.
 */
export async function getLeagueMessages(
  leagueId: string,
  viewerId: string | null,
  limit = 50,
): Promise<LeagueMessageView[]> {
  const messages = await prisma.leagueMessage.findMany({
    where: { leagueId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      body: true,
      createdAt: true,
      authorId: true,
      author: { select: { name: true, handle: true, avatarUrl: true } },
      reactions: { select: { kind: true, userId: true } },
    },
  });

  return messages.map((message) => {
    let hype = 0;
    let shade = 0;
    let myHype = false;
    let myShade = false;

    for (const reaction of message.reactions) {
      const mine = viewerId !== null && reaction.userId === viewerId;
      if (reaction.kind === 'HYPE') {
        hype += 1;
        if (mine) myHype = true;
      } else {
        shade += 1;
        if (mine) myShade = true;
      }
    }

    return {
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      authorId: message.authorId,
      authorName: message.author.name ?? message.author.handle ?? 'Unknown manager',
      authorAvatarUrl: message.author.avatarUrl,
      isMine: viewerId !== null && message.authorId === viewerId,
      hype,
      shade,
      myHype,
      myShade,
    };
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

/**
 * Reads standings from the materialized TeamCycleScore rows.
 *
 * The recalculation job already writes these on every scoring change, so a
 * page view has no reason to replay the season's whole ledger. Returns null
 * when a league has never been scored (pre-draft, or before the first sync),
 * which is the one case that still needs a live computation.
 */
async function readMaterializedStandings(leagueId: string) {
  const rows = await prisma.teamCycleScore.findMany({
    where: { team: { leagueId } },
    select: {
      teamId: true,
      cyclePoints: true,
      cumulativePoints: true,
      rank: true,
      cycle: { select: { sequence: true } },
    },
    orderBy: { cycle: { sequence: 'desc' } },
  });
  if (rows.length === 0) return null;

  // Rows are ordered newest cycle first. A team's running total comes from its
  // newest row, but "last cycle" means the most recent cycle that actually
  // scored — every future cycle also has a row, all of them zero, and reading
  // those would report a flat 0 all season.
  const standings = new Map<string, { cumulativePoints: number; lastCyclePoints: number; rank: number }>();

  for (const row of rows) {
    const existing = standings.get(row.teamId);
    const cyclePoints = Number(row.cyclePoints);

    if (!existing) {
      standings.set(row.teamId, {
        cumulativePoints: Number(row.cumulativePoints),
        lastCyclePoints: cyclePoints,
        rank: row.rank ?? 0,
      });
      continue;
    }

    if (existing.lastCyclePoints === 0 && cyclePoints !== 0) {
      existing.lastCyclePoints = cyclePoints;
    }
  }

  return standings;
}

export async function getLeagueLeaderboard(leagueId: string): Promise<{
  rows: LeaderboardRow[];
}> {
  const [standings, teams] = await Promise.all([
    readMaterializedStandings(leagueId),
    prisma.team.findMany({
      where: { leagueId },
      select: {
        id: true,
        name: true,
        owner: { select: { name: true } },
        draftPicks: { select: { contestant: { select: { isActive: true } } } },
      },
    }),
  ]);

  const rosterOf = (teamId: string) => {
    const picks = teams.find((t) => t.id === teamId)?.draftPicks ?? [];
    return { rosterCount: picks.length, activeCount: picks.filter((p) => p.contestant.isActive).length };
  };

  if (standings) {
    const rows = teams
      .map((team) => {
        const row = standings.get(team.id);
        return {
          teamId: team.id,
          teamName: team.name,
          ownerName: team.owner?.name ?? null,
          rank: row?.rank ?? 0,
          totalPoints: row?.cumulativePoints ?? 0,
          lastCyclePoints: row?.lastCyclePoints ?? 0,
          ...rosterOf(team.id),
        };
      })
      .sort((a, b) => a.rank - b.rank || b.totalPoints - a.totalPoints);
    return { rows };
  }

  // Never scored yet — fall back to a live pass so a new league still renders.
  const snapshot = await computeLeagueSnapshot(leagueId);
  const rows = snapshot.teams.map((team) => ({
    teamId: team.teamId,
    teamName: team.teamName,
    ownerName: teams.find((t) => t.id === team.teamId)?.owner?.name ?? null,
    rank: team.rank,
    totalPoints: team.totalPoints,
    lastCyclePoints: team.lastCyclePoints,
    ...rosterOf(team.teamId),
  }));

  return { rows };
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

  const snapshot = await computeTeamSnapshot(teamId);
  const score = snapshot.teams[0] ?? null;
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
      orderBy: DRAFT_TEAM_ORDER,
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
      season: { select: { slug: true, name: true, show: { select: { name: true } } } },
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

export async function getSeasonsByStatus() {
  const seasons = await prisma.season.findMany({
    orderBy: [{ year: 'desc' }, { name: 'desc' }],
    select: {
      id: true,
      slug: true,
      name: true,
      year: true,
      status: true,
      // slug as well as name: the buzz feed keys its show-specific source off
      // the slug, and builds its universal query from the name.
      show: { select: { name: true, slug: true } },
      _count: { select: { contestants: true, leagues: true } },
    },
  });

  return {
    open: seasons.filter((s) => s.status !== 'COMPLETED'),
    archived: seasons.filter((s) => s.status === 'COMPLETED'),
  };
}

export interface SeasonPlayerScore {
  contestantId: string;
  name: string;
  photoUrl: string | null;
  isActive: boolean;
  placement: number | null;
  eliminatedLabel: string | null;
  metadata: unknown;
  points: number;
}

/**
 * Season-wide player scores, independent of any league.
 *
 * Scored against the show's default ruleset rather than every recorded event:
 * a contestant's archive total should mean the same thing everywhere, and
 * summing raw events would silently mix in rules most leagues never enabled.
 */
export async function getSeasonScoreboard(slug: string): Promise<{
  season: {
    id: string;
    slug: string;
    name: string;
    year: number;
    status: string;
    showName: string;
  };
  rulesetName: string;
  players: SeasonPlayerScore[];
} | null> {
  const season = await prisma.season.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      year: true,
      status: true,
      showId: true,
      show: { select: { name: true } },
    },
  });
  if (!season) return null;

  const ruleset = await prisma.scoringRuleset.findFirst({
    where: { showId: season.showId },
    orderBy: { isDefault: 'desc' },
    select: {
      name: true,
      eventDefinitions: {
        select: { eventDefinitionId: true, pointsOverride: true },
      },
    },
  });

  const pointsByDefinition = new Map(
    (ruleset?.eventDefinitions ?? []).map((link) => [
      link.eventDefinitionId,
      link.pointsOverride === null ? null : Number(link.pointsOverride),
    ]),
  );

  const contestants = await prisma.contestant.findMany({
    where: { seasonId: season.id },
    select: {
      id: true,
      name: true,
      photoUrl: true,
      isActive: true,
      placement: true,
      metadata: true,
      eliminatedCycle: { select: { label: true } },
      scoredEvents: {
        where: { isVoided: false },
        select: { pointsAwarded: true, eventDefinitionId: true },
      },
    },
  });

  const players = contestants
    .map((contestant) => ({
      contestantId: contestant.id,
      name: contestant.name,
      photoUrl: contestant.photoUrl,
      isActive: contestant.isActive,
      placement: contestant.placement,
      eliminatedLabel: contestant.eliminatedCycle?.label ?? null,
      metadata: contestant.metadata,
      points: contestant.scoredEvents.reduce((sum, event) => {
        if (!pointsByDefinition.has(event.eventDefinitionId)) return sum;
        const override = pointsByDefinition.get(event.eventDefinitionId);
        return sum + (override ?? Number(event.pointsAwarded));
      }, 0),
    }))
    .sort((a, b) => b.points - a.points);

  return {
    season: {
      id: season.id,
      slug: season.slug,
      name: season.name,
      year: season.year,
      status: season.status,
      showName: season.show.name,
    },
    rulesetName: ruleset?.name ?? 'Default',
    players,
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

export interface HomeLeagueCard {
  leagueId: string;
  leagueName: string;
  showName: string;
  seasonName: string;
  rulesetName: string;
  draftStatus: string;
  inviteCode: string;
  teamCount: number;
  maxTeams: number;
  memberCount: number;
  memberNames: string[];
  /** Null when someone is a member of the league but owns no team in it. */
  teamId: string | null;
  teamName: string | null;
  rank: number;
  totalPoints: number;
  lastCyclePoints: number;
  nearMiss: string | null;
  atRisk: string | null;
  currentCycleLabel: string | null;
  locksAt: Date | null;
  cycleLocked: boolean;
}

/**
 * One card per league the user is in, carrying both the league itself and how
 * that user's team is doing in it.
 *
 * Built from the same query functions the league and team pages already use,
 * so the home page can never drift out of sync with what those pages show.
 * It starts from league *membership* rather than from owned teams: someone
 * who joined but has no team yet still belongs on their own home page, and
 * keying off teams is exactly the mistake that once made joiners invisible.
 *
 * The near-miss and at-risk lines are formatted here rather than in the
 * component so the full leaderboard never has to cross to the client just to
 * compute a one-line string from it.
 */
export async function getHomeLeagues(userId: string): Promise<HomeLeagueCard[]> {
  const leagues = await getLeaguesForUser(userId);

  return Promise.all(
    leagues.map(async (league): Promise<HomeLeagueCard> => {
      const myTeam = league.teams[0] ?? null;
      const [{ rows }, detail, currentCycle] = await Promise.all([
        getLeagueLeaderboard(league.id),
        myTeam ? getTeamDetail(myTeam.id) : Promise.resolve(null),
        getCurrentCycle(league.season.id),
      ]);

      const mine = myTeam ? rows.find((r) => r.teamId === myTeam.id) : undefined;
      // Both the flag and the timestamp go through the league's own offset —
      // showing a locked badge next to the *season's* deadline would be a
      // worse bug than not honouring the offset at all.
      const cycleLocked =
        currentCycle !== null && isCycleLocked(currentCycle, league.lockOffsetMinutes);

      // "At risk" reads the latest cycle that has any recorded lines at all —
      // nominations land mid-week, before that cycle's own status flips to
      // SCORED, so this still catches a nomination the moment it's recorded.
      const rosterNameById = new Map((detail?.roster ?? []).map((p) => [p.contestantId, p.name]));
      const latestLines = detail?.score?.cycles.at(-1)?.lines ?? [];
      const atRiskNames = [
        ...new Set(
          latestLines
            .filter((line) => isAtRiskCode(line.code))
            .map((line) => rosterNameById.get(line.contestantId))
            .filter((name): name is string => Boolean(name)),
        ),
      ];

      return {
        leagueId: league.id,
        leagueName: league.name,
        showName: league.season.show.name,
        seasonName: league.season.name,
        rulesetName: league.scoringRuleset.name,
        draftStatus: league.draftStatus,
        inviteCode: league.inviteCode,
        teamCount: league._count.teams,
        maxTeams: league.maxTeams,
        memberCount: league._count.members,
        memberNames: league.members.map((m) => m.user.name ?? m.user.handle ?? '?'),
        teamId: myTeam?.id ?? null,
        teamName: myTeam?.name ?? null,
        rank: mine?.rank ?? 0,
        totalPoints: mine?.totalPoints ?? 0,
        lastCyclePoints: mine?.lastCyclePoints ?? 0,
        nearMiss: myTeam ? nearMissMessage(rows, myTeam.id) : null,
        atRisk: atRiskMessage(atRiskNames),
        currentCycleLabel: currentCycle?.label ?? null,
        locksAt: currentCycle ? effectiveLockAt(currentCycle, league.lockOffsetMinutes) : null,
        cycleLocked,
      };
    }),
  );
}

export interface PointHistoryPoint {
  label: string;
  sequence: number;
  cyclePoints: number;
  cumulativePoints: number;
  rank: number | null;
}

export interface SeasonHistoryRow {
  teamId: string;
  teamName: string;
  leagueId: string;
  leagueName: string;
  showName: string;
  seasonName: string;
  seasonStatus: 'UPCOMING' | 'ACTIVE' | 'COMPLETED';
  /** Standing at the last cycle that actually happened; 0 before any scoring. */
  rank: number;
  teamCount: number;
  totalPoints: number;
  history: PointHistoryPoint[];
}

export interface AccountOverview {
  leaguesPlayed: number;
  seasonsPlayed: number;
  /** Every point this account has ever scored, across every league. */
  totalPoints: number;
  /** Best finishing position reached in any league. Null before any scoring. */
  bestRank: number | null;
  /** First-place finishes in seasons that have actually ended. */
  titles: number;
  rows: SeasonHistoryRow[];
}

/**
 * Career view for the account page: every team this person has ever owned,
 * with its week-by-week trajectory.
 *
 * Read from the materialized `TeamCycleScore` rows rather than replaying the
 * ledger — the recalculation job already writes them on every scoring change,
 * and an account page has no business re-deriving a season's worth of events
 * per team just to draw a line.
 *
 * One query, then all the arithmetic in memory. The obvious alternative,
 * calling `getLeagueLeaderboard` once per team, is a query per league on a
 * page whose whole job is to show someone with a lot of leagues.
 */
export async function getAccountOverview(userId: string): Promise<AccountOverview> {
  const teams = await prisma.team.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      league: {
        select: {
          id: true,
          name: true,
          _count: { select: { teams: true } },
          season: { select: { id: true, name: true, status: true, show: { select: { name: true } } } },
        },
      },
      cycleScores: {
        select: {
          cyclePoints: true,
          cumulativePoints: true,
          rank: true,
          cycle: { select: { label: true, sequence: true, status: true } },
        },
      },
    },
  });

  const rows: SeasonHistoryRow[] = teams.map((team) => {
    const scores = [...team.cycleScores].sort((a, b) => a.cycle.sequence - b.cycle.sequence);

    // Cut the series at the last cycle that has actually happened. Cumulative
    // totals carry forward through unscored weeks, so plotting the whole
    // season would draw a long flat tail into the future and read as a team
    // that stopped scoring rather than a season still being played.
    let lastPlayed = -1;
    scores.forEach((score, index) => {
      if (score.cycle.status !== 'UPCOMING') lastPlayed = index;
    });
    const played = lastPlayed >= 0 ? scores.slice(0, lastPlayed + 1) : [];

    const history: PointHistoryPoint[] = played.map((score) => ({
      label: score.cycle.label,
      sequence: score.cycle.sequence,
      cyclePoints: Number(score.cyclePoints),
      cumulativePoints: Number(score.cumulativePoints),
      rank: score.rank,
    }));

    const latest = history.at(-1);
    return {
      teamId: team.id,
      teamName: team.name,
      leagueId: team.league.id,
      leagueName: team.league.name,
      showName: team.league.season.show.name,
      seasonName: team.league.season.name,
      seasonStatus: team.league.season.status,
      rank: latest?.rank ?? 0,
      teamCount: team.league._count.teams,
      totalPoints: latest?.cumulativePoints ?? 0,
      history,
    };
  });

  const ranked = rows.filter((row) => row.rank > 0);
  return {
    leaguesPlayed: rows.length,
    seasonsPlayed: new Set(teams.map((team) => team.league.season.id)).size,
    totalPoints: Math.round(rows.reduce((sum, row) => sum + row.totalPoints, 0) * 100) / 100,
    bestRank: ranked.length > 0 ? Math.min(...ranked.map((row) => row.rank)) : null,
    // Only seasons that actually ended. Leading an active league is not a win
    // yet, and counting it as one would quietly inflate the number every week.
    titles: rows.filter((row) => row.seasonStatus === 'COMPLETED' && row.rank === 1).length,
    rows,
  };
}

export interface SeasonHeadline {
  id: string;
  contestantName: string;
  eventLabel: string;
  points: number;
  occurredAt: Date;
}

/**
 * The most recent real scored events for a season, for a "what just
 * happened" ticker. Deliberately real data rather than fabricated copy —
 * whatever the ingestion pipeline or an admin has actually recorded.
 */
export async function getRecentHeadlines(seasonId: string, limit = 8): Promise<SeasonHeadline[]> {
  const events = await prisma.scoredEvent.findMany({
    where: { isVoided: false, contestant: { seasonId } },
    orderBy: { occurredAt: 'desc' },
    take: limit,
    select: {
      id: true,
      pointsAwarded: true,
      occurredAt: true,
      contestant: { select: { name: true } },
      eventDefinition: { select: { label: true } },
    },
  });

  return events.map((e) => ({
    id: e.id,
    contestantName: e.contestant.name,
    eventLabel: e.eventDefinition.label,
    points: Number(e.pointsAwarded),
    occurredAt: e.occurredAt,
  }));
}
