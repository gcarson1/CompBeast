import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/db';
import { assertLeagueRole } from '../lib/auth';
import { buildDraftOrder, validatePick } from '../lib/draft/snake';
import { recalculateLeague, recalculateLeaguesForCycle } from '../lib/scoring/repository';

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

export const createLeagueSchema = z.object({
  name: z.string().trim().min(3).max(60),
  seasonId: z.string().min(1),
  scoringRulesetId: z.string().min(1),
  rosterSize: z.coerce.number().int().min(1).max(12),
  maxTeams: z.coerce.number().int().min(2).max(24),
  isPublic: z.coerce.boolean().default(false),
  teamName: z.string().trim().min(2).max(40),
});

export async function createLeague(userId: string, input: z.infer<typeof createLeagueSchema>) {
  const data = createLeagueSchema.parse(input);

  const ruleset = await prisma.scoringRuleset.findUnique({
    where: { id: data.scoringRulesetId },
    select: { showId: true },
  });
  const season = await prisma.season.findUnique({
    where: { id: data.seasonId },
    select: { showId: true },
  });
  if (!ruleset || !season || ruleset.showId !== season.showId) {
    throw new DomainError('That ruleset does not belong to the selected show.', 'RULESET_MISMATCH');
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

export async function joinLeague(userId: string, inviteCode: string, teamName: string) {
  const league = await prisma.league.findUnique({
    where: { inviteCode: inviteCode.trim().toUpperCase() },
    select: {
      id: true,
      maxTeams: true,
      requiresApproval: true,
      draftStatus: true,
      _count: { select: { teams: true } },
    },
  });
  if (!league) throw new DomainError('No league found for that invite code.', 'LEAGUE_NOT_FOUND', 404);
  if (league.draftStatus !== 'NOT_STARTED') {
    throw new DomainError('This league has already started drafting.', 'DRAFT_STARTED', 409);
  }
  if (league._count.teams >= league.maxTeams) {
    throw new DomainError('This league is full.', 'LEAGUE_FULL', 409);
  }

  const existing = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId: league.id, userId } },
  });
  if (existing) throw new DomainError('You are already in this league.', 'ALREADY_MEMBER', 409);

  return prisma.$transaction(async (tx) => {
    await tx.leagueMember.create({
      data: {
        leagueId: league.id,
        userId,
        role: 'MEMBER',
        status: league.requiresApproval ? 'PENDING' : 'ACTIVE',
      },
    });
    if (!league.requiresApproval) {
      await tx.team.create({
        data: {
          leagueId: league.id,
          ownerId: userId,
          name: teamName,
          draftOrderPosition: league._count.teams + 1,
        },
      });
    }
    return league.id;
  });
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

  const created = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const event of data.events) {
      const definition = byCode.get(event.eventCode)!;
      const row = await tx.scoredEvent.create({
        data: {
          contestantId: event.contestantId,
          eventDefinitionId: definition.id,
          cycleId: cycle.id,
          pointsAwarded: definition.points,
          note: event.note,
          metadata: event.metadata as Prisma.InputJsonValue | undefined,
          occurredAt: event.occurredAt ?? cycle.airsAt ?? new Date(),
          recordedById: userId,
        },
        select: { id: true, pointsAwarded: true },
      });
      await tx.scoreAudit.create({
        data: {
          scoredEventId: row.id,
          action: 'CREATED',
          newPoints: row.pointsAwarded,
          performedById: userId,
        },
      });
      rows.push(row);
    }
    return rows;
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
