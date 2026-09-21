import { prisma } from '../lib/db';
import { DomainError } from './mutations';
import { notify } from './notifications';

/**
 * What the privacy policy says deleting an account does, in code. The two
 * must agree: if this changes, /privacy#deletion changes with it.
 *
 * The row is not deleted, it is emptied. Audit rows, draft picks and team
 * standings in leagues other people are still playing all point at this
 * user, and taking the row out from under them would either fail on the
 * foreign keys or wreck those leagues. So every personal field is erased and
 * the identifiers are replaced with values that can never match a real
 * person or a real sign-in again. What is left is a tombstone: a primary key
 * for other rows to hang off, and nothing about anyone.
 *
 * Erasure of the sign-in itself is the caller's job (see `deleteAccount` in
 * account-actions.ts), because it is a call to another company's API and
 * has to happen after this has committed, never before: a deleted sign-in
 * with the profile still here would be the worst of both.
 */
export interface DeletionSummary {
  leaguesHandedOver: number;
  leaguesDeleted: number;
  teamsRemoved: number;
  teamsDetached: number;
  messagesRemoved: number;
}

export function tombstoneEmail(userId: string): string {
  return `deleted-${userId}@deleted.invalid`;
}

export async function eraseUserData(userId: string): Promise<DeletionSummary> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      leaguesOwned: {
        select: {
          id: true,
          name: true,
          draftStatus: true,
          // The next commissioner: an admin if there is one, else whoever has
          // been in the league longest. Never the person leaving.
          members: {
            where: { status: 'ACTIVE', userId: { not: userId } },
            orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
            take: 1,
            select: { userId: true, role: true },
          },
        },
      },
      teams: { select: { id: true, league: { select: { id: true, draftStatus: true } } } },
    },
  });
  if (!user) throw new DomainError('That account no longer exists.', 'USER_NOT_FOUND', 404);

  const handovers: Array<{ leagueId: string; name: string; heirId: string }> = [];

  const summary = await prisma.$transaction(async (tx) => {
    let leaguesDeleted = 0;

    for (const league of user.leaguesOwned) {
      const heir = league.members[0];
      if (!heir) {
        // Nobody else was ever in it, so there is nothing to keep: no career
        // record to write (see deleteLeague) because the only manager is the
        // one whose records are being erased.
        await tx.league.delete({ where: { id: league.id } });
        leaguesDeleted += 1;
        continue;
      }
      await tx.league.update({ where: { id: league.id }, data: { commissionerId: heir.userId } });
      await tx.leagueMember.update({
        where: { leagueId_userId: { leagueId: league.id, userId: heir.userId } },
        data: { role: 'COMMISSIONER' },
      });
      handovers.push({ leagueId: league.id, name: league.name, heirId: heir.userId });
    }

    // Teams: before a draft there is nothing on the board, so the seat is
    // freed. Once drafted, the picks and every other team's standings depend
    // on this team existing; it stays, attributed to the tombstone.
    const deletedLeagueIds = new Set(
      user.leaguesOwned.filter((l) => l.members.length === 0).map((l) => l.id),
    );
    const remainingTeams = user.teams.filter((t) => !deletedLeagueIds.has(t.league.id));
    const removable = remainingTeams.filter((t) => t.league.draftStatus === 'NOT_STARTED');
    if (removable.length > 0) {
      await tx.team.deleteMany({ where: { id: { in: removable.map((t) => t.id) } } });
      // `joinLeague` hands the next seat `count + 1`, so a gap in the
      // positions would make the next person to join collide with a seat
      // that still exists. Close the gap. Ascending order is what keeps each
      // move within the unique constraint: every target is a number that has
      // just been vacated.
      for (const leagueId of new Set(removable.map((t) => t.league.id))) {
        const seats = await tx.team.findMany({
          where: { leagueId },
          orderBy: { draftOrderPosition: 'asc' },
          select: { id: true, draftOrderPosition: true },
        });
        for (const [index, seat] of seats.entries()) {
          if (seat.draftOrderPosition !== index + 1) {
            await tx.team.update({ where: { id: seat.id }, data: { draftOrderPosition: index + 1 } });
          }
        }
      }
    }
    const teamsRemoved = removable.length;
    const teamsDetached = remainingTeams.length - removable.length;

    // Membership rows go the same way as leaving a league would: REMOVED,
    // so the league's member count and history stay honest.
    await tx.leagueMember.updateMany({ where: { userId }, data: { status: 'REMOVED' } });

    // Chat: the body is the personal data, so it is blanked, not just hidden.
    const messages = await tx.leagueMessage.updateMany({
      where: { authorId: userId },
      data: { body: '', deletedAt: new Date() },
    });
    await tx.leagueMessageReaction.deleteMany({ where: { userId } });

    // Everything that is only about this person.
    await tx.friendship.deleteMany({ where: { OR: [{ requesterId: userId }, { addresseeId: userId }] } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.notification.updateMany({ where: { actorId: userId }, data: { actorId: null } });
    await tx.pushSubscription.deleteMany({ where: { userId } });
    await tx.careerRecord.deleteMany({ where: { userId } });

    // Provenance on the ledger records *that* someone did it, not who.
    await tx.scoredEvent.updateMany({ where: { recordedById: userId }, data: { recordedById: null } });
    await tx.ingestedEventCandidate.updateMany({
      where: { reviewedById: userId },
      data: { reviewedById: null },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        authId: `deleted:${userId}`,
        email: tombstoneEmail(userId),
        name: null,
        avatarUrl: null,
        handle: null,
        isPlatformAdmin: false,
        emailNotifications: false,
        emailOptOut: [],
        emailToken: null,
      },
    });

    return {
      leaguesHandedOver: handovers.length,
      leaguesDeleted,
      teamsRemoved,
      teamsDetached,
      messagesRemoved: messages.count,
    };
  });

  // After the commit, and best-effort like every other notification: the
  // handover has happened whether or not the heir is told by email.
  await notify(
    handovers.map((h) => ({
      userId: h.heirId,
      type: 'LEAGUE_UPDATED' as const,
      title: `You are now the commissioner of ${h.name}`,
      body: 'The previous commissioner closed their account. The league and its settings are yours.',
      href: `/leagues/${h.leagueId}`,
      data: { leagueId: h.leagueId },
    })),
  );

  return summary;
}
