import { Prisma } from '@prisma/client';
import { prisma } from '../lib/db';
import { DomainError } from './errors';
import { notify } from './notifications';

/**
 * The friend graph.
 *
 * `Friendship` rows are directed (there is a requester and an addressee) but an
 * accepted friendship is symmetric, so every read has to match on either
 * column. That OR is written once, here, and everything else builds on it —
 * scattering it is how half a feature ends up only seeing the friends you
 * happened to ask first.
 */

const USER_CARD = {
  id: true,
  name: true,
  handle: true,
  avatarUrl: true,
} as const;

export interface FriendCard {
  userId: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
}

export interface PendingRequest extends FriendCard {
  friendshipId: string;
  createdAt: Date;
}

export interface FriendOverview {
  friends: FriendCard[];
  /** Waiting on you to answer. */
  incoming: PendingRequest[];
  /** Waiting on them. */
  outgoing: PendingRequest[];
}

function toCard(user: {
  id: string;
  name: string | null;
  handle: string | null;
  avatarUrl: string | null;
}): FriendCard {
  return {
    userId: user.id,
    name: user.name ?? user.handle ?? 'Unknown player',
    handle: user.handle,
    avatarUrl: user.avatarUrl,
  };
}

/** Every accepted friend's user id, in one round trip. */
export async function friendIdsFor(userId: string): Promise<string[]> {
  const rows = await prisma.friendship.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: { requesterId: true, addresseeId: true },
  });
  return rows.map((row) => (row.requesterId === userId ? row.addresseeId : row.requesterId));
}

/**
 * Friends plus both directions of pending requests, in one query rather than
 * three — the account page renders all three lists together and they all come
 * off the same two indexed columns.
 */
export async function getFriendOverview(userId: string): Promise<FriendOverview> {
  const rows = await prisma.friendship.findMany({
    where: {
      status: { in: ['ACCEPTED', 'PENDING'] },
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      createdAt: true,
      requesterId: true,
      requester: { select: USER_CARD },
      addressee: { select: USER_CARD },
    },
  });

  const friends: FriendCard[] = [];
  const incoming: PendingRequest[] = [];
  const outgoing: PendingRequest[] = [];

  for (const row of rows) {
    const iAsked = row.requesterId === userId;
    const other = iAsked ? row.addressee : row.requester;
    if (row.status === 'ACCEPTED') {
      friends.push(toCard(other));
    } else if (iAsked) {
      outgoing.push({ ...toCard(other), friendshipId: row.id, createdAt: row.createdAt });
    } else {
      incoming.push({ ...toCard(other), friendshipId: row.id, createdAt: row.createdAt });
    }
  }

  friends.sort((a, b) => a.name.localeCompare(b.name));
  return { friends, incoming, outgoing };
}

export type FriendSearchResult = FriendCard & {
  /** What the button on this row should offer. */
  relation: 'NONE' | 'FRIENDS' | 'REQUEST_SENT' | 'REQUEST_RECEIVED';
};

/**
 * Finds people to add.
 *
 * Handle and name match on a prefix/substring, but **email only ever matches
 * exactly**. A substring search over emails turns this box into an address-book
 * scraper — type "@gmail" and page through everyone. Requiring the whole
 * address means you can only find someone by email if you already had it.
 */
export async function searchPeople(
  userId: string,
  rawQuery: string,
  limit = 10,
): Promise<FriendSearchResult[]> {
  const query = rawQuery.trim();
  if (query.length < 2) return [];

  const users = await prisma.user.findMany({
    where: {
      id: { not: userId },
      OR: [
        { handle: { contains: query, mode: 'insensitive' } },
        { name: { contains: query, mode: 'insensitive' } },
        { email: query.toLowerCase() },
      ],
    },
    take: limit,
    orderBy: { createdAt: 'asc' },
    select: USER_CARD,
  });
  if (users.length === 0) return [];

  const ids = users.map((user) => user.id);
  const existing = await prisma.friendship.findMany({
    where: {
      OR: [
        { requesterId: userId, addresseeId: { in: ids } },
        { addresseeId: userId, requesterId: { in: ids } },
      ],
    },
    select: { requesterId: true, addresseeId: true, status: true },
  });

  const relationByUser = new Map<string, FriendSearchResult['relation']>();
  for (const row of existing) {
    const otherId = row.requesterId === userId ? row.addresseeId : row.requesterId;
    if (row.status === 'ACCEPTED') {
      relationByUser.set(otherId, 'FRIENDS');
    } else if (row.status === 'PENDING') {
      relationByUser.set(otherId, row.requesterId === userId ? 'REQUEST_SENT' : 'REQUEST_RECEIVED');
    }
    // DECLINED intentionally leaves the row as NONE — it should look like a
    // fresh person so asking again is possible, and so a decline is not
    // broadcast back to whoever was declined.
  }

  return users.map((user) => ({
    ...toCard(user),
    relation: relationByUser.get(user.id) ?? 'NONE',
  }));
}

/**
 * Sends a friend request.
 *
 * The interesting case is the mirror: if they already asked you, this accepts
 * their request instead of creating a second row pointing the other way. Two
 * people who each asked are two people who both agreed, and modelling that as
 * two competing PENDING rows leaves a phantom request that can never be
 * resolved.
 */
export async function sendFriendRequest(userId: string, targetUserId: string) {
  if (userId === targetUserId) {
    throw new DomainError('You are already your own biggest fan.', 'SELF_FRIEND');
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, handle: true },
  });
  if (!target) throw new DomainError('That account no longer exists.', 'USER_NOT_FOUND', 404);

  const me = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, handle: true },
  });
  const myName = me.name ?? me.handle ?? 'Someone';

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: userId, addresseeId: targetUserId },
        { requesterId: targetUserId, addresseeId: userId },
      ],
    },
    select: { id: true, status: true, requesterId: true },
  });

  if (existing?.status === 'ACCEPTED') {
    throw new DomainError('You are already friends.', 'ALREADY_FRIENDS', 409);
  }

  if (existing?.status === 'PENDING') {
    if (existing.requesterId === userId) {
      throw new DomainError('You already asked — waiting on them.', 'REQUEST_PENDING', 409);
    }
    // They asked first: accept rather than mirror.
    await prisma.friendship.update({
      where: { id: existing.id },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    });
    await notify({
      userId: targetUserId,
      actorId: userId,
      type: 'FRIEND_ACCEPTED',
      title: `${myName} accepted your friend request`,
      href: '/account',
    });
    return { status: 'ACCEPTED' as const };
  }

  // No row, or a DECLINED one to re-open.
  try {
    if (existing) {
      await prisma.friendship.update({
        where: { id: existing.id },
        data: {
          // A re-request has to travel in the direction it was actually sent,
          // or re-asking someone who declined you would show up on your own
          // incoming list instead of theirs.
          requesterId: userId,
          addresseeId: targetUserId,
          status: 'PENDING',
          respondedAt: null,
          createdAt: new Date(),
        },
      });
    } else {
      await prisma.friendship.create({
        data: { requesterId: userId, addresseeId: targetUserId, status: 'PENDING' },
      });
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DomainError('You already asked — waiting on them.', 'REQUEST_PENDING', 409);
    }
    throw error;
  }

  await notify({
    userId: targetUserId,
    actorId: userId,
    type: 'FRIEND_REQUEST',
    title: `${myName} wants to be friends`,
    body: 'Accept to invite each other to leagues.',
    href: '/account',
  });

  return { status: 'PENDING' as const };
}

/**
 * Accepts or declines a request addressed to you.
 *
 * On accept it also clears any mirror row. Two people can send simultaneously
 * and both inserts succeed — the unique constraint only stops the *same*
 * direction twice — which would otherwise leave the other person staring at a
 * pending request from someone who is already their friend.
 */
export async function respondToFriendRequest(userId: string, friendshipId: string, accept: boolean) {
  const request = await prisma.friendship.findUnique({
    where: { id: friendshipId },
    select: { id: true, status: true, addresseeId: true, requesterId: true },
  });
  if (!request || request.addresseeId !== userId) {
    throw new DomainError('That request is no longer waiting for you.', 'REQUEST_NOT_FOUND', 404);
  }
  if (request.status !== 'PENDING') {
    throw new DomainError('That request was already answered.', 'REQUEST_ANSWERED', 409);
  }

  await prisma.friendship.update({
    where: { id: friendshipId },
    data: { status: accept ? 'ACCEPTED' : 'DECLINED', respondedAt: new Date() },
  });

  if (!accept) return { accepted: false };

  await prisma.friendship.deleteMany({
    where: { requesterId: userId, addresseeId: request.requesterId, status: 'PENDING' },
  });

  const me = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, handle: true },
  });
  await notify({
    userId: request.requesterId,
    actorId: userId,
    type: 'FRIEND_ACCEPTED',
    title: `${me.name ?? me.handle ?? 'Someone'} accepted your friend request`,
    href: '/account',
  });

  return { accepted: true };
}

/**
 * Unfriends, or withdraws a request you sent.
 *
 * Deletes rather than marking DECLINED: an unfriend is not a rejection, and
 * leaving a tombstone would stop either side asking again.
 */
export async function removeFriend(userId: string, otherUserId: string) {
  const result = await prisma.friendship.deleteMany({
    where: {
      OR: [
        { requesterId: userId, addresseeId: otherUserId },
        { requesterId: otherUserId, addresseeId: userId },
      ],
    },
  });
  if (result.count === 0) {
    throw new DomainError('You are not connected to that person.', 'NOT_FRIENDS', 404);
  }
  return { removed: result.count };
}

// ---------------------------------------------------------------------------
// Friends -> leagues
// ---------------------------------------------------------------------------

export interface InvitableFriend extends FriendCard {
  /** True once they are already a member, so the row can say so rather than vanish. */
  alreadyIn: boolean;
}

/**
 * Your friends, annotated with whether they are already in this league.
 *
 * Members are kept in the list rather than filtered out. "Where did Dana go?"
 * is a worse question than a greyed-out row that says "Already in".
 */
export async function getInvitableFriends(userId: string, leagueId: string): Promise<InvitableFriend[]> {
  const ids = await friendIdsFor(userId);
  if (ids.length === 0) return [];

  const [users, members] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: USER_CARD }),
    prisma.leagueMember.findMany({
      where: { leagueId, userId: { in: ids }, status: { not: 'REMOVED' } },
      select: { userId: true },
    }),
  ]);

  const memberIds = new Set(members.map((member) => member.userId));
  return users
    .map((user) => ({ ...toCard(user), alreadyIn: memberIds.has(user.id) }))
    .sort((a, b) => Number(a.alreadyIn) - Number(b.alreadyIn) || a.name.localeCompare(b.name));
}

/**
 * Invites a friend into a league by notification.
 *
 * The invite carries the league's own code and deep-links to the prefilled
 * join form, so accepting is one tap rather than a copy-paste. Any active
 * member can invite — they already hold the code and could paste it into a
 * message anyway, so gating this to the commissioner would only make the
 * supported path worse than the unsupported one.
 */
export async function inviteFriendToLeague(userId: string, friendId: string, leagueId: string) {
  const membership = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
    select: { status: true },
  });
  if (!membership || membership.status !== 'ACTIVE') {
    throw new DomainError('You can only invite people to your own leagues.', 'NOT_A_MEMBER', 403);
  }

  const friendIds = await friendIdsFor(userId);
  if (!friendIds.includes(friendId)) {
    throw new DomainError('You can only invite friends.', 'NOT_FRIENDS', 403);
  }

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      name: true,
      inviteCode: true,
      maxTeams: true,
      draftStatus: true,
      season: { select: { name: true, status: true } },
      _count: { select: { teams: true } },
    },
  });
  if (!league) throw new DomainError('That league no longer exists.', 'LEAGUE_NOT_FOUND', 404);

  // Checked before sending rather than only at join time: an invite that
  // cannot be accepted is worse than no invite.
  if (league.draftStatus !== 'NOT_STARTED') {
    throw new DomainError('This league has already started drafting.', 'DRAFT_STARTED', 409);
  }
  if (league._count.teams >= league.maxTeams) {
    throw new DomainError('This league is full.', 'LEAGUE_FULL', 409);
  }

  const alreadyIn = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId: friendId } },
    select: { status: true },
  });
  if (alreadyIn && alreadyIn.status !== 'REMOVED') {
    throw new DomainError('They are already in this league.', 'ALREADY_MEMBER', 409);
  }

  const me = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, handle: true },
  });

  await notify({
    userId: friendId,
    actorId: userId,
    type: 'LEAGUE_INVITE',
    title: `${me.name ?? me.handle ?? 'Someone'} invited you to ${league.name}`,
    body: `${league.season.name} · ${league._count.teams} of ${league.maxTeams} seats taken`,
    href: `/leagues/join?code=${encodeURIComponent(league.inviteCode)}`,
    data: { leagueId, inviteCode: league.inviteCode },
  });

  return { invited: true };
}
