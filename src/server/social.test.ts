import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLeague, deleteLeague, joinLeague, startDraft, updateLeague } from './mutations';
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from './notifications';
import { getAccountOverview, getHomeLeagues } from './queries';
import {
  getFriendOverview,
  getInvitableFriends,
  inviteFriendToLeague,
  removeFriend,
  respondToFriendRequest,
  searchPeople,
  sendFriendRequest,
} from './social';

/**
 * Integration coverage for the social graph, notifications and league
 * settings.
 *
 * All three are things a pure unit test cannot reach: a friendship is only
 * correct if it reads the same from both directions, a notification is only
 * useful if it survives the thing it describes being deleted, and the league
 * settings rules exist to stop a database from being corrupted mid-draft.
 *
 * Skips itself when no database is reachable, like the other integration
 * files, so `npm test` stays green on a machine that has never run db:push.
 */
const prisma = new PrismaClient();

let dbReady = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbReady = true;
} catch {
  dbReady = false;
}

const stamp = `social-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const userIds: string[] = [];
const leagueIds: string[] = [];

let seasonId = '';
let rulesetId = '';
let altRulesetId = '';
let ana = '';
let ben = '';
let cleo = '';

async function makeUser(tag: string, name?: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      authId: `${stamp}-${tag}`,
      email: `${stamp}-${tag}@example.invalid`,
      name: name ?? tag,
      handle: `${stamp}-${tag}`,
    },
    select: { id: true },
  });
  userIds.push(user.id);
  return user.id;
}

async function makeLeague(ownerId: string, maxTeams = 4) {
  const league = await createLeague(ownerId, {
    name: `${stamp} league ${leagueIds.length}`,
    seasonId,
    scoringRulesetId: rulesetId,
    rosterSize: 2,
    maxTeams,
    isPublic: false,
    teamName: 'Owner Squad',
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

/** Makes two accounts actual friends, the long way round, so the helper is honest. */
async function befriend(a: string, b: string) {
  await sendFriendRequest(a, b);
  const { incoming } = await getFriendOverview(b);
  const request = incoming.find((r) => r.userId === a)!;
  await respondToFriendRequest(b, request.friendshipId, true);
}

beforeAll(async () => {
  if (!dbReady) return;

  const season = await prisma.season.findFirst({
    where: { status: { not: 'COMPLETED' }, cycles: { some: {} } },
    select: { id: true, showId: true },
  });
  const rulesets = season
    ? await prisma.scoringRuleset.findMany({ where: { showId: season.showId }, select: { id: true } })
    : [];
  if (!season || rulesets.length === 0) {
    dbReady = false;
    return;
  }

  seasonId = season.id;
  rulesetId = rulesets[0].id;
  altRulesetId = rulesets[1]?.id ?? rulesets[0].id;
  [ana, ben, cleo] = await Promise.all([
    makeUser('ana', 'Ana Tester'),
    makeUser('ben', 'Ben Tester'),
    makeUser('cleo', 'Cleo Tester'),
  ]);
});

afterAll(async () => {
  if (leagueIds.length > 0) {
    await prisma.draftPick.deleteMany({ where: { leagueId: { in: leagueIds } } });
    await prisma.rosterSlot.deleteMany({ where: { team: { leagueId: { in: leagueIds } } } });
    await prisma.teamCycleScore.deleteMany({ where: { team: { leagueId: { in: leagueIds } } } });
    await prisma.team.deleteMany({ where: { leagueId: { in: leagueIds } } });
    await prisma.leagueMember.deleteMany({ where: { leagueId: { in: leagueIds } } });
    await prisma.league.deleteMany({ where: { id: { in: leagueIds } } });
  }
  // Friendships and notifications cascade off the user rows.
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe.skipIf(!dbReady)('friend requests', () => {
  it('shows up as outgoing for the sender and incoming for the receiver', async () => {
    const [x, y] = await Promise.all([makeUser('out-x'), makeUser('out-y')]);
    await sendFriendRequest(x, y);

    const [forX, forY] = await Promise.all([getFriendOverview(x), getFriendOverview(y)]);

    expect(forX.outgoing.map((r) => r.userId)).toContain(y);
    expect(forX.incoming).toHaveLength(0);
    expect(forY.incoming.map((r) => r.userId)).toContain(x);
    expect(forY.friends).toHaveLength(0);
  });

  it('refuses to friend yourself', async () => {
    await expect(sendFriendRequest(ana, ana)).rejects.toMatchObject({ code: 'SELF_FRIEND' });
  });

  it('refuses a second request in the same direction', async () => {
    const [x, y] = await Promise.all([makeUser('dup-x'), makeUser('dup-y')]);
    await sendFriendRequest(x, y);
    await expect(sendFriendRequest(x, y)).rejects.toMatchObject({ code: 'REQUEST_PENDING' });
  });

  it('reads as a friendship from both sides once accepted', async () => {
    const [x, y] = await Promise.all([makeUser('acc-x'), makeUser('acc-y')]);
    await befriend(x, y);

    const [forX, forY] = await Promise.all([getFriendOverview(x), getFriendOverview(y)]);

    // The row is directed; the friendship is not. Both sides have to see it.
    expect(forX.friends.map((f) => f.userId)).toContain(y);
    expect(forY.friends.map((f) => f.userId)).toContain(x);
    expect(forX.outgoing).toHaveLength(0);
    expect(forY.incoming).toHaveLength(0);
  });

  it('accepts immediately when both people asked each other', async () => {
    const [x, y] = await Promise.all([makeUser('mut-x'), makeUser('mut-y')]);
    await sendFriendRequest(x, y);

    const result = await sendFriendRequest(y, x);

    expect(result.status).toBe('ACCEPTED');
    const forX = await getFriendOverview(x);
    expect(forX.friends.map((f) => f.userId)).toContain(y);
    expect(forX.outgoing).toHaveLength(0);
  });

  it('leaves no phantom request when two requests race', async () => {
    const [x, y] = await Promise.all([makeUser('race-x'), makeUser('race-y')]);

    // Both inserts succeed: the unique constraint only stops the same
    // direction twice, so a genuine race produces two PENDING rows.
    await prisma.friendship.createMany({
      data: [
        { requesterId: x, addresseeId: y, status: 'PENDING' },
        { requesterId: y, addresseeId: x, status: 'PENDING' },
      ],
    });

    const { incoming } = await getFriendOverview(y);
    await respondToFriendRequest(y, incoming.find((r) => r.userId === x)!.friendshipId, true);

    const [forX, forY] = await Promise.all([getFriendOverview(x), getFriendOverview(y)]);
    expect(forX.friends.map((f) => f.userId)).toContain(y);
    // The mirror must be gone, or X stares at a pending request from someone
    // who is already their friend.
    expect(forX.incoming).toHaveLength(0);
    expect(forY.outgoing).toHaveLength(0);
  });

  it('does not make friends out of a decline', async () => {
    const [x, y] = await Promise.all([makeUser('dec-x'), makeUser('dec-y')]);
    await sendFriendRequest(x, y);
    const { incoming } = await getFriendOverview(y);
    await respondToFriendRequest(y, incoming[0].friendshipId, false);

    const forX = await getFriendOverview(x);
    expect(forX.friends).toHaveLength(0);
    expect(forX.outgoing).toHaveLength(0);
  });

  it('refuses to answer a request addressed to somebody else', async () => {
    const [x, y] = await Promise.all([makeUser('own-x'), makeUser('own-y')]);
    await sendFriendRequest(x, y);
    const { incoming } = await getFriendOverview(y);

    await expect(respondToFriendRequest(cleo, incoming[0].friendshipId, true)).rejects.toMatchObject({
      code: 'REQUEST_NOT_FOUND',
    });
  });

  it('unfriends from either side', async () => {
    const [x, y] = await Promise.all([makeUser('rm-x'), makeUser('rm-y')]);
    await befriend(x, y);

    // Removed by the person who did NOT send the original request.
    await removeFriend(y, x);

    const [forX, forY] = await Promise.all([getFriendOverview(x), getFriendOverview(y)]);
    expect(forX.friends).toHaveLength(0);
    expect(forY.friends).toHaveLength(0);
  });
});

describe.skipIf(!dbReady)('finding people', () => {
  it('matches a handle fragment', async () => {
    const results = await searchPeople(ana, `${stamp}-ben`);
    expect(results.map((r) => r.userId)).toContain(ben);
  });

  it('matches an email only in full', async () => {
    const full = await searchPeople(ana, `${stamp}-ben@example.invalid`);
    expect(full.map((r) => r.userId)).toContain(ben);

    // A partial email must not match, or the box becomes a directory scraper.
    const partial = await searchPeople(ana, '@example.invalid');
    expect(partial.map((r) => r.userId)).not.toContain(ben);
  });

  it('never returns the searcher', async () => {
    const results = await searchPeople(ana, `${stamp}-ana`);
    expect(results.map((r) => r.userId)).not.toContain(ana);
  });

  it('reports the existing relationship so the button knows what to offer', async () => {
    const [x, y] = await Promise.all([makeUser('rel-x'), makeUser('rel-y')]);
    await sendFriendRequest(x, y);

    const fromSender = await searchPeople(x, `${stamp}-rel-y`);
    expect(fromSender.find((r) => r.userId === y)?.relation).toBe('REQUEST_SENT');

    const fromReceiver = await searchPeople(y, `${stamp}-rel-x`);
    expect(fromReceiver.find((r) => r.userId === x)?.relation).toBe('REQUEST_RECEIVED');
  });
});

describe.skipIf(!dbReady)('inviting friends to a league', () => {
  it('sends an invite carrying the league code', async () => {
    const [host, guest] = await Promise.all([makeUser('inv-host'), makeUser('inv-guest')]);
    await befriend(host, guest);
    const league = await makeLeague(host);

    await inviteFriendToLeague(host, guest, league.id);

    const notifications = await getNotifications(guest);
    const invite = notifications.find((n) => n.type === 'LEAGUE_INVITE');
    expect(invite).toBeDefined();
    // The deep link is the whole point — it lands on a prefilled join form.
    expect(invite!.href).toContain(encodeURIComponent(await inviteCodeFor(league.id)));
  });

  it('refuses to invite someone who is not a friend', async () => {
    const league = await makeLeague(ana);
    await expect(inviteFriendToLeague(ana, cleo, league.id)).rejects.toMatchObject({
      code: 'NOT_FRIENDS',
    });
  });

  it('refuses to invite into a league you are not in', async () => {
    const [host, guest] = await Promise.all([makeUser('out-host'), makeUser('out-guest')]);
    await befriend(host, guest);
    const league = await makeLeague(ana);

    await expect(inviteFriendToLeague(host, guest, league.id)).rejects.toMatchObject({
      code: 'NOT_A_MEMBER',
    });
  });

  it('refuses once the draft has started, rather than sending a dead invite', async () => {
    const [host, guest] = await Promise.all([makeUser('drf-host'), makeUser('drf-guest')]);
    await befriend(host, guest);
    const league = await makeLeague(host);
    await joinLeague(cleo, await inviteCodeFor(league.id), 'Cleo Squad');
    await startDraft(league.id, host);

    await expect(inviteFriendToLeague(host, guest, league.id)).rejects.toMatchObject({
      code: 'DRAFT_STARTED',
    });
  });

  it('keeps existing members in the list, marked as already in', async () => {
    const [host, guest] = await Promise.all([makeUser('mark-host'), makeUser('mark-guest')]);
    await befriend(host, guest);
    const league = await makeLeague(host);
    await joinLeague(guest, await inviteCodeFor(league.id), 'Guest Squad');

    const friends = await getInvitableFriends(host, league.id);
    const row = friends.find((f) => f.userId === guest);
    expect(row).toBeDefined();
    expect(row!.alreadyIn).toBe(true);
  });
});

describe.skipIf(!dbReady)('notifications', () => {
  it('tells the commissioner when somebody joins', async () => {
    const host = await makeUser('join-host');
    const joiner = await makeUser('join-guest');
    const league = await makeLeague(host);

    await joinLeague(joiner, await inviteCodeFor(league.id), 'Joiner Squad');

    const notifications = await getNotifications(host);
    expect(notifications.some((n) => n.type === 'LEAGUE_MEMBER_JOINED')).toBe(true);
  });

  it('tells everyone when the draft starts, since a snake draft stalls without them', async () => {
    const host = await makeUser('ds-host');
    const other = await makeUser('ds-other');
    const league = await makeLeague(host);
    await joinLeague(other, await inviteCodeFor(league.id), 'Other Squad');

    await startDraft(league.id, host);

    const forOther = await getNotifications(other);
    const started = forOther.find((n) => n.type === 'LEAGUE_DRAFT_STARTED');
    expect(started).toBeDefined();
    expect(started!.href).toBe(`/leagues/${league.id}/draft`);
  });

  it('never notifies someone about their own action', async () => {
    const host = await makeUser('self-host');
    const other = await makeUser('self-other');
    const league = await makeLeague(host);
    await joinLeague(other, await inviteCodeFor(league.id), 'Other Squad');

    await startDraft(league.id, host);

    const forHost = await getNotifications(host);
    expect(forHost.some((n) => n.type === 'LEAGUE_DRAFT_STARTED')).toBe(false);
  });

  it('counts and clears unread', async () => {
    const [x, y] = await Promise.all([makeUser('unread-x'), makeUser('unread-y')]);
    await sendFriendRequest(x, y);

    expect(await getUnreadNotificationCount(y)).toBe(1);

    const [notification] = await getNotifications(y);
    await markNotificationRead(notification.id, y);
    expect(await getUnreadNotificationCount(y)).toBe(0);
  });

  it('will not let one account mark another account’s notification read', async () => {
    const [x, y] = await Promise.all([makeUser('leak-x'), makeUser('leak-y')]);
    await sendFriendRequest(x, y);
    const [notification] = await getNotifications(y);

    // Scoped by userId in the WHERE, so this is a no-op rather than a leak.
    await markNotificationRead(notification.id, cleo);

    expect(await getUnreadNotificationCount(y)).toBe(1);
  });

  it('marks everything read at once', async () => {
    const target = await makeUser('all-read');
    await sendFriendRequest(ana, target);
    await sendFriendRequest(ben, target);

    expect(await getUnreadNotificationCount(target)).toBe(2);
    await markAllNotificationsRead(target);
    expect(await getUnreadNotificationCount(target)).toBe(0);
  });
});

describe.skipIf(!dbReady)('league settings', () => {
  it('renames without pinging everybody', async () => {
    const host = await makeUser('ren-host');
    const other = await makeUser('ren-other');
    const league = await makeLeague(host);
    await joinLeague(other, await inviteCodeFor(league.id), 'Other Squad');
    await markAllNotificationsRead(other);

    await updateLeague(league.id, host, {
      name: 'Renamed League',
      scoringRulesetId: rulesetId,
      rosterSize: 2,
      maxTeams: 4,
      isPublic: false,
      lockOffsetMinutes: null,
      chatWebhookUrl: null,
    });

    const after = await prisma.league.findUniqueOrThrow({
      where: { id: league.id },
      select: { name: true },
    });
    expect(after.name).toBe('Renamed League');
    // A typo fix is not worth interrupting eight people for.
    expect(await getUnreadNotificationCount(other)).toBe(0);
  });

  it('notifies members when something that affects play changes', async () => {
    const host = await makeUser('notify-host');
    const other = await makeUser('notify-other');
    const league = await makeLeague(host);
    await joinLeague(other, await inviteCodeFor(league.id), 'Other Squad');
    await markAllNotificationsRead(other);

    await updateLeague(league.id, host, {
      name: league.name,
      scoringRulesetId: rulesetId,
      rosterSize: 4,
      maxTeams: 4,
      isPublic: false,
      lockOffsetMinutes: null,
      chatWebhookUrl: null,
    });

    const notifications = await getNotifications(other);
    expect(notifications.some((n) => n.type === 'LEAGUE_UPDATED')).toBe(true);
  });

  it('refuses a member who is not the commissioner', async () => {
    const host = await makeUser('perm-host');
    const other = await makeUser('perm-other');
    const league = await makeLeague(host);
    await joinLeague(other, await inviteCodeFor(league.id), 'Other Squad');

    await expect(
      updateLeague(league.id, other, {
        name: 'Hostile Takeover',
        scoringRulesetId: rulesetId,
        rosterSize: 2,
        maxTeams: 4,
        isPublic: false,
        lockOffsetMinutes: null,
        chatWebhookUrl: null,
      }),
    ).rejects.toThrow();
  });

  it('refuses a cap below the teams already seated', async () => {
    const host = await makeUser('cap-host');
    const [second, third] = await Promise.all([makeUser('cap-2'), makeUser('cap-3')]);
    const league = await makeLeague(host);
    const code = await inviteCodeFor(league.id);
    await joinLeague(second, code, 'Second Squad');
    await joinLeague(third, code, 'Third Squad');

    // Three seated, capping at two. Has to be a number Zod itself accepts,
    // or the test passes on the wrong error.
    await expect(
      updateLeague(league.id, host, {
        name: league.name,
        scoringRulesetId: rulesetId,
        rosterSize: 2,
        maxTeams: 2,
        isPublic: false,
        lockOffsetMinutes: null,
        chatWebhookUrl: null,
      }),
    ).rejects.toMatchObject({ code: 'MAX_TEAMS_BELOW_CURRENT' });
  });

  it('freezes roster size once the draft is running', async () => {
    const host = await makeUser('lock-host');
    const other = await makeUser('lock-other');
    const league = await makeLeague(host);
    await joinLeague(other, await inviteCodeFor(league.id), 'Other Squad');
    await startDraft(league.id, host);

    await expect(
      updateLeague(league.id, host, {
        name: league.name,
        scoringRulesetId: rulesetId,
        rosterSize: 5,
        maxTeams: 4,
        isPublic: false,
        lockOffsetMinutes: null,
        chatWebhookUrl: null,
      }),
    ).rejects.toMatchObject({ code: 'ROSTER_SIZE_LOCKED' });
  });

  it('freezes scoring once the draft is running', async () => {
    if (altRulesetId === rulesetId) return; // only one ruleset seeded
    const host = await makeUser('score-host');
    const other = await makeUser('score-other');
    const league = await makeLeague(host);
    await joinLeague(other, await inviteCodeFor(league.id), 'Other Squad');
    await startDraft(league.id, host);

    await expect(
      updateLeague(league.id, host, {
        name: league.name,
        scoringRulesetId: altRulesetId,
        rosterSize: 2,
        maxTeams: 4,
        isPublic: false,
        lockOffsetMinutes: null,
        chatWebhookUrl: null,
      }),
    ).rejects.toMatchObject({ code: 'RULESET_LOCKED' });
  });
});

describe.skipIf(!dbReady)('roster lock offset', () => {
  it('persists the offset and clears it back to the season default', async () => {
    const host = await makeUser('lock-off');
    const league = await makeLeague(host);

    await updateLeague(league.id, host, {
      name: league.name,
      scoringRulesetId: rulesetId,
      rosterSize: 2,
      maxTeams: 4,
      isPublic: false,
      lockOffsetMinutes: 60,
      chatWebhookUrl: null,
    });
    expect(
      (
        await prisma.league.findUniqueOrThrow({
          where: { id: league.id },
          select: { lockOffsetMinutes: true },
        })
      ).lockOffsetMinutes,
    ).toBe(60);

    // Null is a real choice, not an absent field: back to the season schedule.
    await updateLeague(league.id, host, {
      name: league.name,
      scoringRulesetId: rulesetId,
      rosterSize: 2,
      maxTeams: 4,
      isPublic: false,
      lockOffsetMinutes: null,
      chatWebhookUrl: null,
    });
    expect(
      (
        await prisma.league.findUniqueOrThrow({
          where: { id: league.id },
          select: { lockOffsetMinutes: true },
        })
      ).lockOffsetMinutes,
    ).toBeNull();
  });

  it('keeps zero, rather than treating it as no preference', async () => {
    const host = await makeUser('lock-zero');
    const league = await makeLeague(host);

    // 0 means "lock exactly at airtime" — a real, later deadline than the
    // season default. A falsy check would silently store null instead.
    await updateLeague(league.id, host, {
      name: league.name,
      scoringRulesetId: rulesetId,
      rosterSize: 2,
      maxTeams: 4,
      isPublic: false,
      lockOffsetMinutes: 0,
      chatWebhookUrl: null,
    });

    const saved = await prisma.league.findUniqueOrThrow({
      where: { id: league.id },
      select: { lockOffsetMinutes: true },
    });
    expect(saved.lockOffsetMinutes).toBe(0);
  });

  it('moves the deadline the home rail shows', async () => {
    const host = await makeUser('lock-rail');
    const league = await makeLeague(host);

    const seasonDefault = (await getHomeLeagues(host)).find((l) => l.leagueId === league.id)!;
    if (seasonDefault.locksAt === null) return; // season has no scheduled cycle

    await updateLeague(league.id, host, {
      name: league.name,
      scoringRulesetId: rulesetId,
      rosterSize: 2,
      maxTeams: 4,
      isPublic: false,
      lockOffsetMinutes: 1440,
      chatWebhookUrl: null,
    });

    const shifted = (await getHomeLeagues(host)).find((l) => l.leagueId === league.id)!;
    const cycle = await prisma.cycle.findFirstOrThrow({
      where: { seasonId, status: { not: 'SCORED' } },
      orderBy: { sequence: 'asc' },
      select: { airsAt: true },
    });

    // This is the whole point of the wiring: the rail's countdown has to be
    // this league's deadline, not the season's.
    if (cycle.airsAt) {
      expect(shifted.locksAt!.getTime()).toBe(cycle.airsAt.getTime() - 1440 * 60_000);
      expect(shifted.locksAt!.getTime()).not.toBe(seasonDefault.locksAt.getTime());
    }
  });

  it('tells members the deadline moved', async () => {
    const host = await makeUser('lock-notify');
    const other = await makeUser('lock-notify-2');
    const league = await makeLeague(host);
    await joinLeague(other, await inviteCodeFor(league.id), 'Other Squad');
    await markAllNotificationsRead(other);

    await updateLeague(league.id, host, {
      name: league.name,
      scoringRulesetId: rulesetId,
      rosterSize: 2,
      maxTeams: 4,
      isPublic: false,
      lockOffsetMinutes: 120,
      chatWebhookUrl: null,
    });

    const notifications = await getNotifications(other);
    const notice = notifications.find((n) => n.type === 'LEAGUE_UPDATED');
    expect(notice).toBeDefined();
    expect(notice!.body).toContain('2 hours before airtime');
  });

  it('rejects an offset that would lock after the episode airs', async () => {
    const host = await makeUser('lock-neg');
    const league = await makeLeague(host);

    await expect(
      updateLeague(league.id, host, {
        name: league.name,
        scoringRulesetId: rulesetId,
        rosterSize: 2,
        maxTeams: 4,
        isPublic: false,
        lockOffsetMinutes: -30,
        chatWebhookUrl: null,
      }),
    ).rejects.toThrow();
  });
});

describe.skipIf(!dbReady)('deleting a league', () => {
  it('refuses without the exact name typed back', async () => {
    const host = await makeUser('del-typo');
    const league = await makeLeague(host);

    await expect(deleteLeague(league.id, host, 'not the name')).rejects.toMatchObject({
      code: 'CONFIRM_NAME_MISMATCH',
    });
    expect(await prisma.league.count({ where: { id: league.id } })).toBe(1);
  });

  it('refuses anyone who is not the commissioner', async () => {
    const host = await makeUser('del-host');
    const other = await makeUser('del-other');
    const league = await makeLeague(host);
    await joinLeague(other, await inviteCodeFor(league.id), 'Other Squad');

    await expect(deleteLeague(league.id, other, league.name)).rejects.toThrow();
    expect(await prisma.league.count({ where: { id: league.id } })).toBe(1);
  });

  it('takes its members, teams and feed with it', async () => {
    const host = await makeUser('cascade-host');
    const other = await makeUser('cascade-other');
    const league = await makeLeague(host);
    await joinLeague(other, await inviteCodeFor(league.id), 'Other Squad');
    await prisma.leagueMessage.create({
      data: { leagueId: league.id, authorId: host, body: 'last words' },
    });

    await deleteLeague(league.id, host, league.name);

    const [leagues, members, teams, messages] = await Promise.all([
      prisma.league.count({ where: { id: league.id } }),
      prisma.leagueMember.count({ where: { leagueId: league.id } }),
      prisma.team.count({ where: { leagueId: league.id } }),
      prisma.leagueMessage.count({ where: { leagueId: league.id } }),
    ]);
    expect({ leagues, members, teams, messages }).toEqual({
      leagues: 0,
      members: 0,
      teams: 0,
      messages: 0,
    });
  });

  it("keeps every manager's points as a career record, and skips teams that never scored", async (ctx) => {
    // A cycle that has actually been played: the history reduction stops at
    // the last non-UPCOMING week, so scores on a future week would not count
    // — for a live team or for the record, which is the parity being tested.
    const cycle = await prisma.cycle.findFirst({
      where: { seasonId, status: { not: 'UPCOMING' } },
      orderBy: { sequence: 'asc' },
      select: { id: true, sequence: true },
    });
    if (!cycle) return ctx.skip();

    const host = await makeUser('keep-host');
    const other = await makeUser('keep-other');
    const idle = await makeUser('keep-idle');
    const league = await makeLeague(host);
    const code = await inviteCodeFor(league.id);
    await joinLeague(other, code, 'Other Squad');
    await joinLeague(idle, code, 'Idle Squad');

    const teams = await prisma.team.findMany({
      where: { leagueId: league.id },
      select: { id: true, ownerId: true },
    });
    const teamOf = (userId: string) => teams.find((t) => t.ownerId === userId)!.id;
    await prisma.teamCycleScore.createMany({
      data: [
        { teamId: teamOf(host), cycleId: cycle.id, cyclePoints: 12.5, cumulativePoints: 12.5, rank: 1 },
        { teamId: teamOf(other), cycleId: cycle.id, cyclePoints: 4, cumulativePoints: 4, rank: 2 },
        // The idle manager's team has no score rows at all.
      ],
    });

    const before = await getAccountOverview(host);
    expect(before.totalPoints).toBe(12.5);

    await deleteLeague(league.id, host, league.name);

    const records = await prisma.careerRecord.findMany({
      where: { leagueId: league.id },
      orderBy: { totalPoints: 'desc' },
    });
    expect(records.map((r) => [r.userId, Number(r.totalPoints), r.finalRank, r.teamCount])).toEqual([
      [host, 12.5, 1, 3],
      [other, 4, 2, 3],
    ]);
    expect(records[0]).toMatchObject({ leagueName: league.name, teamName: 'Owner Squad' });

    // The account page reads the same total it did while the league existed,
    // now from the record, marked as a closed league with nothing to link to.
    const after = await getAccountOverview(host);
    expect(after.totalPoints).toBe(12.5);
    expect(after.leaguesPlayed).toBe(before.leaguesPlayed);
    const line = after.rows.find((row) => row.leagueName === league.name);
    expect(line).toMatchObject({ archived: true, teamId: null, leagueId: null, rank: 1, totalPoints: 12.5 });
    expect(line!.history.map((p) => p.sequence)).toEqual([cycle.sequence]);

    // Nothing played, nothing kept.
    expect((await getAccountOverview(idle)).rows).toHaveLength(0);
  });

  it('tells the members before the league stops existing', async () => {
    const host = await makeUser('tell-host');
    const other = await makeUser('tell-other');
    const league = await makeLeague(host);
    await joinLeague(other, await inviteCodeFor(league.id), 'Other Squad');

    await deleteLeague(league.id, host, league.name);

    const notifications = await getNotifications(other);
    const notice = notifications.find((n) => n.type === 'LEAGUE_DELETED');
    // Written at send time, so it still reads correctly with no league left
    // to join back to.
    expect(notice).toBeDefined();
    expect(notice!.title).toContain(league.name);
  });
});
