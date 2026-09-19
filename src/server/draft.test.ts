import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLeague, joinLeague, makeDraftPick, startDraft } from './mutations';

/**
 * Integration coverage for the draft.
 *
 * `validatePick` and `buildDraftOrder` are pure and unit tested, but the parts
 * that can actually corrupt a season are not pure: the transaction fans a pick
 * out into a RosterSlot for every cycle, and the final pick flips the league to
 * COMPLETED. Both only exist against a database, and a roster slot that fails
 * to land is silent — the team simply scores nothing that week.
 *
 * Skips itself when no database is reachable, like the other integration file.
 */
const prisma = new PrismaClient();

let dbReady = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbReady = true;
} catch {
  dbReady = false;
}

const stamp = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const userIds: string[] = [];
const leagueIds: string[] = [];

let seasonId = '';
let rulesetId = '';
let cycleCount = 0;
let contestantIds: string[] = [];
let alice = '';
let bob = '';

async function makeUser(tag: string): Promise<string> {
  const user = await prisma.user.create({
    data: { authId: `${stamp}-${tag}`, email: `${stamp}-${tag}@example.invalid`, name: `${tag}` },
    select: { id: true },
  });
  userIds.push(user.id);
  return user.id;
}

/** A two-team, two-round league already in progress — four picks total. */
async function startedLeague() {
  const league = await createLeague(alice, {
    name: `${stamp} draft`,
    seasonId,
    scoringRulesetId: rulesetId,
    rosterSize: 2,
    maxTeams: 2,
    isPublic: false,
    teamName: 'Alice Squad',
  });
  leagueIds.push(league.id);

  await joinLeague(bob, (await prisma.league.findUniqueOrThrow({
    where: { id: league.id },
    select: { inviteCode: true },
  })).inviteCode, 'Bob Squad');

  await startDraft(league.id, alice);

  const teams = await prisma.team.findMany({
    where: { leagueId: league.id },
    orderBy: { draftOrderPosition: 'asc' },
    select: { id: true, ownerId: true },
  });
  return { leagueId: league.id, teams };
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
  rulesetId = ruleset.id;
  cycleCount = await prisma.cycle.count({ where: { seasonId } });
  contestantIds = (
    await prisma.contestant.findMany({ where: { seasonId }, select: { id: true }, take: 6 })
  ).map((c) => c.id);

  if (contestantIds.length < 5) {
    dbReady = false;
    return;
  }

  [alice, bob] = await Promise.all([makeUser('alice'), makeUser('bob')]);
});

afterAll(async () => {
  if (leagueIds.length > 0) {
    await prisma.draftPick.deleteMany({ where: { leagueId: { in: leagueIds } } });
    await prisma.rosterSlot.deleteMany({ where: { team: { leagueId: { in: leagueIds } } } });
    await prisma.team.deleteMany({ where: { leagueId: { in: leagueIds } } });
    await prisma.leagueMember.deleteMany({ where: { leagueId: { in: leagueIds } } });
    await prisma.league.deleteMany({ where: { id: { in: leagueIds } } });
  }
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe.skipIf(!dbReady)('starting a draft', () => {
  it('refuses a league with only one team', async () => {
    const league = await createLeague(alice, {
      name: `${stamp} lonely`,
      seasonId,
      scoringRulesetId: rulesetId,
      rosterSize: 2,
      maxTeams: 4,
      isPublic: false,
      teamName: 'Alice Squad',
    });
    leagueIds.push(league.id);

    await expect(startDraft(league.id, alice)).rejects.toMatchObject({
      code: 'NOT_ENOUGH_TEAMS',
    });
  });

  it('refuses someone who is not the commissioner', async () => {
    const { leagueId } = await startedLeague();
    await expect(startDraft(leagueId, bob)).rejects.toThrow();
  });

  it('refuses a pick before the draft has started', async () => {
    const league = await createLeague(alice, {
      name: `${stamp} unstarted`,
      seasonId,
      scoringRulesetId: rulesetId,
      rosterSize: 2,
      maxTeams: 2,
      isPublic: false,
      teamName: 'Alice Squad',
    });
    leagueIds.push(league.id);
    const team = await prisma.team.findFirstOrThrow({
      where: { leagueId: league.id },
      select: { id: true },
    });

    await expect(
      makeDraftPick({
        leagueId: league.id,
        teamId: team.id,
        contestantId: contestantIds[0],
        userId: alice,
      }),
    ).rejects.toMatchObject({ code: 'DRAFT_NOT_RUNNING' });
  });
});

describe.skipIf(!dbReady)('making a pick', () => {
  it('rosters the contestant in every cycle of the season', async () => {
    const { leagueId, teams } = await startedLeague();

    await makeDraftPick({
      leagueId,
      teamId: teams[0].id,
      contestantId: contestantIds[0],
      userId: teams[0].ownerId!,
    });

    // The fan-out is what makes the pick score at all. One slot per cycle,
    // no more (the unique constraint) and no fewer.
    const slots = await prisma.rosterSlot.count({
      where: { teamId: teams[0].id, contestantId: contestantIds[0] },
    });
    expect(slots).toBe(cycleCount);
    expect(cycleCount).toBeGreaterThan(0);
  });

  it('rejects a pick from the team that is not on the clock', async () => {
    const { leagueId, teams } = await startedLeague();

    // Team at position 1 picks first, so team 2 acting now is out of turn.
    await expect(
      makeDraftPick({
        leagueId,
        teamId: teams[1].id,
        contestantId: contestantIds[0],
        userId: teams[1].ownerId!,
      }),
    ).rejects.toMatchObject({ code: 'NOT_ON_THE_CLOCK' });
  });

  it('rejects picking for a team you do not own', async () => {
    const { leagueId, teams } = await startedLeague();

    await expect(
      makeDraftPick({
        leagueId,
        teamId: teams[0].id,
        contestantId: contestantIds[0],
        userId: teams[1].ownerId!,
      }),
    ).rejects.toMatchObject({ code: 'NOT_TEAM_OWNER' });
  });

  it('rejects a contestant somebody already took', async () => {
    const { leagueId, teams } = await startedLeague();

    await makeDraftPick({
      leagueId,
      teamId: teams[0].id,
      contestantId: contestantIds[0],
      userId: teams[0].ownerId!,
    });

    await expect(
      makeDraftPick({
        leagueId,
        teamId: teams[1].id,
        contestantId: contestantIds[0],
        userId: teams[1].ownerId!,
      }),
    ).rejects.toMatchObject({ code: 'CONTESTANT_TAKEN' });
  });

  it('snakes the order and completes the league on the final pick', async () => {
    const { leagueId, teams } = await startedLeague();

    // Two teams, two rounds: 1, 2, then 2, 1.
    const order = [teams[0], teams[1], teams[1], teams[0]];
    for (const [i, team] of order.entries()) {
      await makeDraftPick({
        leagueId,
        teamId: team.id,
        contestantId: contestantIds[i],
        userId: team.ownerId!,
      });
    }

    const league = await prisma.league.findUniqueOrThrow({
      where: { id: leagueId },
      select: { draftStatus: true, draftCompletedAt: true },
    });
    expect(league.draftStatus).toBe('COMPLETED');
    expect(league.draftCompletedAt).not.toBeNull();

    const picks = await prisma.draftPick.findMany({
      where: { leagueId },
      orderBy: { pickNumber: 'asc' },
      select: { pickNumber: true, round: true, teamId: true },
    });
    expect(picks.map((p) => p.pickNumber)).toEqual([1, 2, 3, 4]);
    expect(picks.map((p) => p.round)).toEqual([1, 1, 2, 2]);
    expect(picks.map((p) => p.teamId)).toEqual([teams[0].id, teams[1].id, teams[1].id, teams[0].id]);

    // A completed draft must not accept a fifth pick.
    await expect(
      makeDraftPick({
        leagueId,
        teamId: teams[0].id,
        contestantId: contestantIds[4],
        userId: teams[0].ownerId!,
      }),
    ).rejects.toMatchObject({ code: 'DRAFT_NOT_RUNNING' });
  });
});
