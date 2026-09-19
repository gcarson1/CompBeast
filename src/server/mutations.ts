import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/db';
import { assertLeagueRole } from '../lib/auth';
import { buildDraftOrder, validatePick } from '../lib/draft/snake';
import { recalculateLeague, recalculateLeaguesForCycle } from '../lib/scoring/repository';
import { createLeagueSchema } from '../lib/validation';

export { createLeagueSchema };

export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

// ---------------------------------------------------------------------------
// League lifecycle
// ---------------------------------------------------------------------------

export async function createLeague(userId: string, input: z.infer<typeof createLeagueSchema>) {
  const data = createLeagueSchema.parse(input);

  const ruleset = await prisma.scoringRuleset.findUnique({
    where: { id: data.scoringRulesetId },
    select: { showId: true },
  });
  const season = await prisma.season.findUnique({
    where: { id: data.seasonId },
    select: { showId: true, status: true, name: true },
  });
  if (!ruleset || !season || ruleset.showId !== season.showId) {
    throw new DomainError('That ruleset does not belong to the selected show.', 'RULESET_MISMATCH');
  }
  if (season.status === 'COMPLETED') {
    throw new DomainError(
      `${season.name} has already finished. You can browse its results, but not start a league on it.`,
      'SEASON_COMPLETED',
    );
  }

  return prisma.$transaction(async (tx) => {
    const league = await tx.league.create({
      data: {
        name: data.name,
        seasonId: data.seasonId,
        scoringRulesetId: data.scoringRulesetId,
        rosterSize: data.rosterSize,
        maxTeams: data.maxTeams,
        isPublic: data.isPublic,
        commissionerId: userId,
        inviteCode: generateInviteCode(),
      },
    });
    await tx.leagueMember.create({
      data: { leagueId: league.id, userId, role: 'COMMISSIONER', status: 'ACTIVE' },
    });
    await tx.team.create({
      data: { leagueId: league.id, ownerId: userId, name: data.teamName, draftOrderPosition: 1 },
    });
    return league;
  });
}

/**
 * Joins a league by invite code, giving the joiner an ACTIVE membership and a
 * team in one step.
 *
 * There used to be an approval gate here, and it was broken in a way that
 * silently swallowed people: `League.requiresApproval` defaults to true and
 * `createLeague` never set it, so every league built through the UI required
 * approval; joining created a PENDING member and *no team*; and no approval
 * mutation existed anywhere, so PENDING was a terminal state. The joiner got
 * no team, was invisible on the league page, and `getLeaguesForUser` filters
 * on ACTIVE so the league disappeared from their own list too.
 *
 * The gate is gone rather than completed. The invite code is already the
 * access control — asking a commissioner to re-approve someone who had to be
 * given the secret code is friction that buys nothing, and a half-built gate
 * that eats members is strictly worse than no gate.
 */
export async function joinLeague(userId: string, inviteCode: string, teamName: string) {
  const league = await prisma.league.findUnique({
    where: { inviteCode: inviteCode.trim().toUpperCase() },
    select: {
      id: true,
      maxTeams: true,
      draftStatus: true,
      season: { select: { status: true, name: true } },
      _count: { select: { teams: true } },
    },
  });
  if (!league) throw new DomainError('No league found for that invite code.', 'LEAGUE_NOT_FOUND', 404);
  if (league.season.status === 'COMPLETED') {
    throw new DomainError(
      `${league.season.name} has already finished, so this league is closed.`,
      'SEASON_COMPLETED',
      409,
    );
  }
  if (league.draftStatus !== 'NOT_STARTED') {
    throw new DomainError('This league has already started drafting.', 'DRAFT_STARTED', 409);
  }

  const existing = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId: league.id, userId } },
    select: { id: true, status: true },
  });

  // A PENDING membership can only be wreckage from the old approval gate --
  // nothing could ever move it to ACTIVE. Re-entering the invite code repairs
  // it in place, so anyone already stranded can recover without an admin or a
  // manual database edit.
  if (existing?.status === 'PENDING') {
    return prisma.$transaction(async (tx) => {
      await tx.leagueMember.update({ where: { id: existing.id }, data: { status: 'ACTIVE' } });
      const team = await tx.team.findUnique({
        where: { leagueId_ownerId: { leagueId: league.id, ownerId: userId } },
        select: { id: true },
      });
      if (!team) {
        const seatsTaken = await tx.team.count({ where: { leagueId: league.id } });
        await tx.team.create({
          data: {
            leagueId: league.id,
            ownerId: userId,
            name: teamName,
            draftOrderPosition: seatsTaken + 1,
          },
        });
      }
      return league.id;
    });
  }

  if (existing) throw new DomainError('You are already in this league.', 'ALREADY_MEMBER', 409);

  // The capacity check and the seat number are re-derived *inside* the
  // transaction. Reading `_count.teams` above and trusting it here is a
  // time-of-check/time-of-use race: two people accepting the same invite at
  // once both saw "5 of 6 taken", both passed, and both tried to claim
  // draft position 6. The unique constraint on [leagueId, draftOrderPosition]
  // stopped the database from being corrupted, but it surfaced as an
  // unhandled P2002 — a generic "something went wrong" for what is really a
  // normal, explainable outcome.
  try {
    return await prisma.$transaction(async (tx) => {
      const seatsTaken = await tx.team.count({ where: { leagueId: league.id } });
      if (seatsTaken >= league.maxTeams) {
        throw new DomainError('This league is full.', 'LEAGUE_FULL', 409);
      }

      await tx.leagueMember.create({
        data: { leagueId: league.id, userId, role: 'MEMBER', status: 'ACTIVE' },
      });
      await tx.team.create({
        data: {
          leagueId: league.id,
          ownerId: userId,
          name: teamName,
          draftOrderPosition: seatsTaken + 1,
        },
      });
      return league.id;
    });
  } catch (error) {
    // Two joins that interleave *between* the count and the insert still
    // collide; the constraint is the real arbiter and this turns losing that
    // race into something the person can act on.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DomainError(
        'Someone else just took the last spot. Ask the commissioner to make room.',
        'LEAGUE_FULL',
        409,
      );
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

export async function startDraft(leagueId: string, userId: string) {
  await assertLeagueRole(leagueId, userId, ['COMMISSIONER', 'ADMIN']);
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: { draftStatus: true, _count: { select: { teams: true } } },
  });
  if (league.draftStatus !== 'NOT_STARTED') {
    throw new DomainError('The draft has already started.', 'DRAFT_STARTED', 409);
  }
  if (league._count.teams < 2) {
    throw new DomainError('A draft needs at least two teams.', 'NOT_ENOUGH_TEAMS');
  }
  return prisma.league.update({
    where: { id: leagueId },
    data: { draftStatus: 'IN_PROGRESS', draftStartsAt: new Date() },
  });
}

/**
 * Makes a single draft pick.
 *
 * Validation runs twice on purpose: `validatePick` gives a useful message for
 * the common case, and the DraftPick unique constraints are the real guard —
 * two managers clicking the same houseguest at the same instant is exactly the
 * race a pure in-memory check cannot win.
 */
export async function makeDraftPick(input: {
  leagueId: string;
  teamId: string;
  contestantId: string;
  userId: string;
}) {
  const { leagueId, teamId, contestantId, userId } = input;

  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: { id: true, seasonId: true, rosterSize: true, draftType: true, draftStatus: true },
  });
  if (league.draftStatus !== 'IN_PROGRESS') {
    throw new DomainError('This draft is not currently running.', 'DRAFT_NOT_RUNNING', 409);
  }

  const team = await prisma.team.findUniqueOrThrow({
    where: { id: teamId },
    select: { id: true, ownerId: true, leagueId: true },
  });
  if (team.leagueId !== leagueId) {
    throw new DomainError('That team is not in this league.', 'TEAM_MISMATCH', 403);
  }
  if (team.ownerId !== userId) {
    throw new DomainError('You can only pick for your own team.', 'NOT_TEAM_OWNER', 403);
  }

  const [teams, picks, eligible] = await Promise.all([
    prisma.team.findMany({
      where: { leagueId },
      orderBy: { draftOrderPosition: 'asc' },
      select: { id: true },
    }),
    prisma.draftPick.findMany({
      where: { leagueId },
      orderBy: { pickNumber: 'asc' },
      select: { pickNumber: true, teamId: true, contestantId: true },
    }),
    prisma.contestant.findMany({ where: { seasonId: league.seasonId }, select: { id: true } }),
  ]);

  const order = buildDraftOrder(
    teams.map((t) => t.id),
    league.rosterSize,
    league.draftType === 'LINEAR' ? 'LINEAR' : 'SNAKE',
  );
  const validation = validatePick({
    order,
    picksMade: picks,
    teamId,
    contestantId,
    eligibleContestantIds: new Set(eligible.map((c) => c.id)),
  });
  if (!validation.ok) throw new DomainError(validation.message, validation.reason, 409);

  const cycles = await prisma.cycle.findMany({
    where: { seasonId: league.seasonId },
    select: { id: true },
  });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.draftPick.create({
        data: {
          leagueId,
          teamId,
          contestantId,
          round: validation.slot.round,
          pickNumber: validation.slot.pickNumber,
        },
      });
      await tx.rosterSlot.createMany({
        data: cycles.map((cycle) => ({ teamId, contestantId, cycleId: cycle.id })),
        skipDuplicates: true,
      });

      if (validation.slot.pickNumber === order.length) {
        await tx.league.update({
          where: { id: leagueId },
          data: { draftStatus: 'COMPLETED', draftCompletedAt: new Date() },
        });
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DomainError('Someone just took that pick.', 'PICK_CONFLICT', 409);
    }
    throw error;
  }

  return validation.slot;
}

// ---------------------------------------------------------------------------
// Roster locking
// ---------------------------------------------------------------------------

/**
 * A cycle is locked once its lock timestamp has passed or its status says so.
 * Centralized here so the draft UI, the roster editor, and the API all agree on
 * what "locked" means rather than each re-deriving it.
 */
export async function isCycleLocked(cycleId: string, leagueId?: string): Promise<boolean> {
  const cycle = await prisma.cycle.findUniqueOrThrow({
    where: { id: cycleId },
    select: { locksAt: true, airsAt: true, status: true },
  });
  if (cycle.status !== 'UPCOMING') return true;

  let lockAt = cycle.locksAt;
  if (leagueId) {
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { lockOffsetMinutes: true },
    });
    if (league?.lockOffsetMinutes != null && cycle.airsAt) {
      lockAt = new Date(cycle.airsAt.getTime() - league.lockOffsetMinutes * 60 * 1000);
    }
  }
  return Date.now() >= lockAt.getTime();
}

// ---------------------------------------------------------------------------
// Event recording (admin)
// ---------------------------------------------------------------------------

export const recordEventsSchema = z.object({
  cycleId: z.string().min(1),
  events: z
    .array(
      z.object({
        contestantId: z.string().min(1),
        eventCode: z.string().min(1),
        note: z.string().max(280).optional(),
        metadata: z.record(z.unknown()).optional(),
        occurredAt: z.coerce.date().optional(),
      }),
    )
    .min(1)
    .max(200),
});

/**
 * Batch-inserts ledger rows as an episode airs, then recomputes every league
 * on that season. Points are snapshotted from the EventDefinition at write
 * time so a later rule edit cannot silently rewrite a settled week.
 */
export async function recordEvents(
  userId: string,
  input: z.infer<typeof recordEventsSchema>,
) {
  const data = recordEventsSchema.parse(input);

  const cycle = await prisma.cycle.findUnique({
    where: { id: data.cycleId },
    select: { id: true, seasonId: true, airsAt: true, season: { select: { showId: true } } },
  });
  if (!cycle) throw new DomainError('Unknown cycle.', 'CYCLE_NOT_FOUND', 404);

  const codes = [...new Set(data.events.map((e) => e.eventCode))];
  const definitions = await prisma.eventDefinition.findMany({
    where: { showId: cycle.season.showId, code: { in: codes } },
    select: { id: true, code: true, points: true },
  });
  const byCode = new Map(definitions.map((d) => [d.code, d]));

  const missing = codes.filter((c) => !byCode.has(c));
  if (missing.length > 0) {
    throw new DomainError(`Unknown event codes: ${missing.join(', ')}`, 'UNKNOWN_EVENT_CODE');
  }

  const contestantIds = [...new Set(data.events.map((e) => e.contestantId))];
  const validContestants = await prisma.contestant.findMany({
    where: { id: { in: contestantIds }, seasonId: cycle.seasonId },
    select: { id: true },
  });
  if (validContestants.length !== contestantIds.length) {
    throw new DomainError('One or more contestants are not in this season.', 'CONTESTANT_MISMATCH');
  }

  // Two bulk writes instead of two round trips per event. At the schema's
  // 200-event ceiling this path was issuing 400 sequential statements inside
  // one transaction — slow enough to be a real transaction-timeout risk during
  // a live episode, which is precisely when it runs.
  //
  // `createManyAndReturn` hands back the generated ids, so the audit rows can
  // be built without pre-minting ids by hand and without giving up Prisma's
  // own cuid generation for this table.
  const occurredFallback = cycle.airsAt ?? new Date();
  const rows = data.events.map((event) => {
    const definition = byCode.get(event.eventCode)!;
    return {
      contestantId: event.contestantId,
      eventDefinitionId: definition.id,
      cycleId: cycle.id,
      pointsAwarded: definition.points,
      note: event.note,
      metadata: event.metadata as Prisma.InputJsonValue | undefined,
      occurredAt: event.occurredAt ?? occurredFallback,
      recordedById: userId,
    };
  });

  const created = await prisma.$transaction(async (tx) => {
    const events = await tx.scoredEvent.createManyAndReturn({
      data: rows,
      select: { id: true, pointsAwarded: true },
    });
    await tx.scoreAudit.createMany({
      data: events.map((event) => ({
        scoredEventId: event.id,
        action: 'CREATED' as const,
        newPoints: event.pointsAwarded,
        performedById: userId,
      })),
    });
    return events;
  });

  const leagueIds = await recalculateLeaguesForCycle(cycle.id);
  return { created: created.length, leaguesRecalculated: leagueIds.length };
}

/**
 * Retroactive correction: soft-voids a ledger row and replays the affected
 * leagues. Nothing is deleted, so the audit trail explains every score change.
 */
export async function voidEvent(userId: string, scoredEventId: string, reason: string) {
  const event = await prisma.scoredEvent.findUnique({
    where: { id: scoredEventId },
    select: { id: true, isVoided: true, pointsAwarded: true, cycleId: true },
  });
  if (!event) throw new DomainError('Unknown event.', 'EVENT_NOT_FOUND', 404);
  if (event.isVoided) throw new DomainError('That event is already voided.', 'ALREADY_VOIDED', 409);

  await prisma.$transaction([
    prisma.scoredEvent.update({
      where: { id: scoredEventId },
      data: { isVoided: true, voidedReason: reason },
    }),
    prisma.scoreAudit.create({
      data: {
        scoredEventId,
        action: 'VOIDED',
        previousPoints: event.pointsAwarded,
        newPoints: 0,
        reason,
        performedById: userId,
      },
    }),
  ]);

  const leagueIds = await recalculateLeaguesForCycle(event.cycleId);
  return { leaguesRecalculated: leagueIds.length };
}

export async function refreshLeagueScores(leagueId: string) {
  return recalculateLeague(leagueId);
}

// ---------------------------------------------------------------------------
// League feed
// ---------------------------------------------------------------------------

export const postMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Say something first')
    .max(500, 'Keep it under 500 characters'),
});

/**
 * Posts to a league's feed. Membership is the gate — `assertLeagueRole` covers
 * all three roles, so any active member can talk, but someone who merely knows
 * the league's id cannot.
 */
export async function postLeagueMessage(leagueId: string, userId: string, body: string) {
  await assertLeagueRole(leagueId, userId, ['COMMISSIONER', 'ADMIN', 'MEMBER']);
  const data = postMessageSchema.parse({ body });

  return prisma.leagueMessage.create({
    data: { leagueId, authorId: userId, body: data.body },
    select: { id: true },
  });
}

/**
 * Toggles one reaction. Re-running it removes the reaction, so a double-tap
 * undoes rather than erroring, and the unique constraint keeps that honest if
 * two taps land at once.
 */
export async function toggleMessageReaction(
  messageId: string,
  userId: string,
  kind: 'HYPE' | 'SHADE',
) {
  const message = await prisma.leagueMessage.findUnique({
    where: { id: messageId },
    select: { leagueId: true, deletedAt: true },
  });
  if (!message) throw new DomainError('That message is gone.', 'MESSAGE_NOT_FOUND', 404);
  if (message.deletedAt) throw new DomainError('That message was deleted.', 'MESSAGE_DELETED', 409);

  await assertLeagueRole(message.leagueId, userId, ['COMMISSIONER', 'ADMIN', 'MEMBER']);

  const existing = await prisma.leagueMessageReaction.findUnique({
    where: { messageId_userId_kind: { messageId, userId, kind } },
    select: { id: true },
  });

  if (existing) {
    await prisma.leagueMessageReaction.delete({ where: { id: existing.id } });
    return { reacted: false, leagueId: message.leagueId };
  }

  try {
    await prisma.leagueMessageReaction.create({ data: { messageId, userId, kind } });
  } catch (error) {
    // Lost a race with the same person's second tap — the end state they
    // wanted is already there, so this is a success, not a failure.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
  }
  return { reacted: true, leagueId: message.leagueId };
}

/** Authors can retract their own posts; commissioners can remove anyone's. */
export async function deleteLeagueMessage(messageId: string, userId: string) {
  const message = await prisma.leagueMessage.findUnique({
    where: { id: messageId },
    select: { authorId: true, leagueId: true, league: { select: { commissionerId: true } } },
  });
  if (!message) throw new DomainError('That message is gone.', 'MESSAGE_NOT_FOUND', 404);

  const isAuthor = message.authorId === userId;
  const isCommissioner = message.league.commissionerId === userId;
  if (!isAuthor && !isCommissioner) {
    throw new DomainError('You can only delete your own posts.', 'NOT_MESSAGE_AUTHOR', 403);
  }

  await prisma.leagueMessage.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
  });
  return { leagueId: message.leagueId };
}
