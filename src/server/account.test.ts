import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eraseUserData, tombstoneEmail } from './account';
import { createLeague, joinLeague, postLeagueMessage, startDraft } from './mutations';

/**
 * Account erasure against a real database, because the whole point is what
 * happens to every row that references the person: it must either go, be
 * emptied, or keep working for the people who are still playing.
 */
const prisma = new PrismaClient();

let dbReady = false;
let seasonId = '';
let rulesetId = '';
try {
  const season = await prisma.season.findFirst({
    where: { status: { not: 'COMPLETED' }, contestants: { some: {} }, cycles: { some: {} } },
    select: { id: true, showId: true },
  });
  const ruleset = season
    ? await prisma.scoringRuleset.findFirst({ where: { showId: season.showId }, select: { id: true } })
    : null;
  if (season && ruleset) {
    seasonId = season.id;
    rulesetId = ruleset.id;
    dbReady = true;
  }
} catch {
  dbReady = false;
}

const stamp = `erase-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const userIds: string[] = [];
const leagueIds: string[] = [];

async function makeUser(tag: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      authId: `${stamp}-${tag}`,
      email: `${stamp}-${tag}@example.invalid`,
      name: `${tag} Tester`,
      handle: `${stamp}-${tag}`,
      emailToken: `${stamp}-${tag}-token`,
    },
    select: { id: true },
  });
  userIds.push(user.id);
  return user.id;
}

async function makeLeague(commissioner: string, name: string) {
  const league = await createLeague(commissioner, {
    name: `${stamp} ${name}`,
    seasonId,
    scoringRulesetId: rulesetId,
    rosterSize: 1,
    maxTeams: 4,
    isPublic: false,
    teamName: 'Commish',
  });
  leagueIds.push(league.id);
  return league;
}

afterAll(async () => {
  if (dbReady) {
    await prisma.league.deleteMany({ where: { id: { in: leagueIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.$disconnect();
});

describe.skipIf(!dbReady)('erasing an account', () => {
  let leaver = '';
  let friend = '';
  let other = '';
  let sharedLeague = '';
  let soloLeague = '';
  let draftedLeague = '';

  beforeAll(async () => {
    leaver = await makeUser('leaver');
    friend = await makeUser('friend');
    other = await makeUser('other');

    // A league the leaver commissions with someone else in it.
    sharedLeague = (await makeLeague(leaver, 'shared')).id;
    await joinLeague(friend, await inviteCode(sharedLeague), 'Friend FC');
    await joinLeague(other, await inviteCode(sharedLeague), 'Other FC');
    // The `other` member joined last but is an ADMIN, so they should inherit.
    await prisma.leagueMember.update({
      where: { leagueId_userId: { leagueId: sharedLeague, userId: other } },
      data: { role: 'ADMIN' },
    });

    // A league the leaver commissions alone.
    soloLeague = (await makeLeague(leaver, 'solo')).id;

    // A league someone else runs, drafted, where the leaver has a team.
    draftedLeague = (await makeLeague(friend, 'drafted')).id;
    await joinLeague(leaver, await inviteCode(draftedLeague), 'Leaver Drafted');
    await startDraft(draftedLeague, friend);

    await postLeagueMessage(sharedLeague, leaver, 'see you all at the finale');
    await prisma.friendship.create({
      data: { requesterId: leaver, addresseeId: friend, status: 'ACCEPTED' },
    });
    await prisma.pushSubscription.create({
      data: { userId: leaver, endpoint: `https://push.example.invalid/${stamp}`, p256dh: 'k', auth: 'a' },
    });
    await prisma.notification.create({
      data: { userId: friend, actorId: leaver, type: 'FRIEND_ACCEPTED', title: 'x' },
    });

    await eraseUserData(leaver);
  });

  async function inviteCode(leagueId: string) {
    const row = await prisma.league.findUniqueOrThrow({
      where: { id: leagueId },
      select: { inviteCode: true },
    });
    return row.inviteCode;
  }

  it('leaves a tombstone with nothing personal on it', async () => {
    const row = await prisma.user.findUniqueOrThrow({ where: { id: leaver } });
    expect(row.email).toBe(tombstoneEmail(leaver));
    expect(row.authId).toBe(`deleted:${leaver}`);
    expect(row.name).toBeNull();
    expect(row.handle).toBeNull();
    expect(row.avatarUrl).toBeNull();
    expect(row.emailToken).toBeNull();
    expect(row.emailNotifications).toBe(false);
  });

  it('hands a shared league to the admin, not the earliest member', async () => {
    const league = await prisma.league.findUniqueOrThrow({
      where: { id: sharedLeague },
      select: { commissionerId: true, members: { select: { userId: true, role: true, status: true } } },
    });
    expect(league.commissionerId).toBe(other);
    expect(league.members.find((m) => m.userId === other)?.role).toBe('COMMISSIONER');
    expect(league.members.find((m) => m.userId === leaver)?.status).toBe('REMOVED');
  });

  it('tells the new commissioner', async () => {
    const note = await prisma.notification.findFirst({
      where: { userId: other, type: 'LEAGUE_UPDATED', href: `/leagues/${sharedLeague}` },
    });
    expect(note?.title).toMatch(/now the commissioner/);
  });

  it('deletes a league nobody else was in', async () => {
    expect(await prisma.league.findUnique({ where: { id: soloLeague } })).toBeNull();
  });

  it('frees the seat in an undrafted league and closes the gap in draft order', async () => {
    const teams = await prisma.team.findMany({
      where: { leagueId: sharedLeague },
      orderBy: { draftOrderPosition: 'asc' },
      select: { ownerId: true, draftOrderPosition: true },
    });
    expect(teams.map((t) => t.ownerId)).not.toContain(leaver);
    expect(teams.map((t) => t.draftOrderPosition)).toEqual([1, 2]);
  });

  it('keeps the team in a drafted league, with no owner name to show', async () => {
    const team = await prisma.team.findFirst({
      where: { leagueId: draftedLeague, ownerId: leaver },
      select: { id: true, owner: { select: { name: true, handle: true } } },
    });
    expect(team).not.toBeNull();
    expect(team?.owner.name).toBeNull();
    expect(team?.owner.handle).toBeNull();
  });

  it('blanks messages rather than merely hiding them', async () => {
    const messages = await prisma.leagueMessage.findMany({ where: { authorId: leaver } });
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe('');
    expect(messages[0].deletedAt).not.toBeNull();
  });

  it('removes friendships, push subscriptions and notifications, and unlinks actor references', async () => {
    expect(
      await prisma.friendship.count({ where: { OR: [{ requesterId: leaver }, { addresseeId: leaver }] } }),
    ).toBe(0);
    expect(await prisma.pushSubscription.count({ where: { userId: leaver } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: leaver } })).toBe(0);
    expect(await prisma.notification.count({ where: { actorId: leaver } })).toBe(0);
  });

  it('refuses an unknown account', async () => {
    await expect(eraseUserData('nope')).rejects.toThrow(/no longer exists/);
  });
});
