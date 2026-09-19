import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createLeague,
  deleteLeagueMessage,
  joinLeague,
  postLeagueMessage,
  toggleMessageReaction,
} from './mutations';
import { getLeagueMessages, getLeagueOverview } from './queries';

/**
 * Integration coverage for joining a league and for the league feed.
 *
 * These talk to a real database on purpose. The bug this file exists to pin
 * down — a joiner getting a PENDING membership and no team, invisible
 * everywhere — lived entirely in the interaction between a schema default, a
 * transaction, and a query's `where` clause. No amount of pure unit testing
 * would have caught it, and it reached production.
 *
 * The suite skips itself when no database is reachable, so `npm test` stays
 * green on a machine that has never run `db:push`.
 */
const prisma = new PrismaClient();

let dbReady = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbReady = true;
} catch {
  dbReady = false;
}

const stamp = `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const userIds: string[] = [];
const leagueIds: string[] = [];

let seasonId = '';
let rulesetId = '';
let alice = '';
let bob = '';
let cara = '';
let outsider = '';

async function makeUser(tag: string): Promise<string> {
  const user = await prisma.user.create({
    data: { authId: `${stamp}-${tag}`, email: `${stamp}-${tag}@example.invalid`, name: `${tag} Tester` },
    select: { id: true },
  });
  userIds.push(user.id);
  return user.id;
}

async function makeLeague(ownerId: string, teamName: string, maxTeams = 4) {
  const league = await createLeague(ownerId, {
    name: `${stamp} league`,
    seasonId,
    scoringRulesetId: rulesetId,
    rosterSize: 3,
    maxTeams,
    isPublic: false,
    teamName,
  });
  leagueIds.push(league.id);
  return league;
}

async function inviteCodeFor(leagueId: string): Promise<string> {
  const { inviteCode } = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: { inviteCode: true },
  });
  return inviteCode;
}

beforeAll(async () => {
  if (!dbReady) return;

  const season = await prisma.season.findFirst({
    where: { status: { not: 'COMPLETED' } },
    select: { id: true, showId: true },
  });
  const ruleset = season
    ? await prisma.scoringRuleset.findFirst({ where: { showId: season.showId }, select: { id: true } })
    : null;

  // An un-seeded database has no season to attach a league to. Treat that the
  // same as having no database rather than failing every assertion.
  if (!season || !ruleset) {
    dbReady = false;
    return;
  }

  seasonId = season.id;
  rulesetId = ruleset.id;
  [alice, bob, cara, outsider] = await Promise.all([
    makeUser('alice'),
    makeUser('bob'),
    makeUser('cara'),
    makeUser('outsider'),
  ]);
});

afterAll(async () => {
  if (leagueIds.length > 0) {
    await prisma.leagueMessageReaction.deleteMany({
      where: { message: { leagueId: { in: leagueIds } } },
    });
    await prisma.leagueMessage.deleteMany({ where: { leagueId: { in: leagueIds } } });
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

describe.skipIf(!dbReady)('joining a league', () => {
  it('gives every joiner an active membership and a team', async () => {
    const league = await makeLeague(alice, 'Alice Squad');
    const code = await inviteCodeFor(league.id);

    await joinLeague(bob, code, 'Bob Squad');
    await joinLeague(cara, code, 'Cara Squad');

    const overview = await getLeagueOverview(league.id);

    expect(overview!.teams).toHaveLength(3);
    expect(overview!.members).toHaveLength(3);
    expect(overview!.members.every((m) => m.status === 'ACTIVE')).toBe(true);

    // The regression itself: a member with no team was invisible on the page.
    for (const member of overview!.members) {
      expect(overview!.teams.some((t) => t.owner?.id === member.user.id)).toBe(true);
    }
  });

  it('assigns draft positions without collision', async () => {
    const league = await makeLeague(alice, 'Alice Squad');
    const code = await inviteCodeFor(league.id);
    await joinLeague(bob, code, 'Bob Squad');
    await joinLeague(cara, code, 'Cara Squad');

    const overview = await getLeagueOverview(league.id);
    // draftOrderPosition is nullable in the schema; a null here would itself
    // be the collision bug resurfacing, so assert on the raw values.
    const positions = [...overview!.teams]
      .map((t) => t.draftOrderPosition)
      .sort((a, b) => (a ?? 0) - (b ?? 0));

    expect(positions).toEqual([1, 2, 3]);
  });

  it('accepts an invite code in any case', async () => {
    const league = await makeLeague(alice, 'Alice Squad');
    const code = await inviteCodeFor(league.id);

    await expect(joinLeague(bob, code.toLowerCase(), 'Bob Squad')).resolves.toBe(league.id);
  });

  it('rejects a second join from the same person', async () => {
    const league = await makeLeague(alice, 'Alice Squad');
    const code = await inviteCodeFor(league.id);
    await joinLeague(bob, code, 'Bob Squad');

    await expect(joinLeague(bob, code, 'Bob Again')).rejects.toMatchObject({
      code: 'ALREADY_MEMBER',
    });
  });

  it('refuses to seat more teams than the league allows', async () => {
    const league = await makeLeague(alice, 'Alice Squad', 2);
    const code = await inviteCodeFor(league.id);
    await joinLeague(bob, code, 'Bob Squad');

    await expect(joinLeague(cara, code, 'Cara Squad')).rejects.toMatchObject({
      code: 'LEAGUE_FULL',
    });
  });

  it('repairs a membership stranded by the old approval gate', async () => {
    const league = await makeLeague(alice, 'Alice Squad');
    const code = await inviteCodeFor(league.id);

    // Recreate the exact wreckage the removed gate left behind in production:
    // a PENDING member with no team and no way to advance.
    await prisma.leagueMember.create({
      data: { leagueId: league.id, userId: bob, role: 'MEMBER', status: 'PENDING' },
    });

    await joinLeague(bob, code, 'Rescued Squad');

    const overview = await getLeagueOverview(league.id);
    const membership = overview!.members.find((m) => m.user.id === bob);

    expect(membership?.status).toBe('ACTIVE');
    expect(overview!.teams.some((t) => t.owner?.id === bob && t.name === 'Rescued Squad')).toBe(true);
  });
});

describe.skipIf(!dbReady)('the league feed', () => {
  it('counts reactions per viewer and toggles them off', async () => {
    const league = await makeLeague(alice, 'Alice Squad');
    await joinLeague(bob, await inviteCodeFor(league.id), 'Bob Squad');

    const message = await postLeagueMessage(league.id, bob, 'Backdooring you week one.');
    await toggleMessageReaction(message.id, alice, 'HYPE');
    await toggleMessageReaction(message.id, bob, 'SHADE');

    let feed = await getLeagueMessages(league.id, alice);
    expect(feed[0]).toMatchObject({ hype: 1, shade: 1, myHype: true, myShade: false, isMine: false });

    // The author's own view of the same row.
    const bobView = await getLeagueMessages(league.id, bob);
    expect(bobView[0]).toMatchObject({ myShade: true, isMine: true });

    // Re-running the same reaction removes it rather than erroring.
    await toggleMessageReaction(message.id, alice, 'HYPE');
    feed = await getLeagueMessages(league.id, alice);
    expect(feed[0]).toMatchObject({ hype: 0, myHype: false });
  });

  it('resolves safely for a signed-out viewer', async () => {
    const league = await makeLeague(alice, 'Alice Squad');
    const message = await postLeagueMessage(league.id, alice, 'hello');
    await toggleMessageReaction(message.id, alice, 'HYPE');

    const feed = await getLeagueMessages(league.id, null);
    expect(feed[0]).toMatchObject({ hype: 1, myHype: false, myShade: false, isMine: false });
  });

  it('orders newest first', async () => {
    const league = await makeLeague(alice, 'Alice Squad');
    await postLeagueMessage(league.id, alice, 'older');
    await postLeagueMessage(league.id, alice, 'newer');

    const feed = await getLeagueMessages(league.id, alice);
    expect(feed.map((m) => m.body)).toEqual(['newer', 'older']);
  });

  it('keeps non-members out of the league entirely', async () => {
    const league = await makeLeague(alice, 'Alice Squad');
    const message = await postLeagueMessage(league.id, alice, 'members only');

    await expect(postLeagueMessage(league.id, outsider, 'let me in')).rejects.toThrow();
    await expect(toggleMessageReaction(message.id, outsider, 'HYPE')).rejects.toThrow();
    await expect(deleteLeagueMessage(message.id, outsider)).rejects.toMatchObject({
      code: 'NOT_MESSAGE_AUTHOR',
    });
  });

  it('lets the commissioner remove someone else’s post, and hides it', async () => {
    const league = await makeLeague(alice, 'Alice Squad');
    await joinLeague(bob, await inviteCodeFor(league.id), 'Bob Squad');
    const message = await postLeagueMessage(league.id, bob, 'delete me');

    await deleteLeagueMessage(message.id, alice);

    const feed = await getLeagueMessages(league.id, alice);
    expect(feed.some((m) => m.id === message.id)).toBe(false);
  });

  it('rejects a blank or over-long body', async () => {
    const league = await makeLeague(alice, 'Alice Squad');

    await expect(postLeagueMessage(league.id, alice, '   ')).rejects.toThrow();
    await expect(postLeagueMessage(league.id, alice, 'x'.repeat(501))).rejects.toThrow();
  });
});
