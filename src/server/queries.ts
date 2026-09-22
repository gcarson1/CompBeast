import { prisma } from '../lib/db';
import { lexiconFor, type ShowLexicon } from '../lib/shows/lexicon';
import { FLAGSHIP_SHOW_SLUG } from '../lib/shows/registry';
import { type PointHistoryPoint, parseStoredHistory, playedHistory } from '../lib/career';
import { effectiveLockAt, isCycleLocked } from '../lib/cycles';
import { DRAFT_TEAM_ORDER } from '../lib/draft/snake';
import { AT_RISK_EVENT_CODES, atRiskMessage, nearMissMessage } from '../lib/engagement';
import { computeLeagueSnapshot, computeTeamSnapshot } from '../lib/scoring/repository';
import type { LeagueScoreSnapshot, TeamScore } from '../lib/scoring/types';

async function getLeaguesForUser(userId: string) {
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
      season: {
        select: { id: true, name: true, show: { select: { name: true, slug: true, lexicon: true } } },
      },
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
      chatWebhookUrl: true,
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

/**
 * Whether someone may read a league's pages.
 *
 * The same rule the API routes already apply: a public league is readable by
 * anyone with the link, a private one by its active members. The pages used
 * to skip this — `isPublic` was a label on the settings form and nothing
 * else — so a private league's standings, roster and feed were readable by
 * anyone who had the id. The league page reads the answer off its own
 * overview query; the team and draft pages, which hold only an id, use this.
 */
export async function canViewLeague(leagueId: string, userId: string | null): Promise<boolean> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      isPublic: true,
      members: userId
        ? { where: { userId, status: 'ACTIVE' }, select: { id: true } }
        : { where: { id: '' }, select: { id: true } },
    },
  });
  return league !== null && (league.isPublic || league.members.length > 0);
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
    })) ?? (await prisma.cycle.findFirst({ where: { seasonId }, orderBy: { sequence: 'desc' } }))
  );
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
  showSlug: string;
  showLexicon: ShowLexicon;
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
      league: { select: { season: { select: { show: { select: { slug: true, lexicon: true } } } } } },
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
  const pointsByContestant = new Map((score?.contestants ?? []).map((c) => [c.contestantId, c.points]));

  const show = team.league.season.show;
  return {
    team: { id: team.id, name: team.name, leagueId: team.leagueId, ownerName: team.owner?.name ?? null },
    showSlug: show.slug,
    showLexicon: lexiconFor(show.slug, show.lexicon),
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

/**
 * The houseguests on a team's roster who are on the block in the latest week
 * that has been scored for that team.
 *
 * Two indexed lookups. The home rail and the league page used to load the
 * whole `TeamDetail` — the ledger replay behind the team page — to read one
 * cycle's lines out of it, once per league on the home page. Nominations are
 * recorded mid-week, before the cycle's status flips, so "the latest cycle
 * with any scored event for this roster" is what catches a nomination the
 * moment it lands; and it is scoped to that cycle so last week's nominees do
 * not stay on the block after the eviction.
 */
export async function getTeamAtRiskNames(teamId: string): Promise<string[]> {
  const latest = await prisma.scoredEvent.findFirst({
    where: { isVoided: false, contestant: { draftPicks: { some: { teamId } } } },
    orderBy: { cycle: { sequence: 'desc' } },
    select: { cycleId: true },
  });
  if (!latest) return [];

  const nominated = await prisma.scoredEvent.findMany({
    where: {
      isVoided: false,
      cycleId: latest.cycleId,
      eventDefinition: { code: { in: [...AT_RISK_EVENT_CODES] } },
      contestant: { draftPicks: { some: { teamId } } },
    },
    distinct: ['contestantId'],
    select: { contestant: { select: { name: true } } },
  });
  return nominated.map((event) => event.contestant.name);
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
      season: {
        select: { slug: true, name: true, show: { select: { name: true, slug: true, lexicon: true } } },
      },
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
    showLexicon: lexiconFor(contestant.season.show.slug, contestant.season.show.lexicon),
    events,
    totalPoints: events.reduce((sum, e) => sum + e.points, 0),
    gameLog: [...byCycle.entries()].sort((a, b) => a[0] - b[0]).map(([sequence, v]) => ({ sequence, ...v })),
  };
}

export interface ContestantLeagueLine {
  leagueId: string;
  leagueName: string;
  teamName: string;
}

/**
 * Which of the *viewer's* leagues have this houseguest on a roster, and on
 * whose team. Scoped to leagues the viewer belongs to on purpose: the player
 * page is public and indexed, and it used to list every league in the
 * database that had drafted the player — private leagues' names and team
 * names included.
 */
export async function getContestantLeaguesForViewer(
  contestantId: string,
  viewerId: string | null,
): Promise<ContestantLeagueLine[]> {
  if (!viewerId) return [];
  const picks = await prisma.draftPick.findMany({
    where: {
      contestantId,
      team: { league: { members: { some: { userId: viewerId, status: 'ACTIVE' } } } },
    },
    select: { team: { select: { name: true, league: { select: { id: true, name: true } } } } },
    orderBy: { team: { league: { createdAt: 'desc' } } },
  });
  return picks.map((pick) => ({
    leagueId: pick.team.league.id,
    leagueName: pick.team.league.name,
    teamName: pick.team.name,
  }));
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
      startDate: true,
      // slug as well as name: the buzz feed keys its show-specific source off
      // the slug, and builds its universal query from the name.
      show: { select: { name: true, slug: true, lexicon: true } },
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
    showSlug: string;
    showLexicon: ShowLexicon;
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
      show: { select: { name: true, slug: true, lexicon: true } },
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
      showSlug: season.show.slug,
      showLexicon: lexiconFor(season.show.slug, season.show.lexicon),
    },
    rulesetName: ruleset?.name ?? 'Default',
    players,
  };
}

/**
 * Every show's rule book, for the public rules page. Ordered with the
 * flagship first so the page opens on the show most visitors came for.
 */
export async function getRuleBooks() {
  const shows = await prisma.show.findMany({
    where: { scoringRulesets: { some: {} } },
    select: { slug: true, name: true, lexicon: true },
  });
  const books = await Promise.all(
    shows.map(async (show) => ({
      slug: show.slug,
      name: show.name,
      lexicon: lexiconFor(show.slug, show.lexicon),
      rulesets: await getRuleBook(show.slug),
    })),
  );
  return books.sort((a, b) => {
    if (a.slug === FLAGSHIP_SHOW_SLUG) return -1;
    if (b.slug === FLAGSHIP_SHOW_SLUG) return 1;
    return a.name.localeCompare(b.name);
  });
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
      const [{ rows }, atRiskNames, currentCycle] = await Promise.all([
        getLeagueLeaderboard(league.id),
        myTeam ? getTeamAtRiskNames(myTeam.id) : Promise.resolve([]),
        getCurrentCycle(league.season.id),
      ]);

      const mine = myTeam ? rows.find((r) => r.teamId === myTeam.id) : undefined;
      // Both the flag and the timestamp go through the league's own offset —
      // showing a locked badge next to the *season's* deadline would be a
      // worse bug than not honouring the offset at all.
      const cycleLocked = currentCycle !== null && isCycleLocked(currentCycle, league.lockOffsetMinutes);

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
        atRisk: atRiskMessage(atRiskNames, lexiconFor(league.season.show.slug, league.season.show.lexicon)),
        currentCycleLabel: currentCycle?.label ?? null,
        locksAt: currentCycle ? effectiveLockAt(currentCycle, league.lockOffsetMinutes) : null,
        cycleLocked,
      };
    }),
  );
}

export type { PointHistoryPoint };

export interface SeasonHistoryRow {
  /** Stable key: the team's id while its league exists, the career record's once it has closed. */
  id: string;
  /** Null once the league has been deleted — there is no team page left to link to. */
  teamId: string | null;
  leagueId: string | null;
  teamName: string;
  leagueName: string;
  showName: string;
  seasonName: string;
  seasonStatus: 'UPCOMING' | 'ACTIVE' | 'COMPLETED';
  /**
   * True when this line comes from a `CareerRecord`: the league was deleted
   * and the numbers are frozen at the moment it closed.
   */
  archived: boolean;
  /** Standing at the last cycle that actually happened; 0 before any scoring. */
  rank: number;
  teamCount: number;
  totalPoints: number;
  /**
   * Whether `rank === 1` here counts as a title. For a live team that is the
   * season having ended; for an archived line it is whether the season had
   * ended when the league closed — a lead in a season still running is not a
   * win, however the season finished without you.
   */
  settled: boolean;
  history: PointHistoryPoint[];
}

export interface AccountOverview {
  leaguesPlayed: number;
  seasonsPlayed: number;
  /** Every point this account has ever scored, across every league — including leagues since deleted. */
  totalPoints: number;
  /** Best finishing position reached in any league. Null before any scoring. */
  bestRank: number | null;
  /** First-place finishes in seasons that have actually ended. */
  titles: number;
  rows: SeasonHistoryRow[];
}

/**
 * Career view for the account page: every team this person has ever owned,
 * with its week-by-week trajectory — including teams whose league no longer
 * exists, read back from the `CareerRecord` the deletion wrote.
 *
 * Read from the materialized `TeamCycleScore` rows rather than replaying the
 * ledger — the recalculation job already writes them on every scoring change,
 * and an account page has no business re-deriving a season's worth of events
 * per team just to draw a line.
 *
 * One query per source, then all the arithmetic in memory. The obvious
 * alternative, calling `getLeagueLeaderboard` once per team, is a query per
 * league on a page whose whole job is to show someone with a lot of leagues.
 */
export async function getAccountOverview(userId: string): Promise<AccountOverview> {
  const [teams, records] = await Promise.all([
    prisma.team.findMany({
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
    }),
    prisma.careerRecord.findMany({ where: { userId }, orderBy: { archivedAt: 'desc' } }),
  ]);

  // A record has no relation to its season on purpose, but the season usually
  // still exists, and its *current* status is what the page should label the
  // line with: "Finished", not "was still airing when the league closed".
  const seasonStatus = new Map<string, 'UPCOMING' | 'ACTIVE' | 'COMPLETED'>();
  if (records.length > 0) {
    const seasons = await prisma.season.findMany({
      where: { id: { in: [...new Set(records.map((r) => r.seasonId))] } },
      select: { id: true, status: true },
    });
    for (const season of seasons) seasonStatus.set(season.id, season.status);
  }

  const live: SeasonHistoryRow[] = teams.map((team) => {
    const history = playedHistory(team.cycleScores);
    const latest = history.at(-1);
    return {
      id: team.id,
      teamId: team.id,
      leagueId: team.league.id,
      teamName: team.name,
      leagueName: team.league.name,
      showName: team.league.season.show.name,
      seasonName: team.league.season.name,
      seasonStatus: team.league.season.status,
      archived: false,
      rank: latest?.rank ?? 0,
      teamCount: team.league._count.teams,
      totalPoints: latest?.cumulativePoints ?? 0,
      settled: team.league.season.status === 'COMPLETED',
      history,
    };
  });

  const archived: SeasonHistoryRow[] = records.map((record) => ({
    id: record.id,
    teamId: null,
    leagueId: null,
    teamName: record.teamName,
    leagueName: record.leagueName,
    showName: record.showName,
    seasonName: record.seasonName,
    seasonStatus: seasonStatus.get(record.seasonId) ?? (record.seasonCompleted ? 'COMPLETED' : 'ACTIVE'),
    archived: true,
    rank: record.finalRank ?? 0,
    teamCount: record.teamCount,
    totalPoints: Number(record.totalPoints),
    settled: record.seasonCompleted,
    history: parseStoredHistory(record.history),
  }));

  const rows = [...live, ...archived];
  const ranked = rows.filter((row) => row.rank > 0);
  return {
    leaguesPlayed: rows.length,
    seasonsPlayed: new Set([...teams.map((team) => team.league.season.id), ...records.map((r) => r.seasonId)])
      .size,
    totalPoints: Math.round(rows.reduce((sum, row) => sum + row.totalPoints, 0) * 100) / 100,
    bestRank: ranked.length > 0 ? Math.min(...ranked.map((row) => row.rank)) : null,
    // Only seasons that actually ended. Leading an active league is not a win
    // yet, and counting it as one would quietly inflate the number every week.
    titles: rows.filter((row) => row.settled && row.rank === 1).length,
    rows,
  };
}

export interface LeagueInvite {
  id: string;
  name: string;
  commissionerName: string | null;
  showName: string;
  showSlug: string;
  showLexicon: ShowLexicon;
  seasonName: string;
  seasonStatus: 'UPCOMING' | 'ACTIVE' | 'COMPLETED';
  draftStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  rosterSize: number;
  teamCount: number;
  maxTeams: number;
}

/**
 * What an invite code unlocks, for the join page to show before anyone
 * signs in. The code is the invitation: whoever holds it may join, so the
 * league's name, season and seat count are theirs to see. Nothing personal
 * about the members is here — the commissioner's display name, and only so
 * the page can say who invited them.
 */
export async function getLeagueInvite(inviteCode: string): Promise<LeagueInvite | null> {
  const league = await prisma.league.findUnique({
    where: { inviteCode },
    select: {
      id: true,
      name: true,
      rosterSize: true,
      maxTeams: true,
      draftStatus: true,
      commissioner: { select: { name: true, handle: true } },
      season: {
        select: { name: true, status: true, show: { select: { name: true, slug: true, lexicon: true } } },
      },
      _count: { select: { teams: true } },
    },
  });
  if (!league) return null;
  return {
    id: league.id,
    name: league.name,
    commissionerName: league.commissioner.name ?? league.commissioner.handle ?? null,
    showName: league.season.show.name,
    showSlug: league.season.show.slug,
    showLexicon: lexiconFor(league.season.show.slug, league.season.show.lexicon),
    seasonName: league.season.name,
    seasonStatus: league.season.status,
    draftStatus: league.draftStatus,
    rosterSize: league.rosterSize,
    teamCount: league._count.teams,
    maxTeams: league.maxTeams,
  };
}

export interface SeasonHeadline {
  id: string;
  contestantName: string;
  /** The headshot for the ticker card; null when the source has none. */
  contestantPhotoUrl: string | null;
  eventLabel: string;
  points: number;
  occurredAt: Date;
}

/**
 * The most recent real scored events for a season, newest first, for the
 * "what just happened" ticker. Deliberately real data rather than
 * fabricated copy — whatever the ingestion pipeline or an admin has
 * actually recorded. Twelve by default: the ticker is a marquee now, and a
 * loop of eight cards came round too often to feel like a feed.
 */
export async function getRecentHeadlines(seasonId: string, limit = 12): Promise<SeasonHeadline[]> {
  const events = await prisma.scoredEvent.findMany({
    where: { isVoided: false, contestant: { seasonId } },
    orderBy: { occurredAt: 'desc' },
    take: limit,
    select: {
      id: true,
      pointsAwarded: true,
      occurredAt: true,
      contestant: { select: { name: true, photoUrl: true } },
      eventDefinition: { select: { label: true } },
    },
  });

  return events.map((e) => ({
    id: e.id,
    contestantName: e.contestant.name,
    contestantPhotoUrl: e.contestant.photoUrl,
    eventLabel: e.eventDefinition.label,
    points: Number(e.pointsAwarded),
    occurredAt: e.occurredAt,
  }));
}
