import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLeague, joinLeague, updateLeague } from './mutations';
import { canViewLeague, getContestantLeaguesForViewer, getTeamAtRiskNames } from './queries';

/**
 * Who may see what.
 *
 * `isPublic` was a checkbox that gated the JSON routes and nothing else: the
 * league, team and draft *pages* rendered a private league's standings and
 * feed to anyone holding the id, and the public, indexed player page listed
 * every league in the database that had drafted a houseguest. These tests
 * pin the rule the pages now share with the routes, and the at-risk lookup
 * that replaced a ledger replay per league on the home page.
 *
 * Skips itself without a database, like the other server suites.
 */
const prisma = new PrismaClient();

let dbReady = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbReady = true;
} catch {
  dbReady = false;
}

const stamp = `access-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const userIds: string[] = [];
const leagueIds: string[] = [];
const scoredEventIds: string[] = [];

let seasonId = '';
let showId = '';
let rulesetId = '';
let commissioner = '';
let member = '';
let stranger = '';

async function makeUser(tag: string): Promise<string> {
  const user = await prisma.user.create({
    data: { authId: `${stamp}-${tag}`, email: `${stamp}-${tag}@example.invalid`, name: `${tag} Tester` },
    select: { id: true },
  });
  userIds.push(user.id);
  return user.id;
}

async function makeLeague(isPublic: boolean) {
  const league = await createLeague(commissioner, {
    name: `${stamp} ${isPublic ? 'public' : 'private'}`,
    seasonId,
    scoringRulesetId: rulesetId,
    rosterSize: 2,
    maxTeams: 4,
    isPublic,
    teamName: 'Commish Squad',
  });
  leagueIds.push(league.id);
  return league;
}

beforeAll(async () => {
  if (!dbReady) return;

  const season = await prisma.season.findFirst({
    where: { status: { not: 'COMPLETED' }, contestants: { some: {} }, cycles: { some: {} } },
    select: { id: true, showId: true },
  });
  const ruleset = season
    ? await prisma.scoringRuleset.findFirst({ where: { showId: season.showId }, select: { id: true } })
    : null;
  if (!season || !ruleset) {
    dbReady = false;
    return;
  }

  seasonId = season.id;
  showId = season.showId;
  rulesetId = ruleset.id;
  [commissioner, member, stranger] = await Promise.all([
    makeUser('commissioner'),
    makeUser('member'),
    makeUser('stranger'),
  ]);
});

afterAll(async () => {
  if (scoredEventIds.length > 0) {
    await prisma.scoredEvent.deleteMany({ where: { id: { in: scoredEventIds } } });
  }
  if (leagueIds.length > 0) {
    await prisma.draftPick.deleteMany({ where: { leagueId: { in: leagueIds } } });
    await prisma.rosterSlot.deleteMany({ where: { team: { leagueId: { in: leagueIds } } } });
    await prisma.team.deleteMany({ where: { leagueId: { in: leagueIds } } });
    await prisma.leagueMember.deleteMany({ where: { leagueId: { in: leagueIds } } });
    await prisma.league.deleteMany({ where: { id: { in: leagueIds } } });
  }
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.$disconnect();
});

describe.skipIf(!dbReady)('who may view a league', () => {
  it('lets anyone, signed in or not, view a public league', async () => {
    const league = await makeLeague(true);

    await expect(canViewLeague(league.id, null)).resolves.toBe(true);
    await expect(canViewLeague(league.id, stranger)).resolves.toBe(true);
  });

  it('shows a private league to its members only', async () => {
    const league = await makeLeague(false);
    const { inviteCode } = await prisma.league.findUniqueOrThrow({
      where: { id: league.id },
      select: { inviteCode: true },
    });
    await joinLeague(member, inviteCode, 'Member Squad');

    await expect(canViewLeague(league.id, commissioner)).resolves.toBe(true);
    await expect(canViewLeague(league.id, member)).resolves.toBe(true);
    await expect(canViewLeague(league.id, stranger)).resolves.toBe(false);
    await expect(canViewLeague(league.id, null)).resolves.toBe(false);
  });

  it('does not count a removed member', async () => {
    const league = await makeLeague(false);
    await prisma.leagueMember.create({
      data: { leagueId: league.id, userId: member, role: 'MEMBER', status: 'REMOVED' },
    });

    await expect(canViewLeague(league.id, member)).resolves.toBe(false);
  });

  it('follows the flag when a commissioner changes it', async () => {
    const league = await makeLeague(false);
    await expect(canViewLeague(league.id, stranger)).resolves.toBe(false);

    await updateLeague(league.id, commissioner, {
      name: league.name,
      scoringRulesetId: rulesetId,
      rosterSize: 2,
      maxTeams: 4,
      isPublic: true,
      lockOffsetMinutes: null,
      chatWebhookUrl: null,
    });

    await expect(canViewLeague(league.id, stranger)).resolves.toBe(true);
  });

  it('answers false for a league that does not exist', async () => {
    await expect(canViewLeague('no-such-league', commissioner)).resolves.toBe(false);
  });
});

describe.skipIf(!dbReady)("a houseguest's leagues, as one viewer sees them", () => {
  async function draftInto(leagueId: string, ownerId: string, contestantId: string) {
    const team = await prisma.team.findUniqueOrThrow({
      where: { leagueId_ownerId: { leagueId, ownerId } },
      select: { id: true },
    });
    await prisma.draftPick.create({
      data: { leagueId, teamId: team.id, contestantId, round: 1, pickNumber: 1 },
    });
    return team.id;
  }

  it('lists only leagues the viewer belongs to, and nothing when signed out', async () => {
    const contestant = await prisma.contestant.findFirstOrThrow({
      where: { seasonId },
      select: { id: true },
    });
    const mine = await makeLeague(false);
    const theirs = await makeLeague(false);
    await draftInto(mine.id, commissioner, contestant.id);
    await draftInto(theirs.id, commissioner, contestant.id);

    // `member` is in `mine` and not in `theirs`.
    const { inviteCode } = await prisma.league.findUniqueOrThrow({
      where: { id: mine.id },
      select: { inviteCode: true },
    });
    await joinLeague(member, inviteCode, 'Member Squad');

    const seen = await getContestantLeaguesForViewer(contestant.id, member);
    expect(seen.map((line) => line.leagueId)).toEqual([mine.id]);
    expect(seen[0]).toMatchObject({ leagueName: mine.name, teamName: 'Commish Squad' });

    // The commissioner is in both.
    const both = await getContestantLeaguesForViewer(contestant.id, commissioner);
    expect(both.map((line) => line.leagueId).sort()).toEqual([mine.id, theirs.id].sort());

    // A stranger, or nobody, sees neither — the page is public and indexed.
    await expect(getContestantLeaguesForViewer(contestant.id, stranger)).resolves.toEqual([]);
    await expect(getContestantLeaguesForViewer(contestant.id, null)).resolves.toEqual([]);
  });
});

describe.skipIf(!dbReady)('who is on the block', () => {
  async function record(contestantId: string, code: string, cycleId: string, isVoided = false) {
    const definition = await prisma.eventDefinition.findUniqueOrThrow({
      where: { showId_code: { showId, code } },
      select: { id: true, points: true },
    });
    const event = await prisma.scoredEvent.create({
      data: {
        contestantId,
        eventDefinitionId: definition.id,
        cycleId,
        pointsAwarded: definition.points,
        isVoided,
        recordedById: commissioner,
      },
      select: { id: true },
    });
    scoredEventIds.push(event.id);
  }

  it('names the rostered houseguests nominated in the latest scored week, and no one else', async () => {
    const league = await makeLeague(false);
    const team = await prisma.team.findFirstOrThrow({ where: { leagueId: league.id }, select: { id: true } });
    const [rostered, alsoRostered, rival] = await prisma.contestant.findMany({
      where: { seasonId },
      orderBy: { name: 'asc' },
      take: 3,
      select: { id: true, name: true },
    });
    // The season's last two weeks: the seed has already scored its early
    // weeks for every houseguest, and this test needs weeks nobody has.
    const [week2, week1] = await prisma.cycle.findMany({
      where: { seasonId },
      orderBy: { sequence: 'desc' },
      take: 2,
      select: { id: true },
    });
    for (const [pickNumber, contestant] of [rostered, alsoRostered].entries()) {
      await prisma.draftPick.create({
        data: {
          leagueId: league.id,
          teamId: team.id,
          contestantId: contestant.id,
          round: 1,
          pickNumber: pickNumber + 1,
        },
      });
    }

    // Nothing scored yet: nobody is at risk.
    await expect(getTeamAtRiskNames(team.id)).resolves.toEqual([]);

    // Week 1: one of ours nominated. Week 2: our other houseguest scored
    // something else, a rival was nominated, and a nomination of ours was
    // voided. Only week 2 counts, and only real, rostered nominations.
    await record(rostered.id, 'NOMINATED', week1.id);
    await expect(getTeamAtRiskNames(team.id)).resolves.toEqual([rostered.name]);

    await record(alsoRostered.id, 'HOH_WIN', week2.id);
    await record(rival.id, 'NOMINATED', week2.id);
    await record(rostered.id, 'NOMINATED', week2.id, true);
    await expect(getTeamAtRiskNames(team.id)).resolves.toEqual([]);

    // A live nomination in the latest week surfaces, once, even if recorded twice.
    await record(alsoRostered.id, 'NOMINATED', week2.id);
    await record(alsoRostered.id, 'NOMINATED', week2.id);
    await expect(getTeamAtRiskNames(team.id)).resolves.toEqual([alsoRostered.name]);
  });
});
