import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rot13 } from '../lib/content-filter';
import { eraseUserData } from './account';
import {
  blockUser,
  getBlockedPeople,
  getModerationQueue,
  reportContent,
  resolveReport,
  unblockUser,
} from './moderation';
import { createLeague, joinLeague, postLeagueMessage } from './mutations';
import { getLeagueMessages } from './queries';
import { searchPeople, sendFriendRequest } from './social';

/**
 * Integration coverage for blocking, reporting and the moderation queue —
 * the safety tools App Review guideline 1.2 requires of an app with user
 * posts, and the rules the terms promise. Real database, like the other
 * suites, because every rule here is a `where` clause; it skips itself when
 * no seeded database is reachable.
 */
const prisma = new PrismaClient();

let dbReady = false;
let seasonId = '';
let rulesetId = '';
try {
  const season = await prisma.season.findFirst({
    where: { show: { slug: 'big-brother' }, status: { not: 'COMPLETED' } },
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

const stamp = `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const userIds: string[] = [];
const leagueIds: string[] = [];

let alice = '';
let bob = '';
let cara = '';
let outsider = '';
let moderator = '';
let leagueId = '';

async function makeUser(tag: string, isPlatformAdmin = false): Promise<string> {
  const user = await prisma.user.create({
    data: {
      authId: `${stamp}-${tag}`,
      email: `${stamp}-${tag}@example.invalid`,
      name: `${tag} Tester`,
      handle: `${stamp}-${tag}`,
      isPlatformAdmin,
    },
    select: { id: true },
  });
  userIds.push(user.id);
  return user.id;
}

beforeAll(async () => {
  if (!dbReady) return;
  [alice, bob, cara, outsider, moderator] = await Promise.all([
    makeUser('alice'),
    makeUser('bob'),
    makeUser('cara'),
    makeUser('outsider'),
    makeUser('moderator', true),
  ]);
  const league = await createLeague(alice, {
    name: `${stamp} league`,
    seasonId,
    scoringRulesetId: rulesetId,
    rosterSize: 3,
    maxTeams: 6,
    isPublic: false,
    teamName: 'Alice Squad',
  });
  leagueId = league.id;
  leagueIds.push(league.id);
  const { inviteCode } = await prisma.league.findUniqueOrThrow({
    where: { id: league.id },
    select: { inviteCode: true },
  });
  await joinLeague(bob, inviteCode, 'Bob Squad');
  await joinLeague(cara, inviteCode, 'Cara Squad');
});

afterAll(async () => {
  if (userIds.length > 0) {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.contentReport.deleteMany({ where: { subjectUserId: { in: userIds } } });
  }
  if (leagueIds.length > 0) {
    await prisma.leagueMessageReaction.deleteMany({ where: { message: { leagueId: { in: leagueIds } } } });
    await prisma.leagueMessage.deleteMany({ where: { leagueId: { in: leagueIds } } });
    await prisma.team.deleteMany({ where: { leagueId: { in: leagueIds } } });
    await prisma.leagueMember.deleteMany({ where: { leagueId: { in: leagueIds } } });
    await prisma.league.deleteMany({ where: { id: { in: leagueIds } } });
  }
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

const bodies = async (viewerId: string) => (await getLeagueMessages(leagueId, viewerId)).map((m) => m.body);

describe.skipIf(!dbReady)('blocking', () => {
  it('hides each person’s posts from the other at once, and unblocking brings them back', async () => {
    await postLeagueMessage(leagueId, bob, 'bob was here');
    await postLeagueMessage(leagueId, cara, 'cara was here');

    await blockUser(alice, bob);

    expect(await bodies(alice)).not.toContain('bob was here');
    expect(await bodies(alice)).toContain('cara was here');
    // Both ways: the blocked person no longer sees the blocker either.
    await postLeagueMessage(leagueId, alice, 'alice was here');
    expect(await bodies(bob)).not.toContain('alice was here');
    // Nobody else is affected.
    expect(await bodies(cara)).toEqual(expect.arrayContaining(['bob was here', 'alice was here']));

    expect((await getBlockedPeople(alice)).map((p) => p.userId)).toEqual([bob]);
    expect(await getBlockedPeople(bob)).toEqual([]);

    await unblockUser(alice, bob);
    expect(await bodies(alice)).toContain('bob was here');
  });

  it('ends a friendship, refuses new requests both ways, and hides each from the other’s search', async () => {
    await sendFriendRequest(cara, outsider);
    await sendFriendRequest(outsider, cara); // the mirror accepts it
    expect(await prisma.friendship.count({ where: { status: 'ACCEPTED', requesterId: cara } })).toBe(1);

    await blockUser(outsider, cara);

    expect(
      await prisma.friendship.count({
        where: {
          OR: [
            { requesterId: cara, addresseeId: outsider },
            { requesterId: outsider, addresseeId: cara },
          ],
        },
      }),
    ).toBe(0);
    await expect(sendFriendRequest(cara, outsider)).rejects.toThrow('You cannot add this person.');
    await expect(sendFriendRequest(outsider, cara)).rejects.toThrow('You cannot add this person.');
    expect((await searchPeople(cara, `${stamp}-outsider`)).map((r) => r.userId)).not.toContain(outsider);
    expect((await searchPeople(outsider, `${stamp}-cara`)).map((r) => r.userId)).not.toContain(cara);

    await unblockUser(outsider, cara);
  });

  it('tells the moderators about every block', async () => {
    const before = await prisma.contentReport.count({ where: { subjectUserId: bob, viaBlock: true } });
    await blockUser(cara, bob);
    expect(await prisma.contentReport.count({ where: { subjectUserId: bob, viaBlock: true } })).toBe(
      before + 1,
    );
    await unblockUser(cara, bob);
  });

  it('refuses to block yourself', async () => {
    await expect(blockUser(alice, alice)).rejects.toThrow('You cannot block yourself.');
  });
});

describe.skipIf(!dbReady)('reporting and the moderation queue', () => {
  it('files a report with the post as it read, alerts every moderator, and ignores a double tap', async () => {
    const { id: messageId } = await postLeagueMessage(leagueId, bob, 'something nasty');

    await reportContent(cara, { messageId, reason: 'HARASSMENT', details: 'not ok' });
    await reportContent(cara, { messageId, reason: 'HARASSMENT' });

    const reports = await prisma.contentReport.findMany({ where: { messageId } });
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      reporterId: cara,
      subjectUserId: bob,
      leagueId,
      snapshot: 'something nasty',
      reason: 'HARASSMENT',
      status: 'OPEN',
    });
    expect(
      await prisma.notification.count({
        where: { userId: moderator, type: 'CONTENT_REPORTED', href: '/admin/reports' },
      }),
    ).toBeGreaterThan(0);

    const queued = (await getModerationQueue()).find((r) => r.messageId === messageId);
    expect(queued?.currentBody).toBe('something nasty');
    expect(queued?.subject.id).toBe(bob);
  });

  it('only lets someone report a post they can see', async () => {
    const { id: messageId } = await postLeagueMessage(leagueId, bob, 'members only');
    await expect(reportContent(outsider, { messageId, reason: 'SPAM' })).rejects.toThrow(
      'That post is gone.',
    );
    await expect(reportContent(bob, { subjectUserId: bob, reason: 'SPAM' })).rejects.toThrow(
      'You cannot report yourself.',
    );
  });

  it('removing a post settles every open report of it', async () => {
    const { id: messageId } = await postLeagueMessage(leagueId, bob, 'remove me');
    await reportContent(alice, { messageId, reason: 'HATE' });
    await reportContent(cara, { messageId, reason: 'HARASSMENT' });
    const report = await prisma.contentReport.findFirstOrThrow({ where: { messageId, reporterId: alice } });

    await resolveReport(moderator, report.id, 'REMOVE_POST');

    expect(
      (await prisma.leagueMessage.findUniqueOrThrow({ where: { id: messageId } })).deletedAt,
    ).not.toBeNull();
    expect(await prisma.contentReport.count({ where: { messageId, status: 'OPEN' } })).toBe(0);
    await expect(resolveReport(moderator, report.id, 'DISMISS')).rejects.toThrow('already settled');
  });

  it('suspending removes the post, ejects the author, and closes every open report about them', async () => {
    const { id: messageId } = await postLeagueMessage(leagueId, cara, 'over the line');
    await reportContent(alice, { messageId, reason: 'HARASSMENT' });
    await reportContent(bob, { subjectUserId: cara, reason: 'IMPERSONATION' });
    const report = await prisma.contentReport.findFirstOrThrow({ where: { messageId } });

    await resolveReport(moderator, report.id, 'SUSPEND');

    const author = await prisma.user.findUniqueOrThrow({ where: { id: cara } });
    expect(author.suspendedAt).not.toBeNull();
    expect(author.suspensionReason).toBe('Harassment or bullying');
    expect(await prisma.contentReport.count({ where: { subjectUserId: cara, status: 'OPEN' } })).toBe(0);
    expect(await bodies(alice)).not.toContain('over the line');
  });
});

describe.skipIf(!dbReady)('the slur filter on posts and names', () => {
  it('refuses a post or a team name that uses a slur', async () => {
    await expect(postLeagueMessage(leagueId, alice, `you ${rot13('snttbg')}`)).rejects.toThrow();
    const { inviteCode } = await prisma.league.findUniqueOrThrow({
      where: { id: leagueId },
      select: { inviteCode: true },
    });
    await expect(joinLeague(outsider, inviteCode, `${rot13('ergneq')}s united`)).rejects.toThrow(
      'language Comp Beast does not allow',
    );
  });
});

describe.skipIf(!dbReady)('deleting an account', () => {
  it('erases push tokens, blocks and the reporter’s name on reports, and blanks quoted posts', async () => {
    const leaver = await makeUser('leaver');
    await prisma.nativePushToken.create({
      data: { userId: leaver, token: `${'ab'.repeat(32)}${stamp.length}` },
    });
    await blockUser(leaver, alice);
    await reportContent(leaver, { subjectUserId: bob, reason: 'SPAM' });
    const { inviteCode } = await prisma.league.findUniqueOrThrow({
      where: { id: leagueId },
      select: { inviteCode: true },
    });
    await joinLeague(leaver, inviteCode, 'Leaver Squad');
    const { id: messageId } = await postLeagueMessage(leagueId, leaver, 'quote me');
    await reportContent(alice, { messageId, reason: 'SPAM' });

    await eraseUserData(leaver);

    expect(await prisma.nativePushToken.count({ where: { userId: leaver } })).toBe(0);
    expect(
      await prisma.userBlock.count({ where: { OR: [{ blockerId: leaver }, { blockedId: leaver }] } }),
    ).toBe(0);
    expect(await prisma.contentReport.count({ where: { reporterId: leaver } })).toBe(0);
    const aboutLeaver = await prisma.contentReport.findFirstOrThrow({ where: { messageId } });
    expect(aboutLeaver.snapshot).toBeNull();
    expect(aboutLeaver.status).toBe('DISMISSED');
  });
});
