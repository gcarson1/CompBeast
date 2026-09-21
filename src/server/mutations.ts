import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/db';
import { assertLeagueRole } from '../lib/auth';
import { playedHistory } from '../lib/career';
import { describeLockOffset } from '../lib/cycles';
import { DRAFT_TEAM_ORDER, type DraftSlot, buildDraftOrder, validatePick } from '../lib/draft/snake';
import { recalculateLeaguesForCycle } from '../lib/scoring/repository';
import { createLeagueSchema, updateLeagueSchema } from '../lib/validation';
import { DomainError } from './errors';
import { announceDraftPick, announceDraftStarted } from './league-chat';
import { notify } from './notifications';

export { createLeagueSchema, updateLeagueSchema };
// Re-exported so the many existing importers of `DomainError` from this module
// keep working; `./errors` is the definition.
export { DomainError };

// No 0/O or 1/I: the code is read aloud and typed back.
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * The invite code is the league's access control, so it comes from the
 * CSPRNG. 32^8 is ~10^12 codes, which is enough that guessing is not a
 * strategy, and `randomInt` is unbiased where a `Math.random()` scale-and-
 * floor is neither unpredictable nor quite uniform.
 */
function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < 8; i += 1) code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
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
      name: true,
      maxTeams: true,
      draftStatus: true,
      commissionerId: true,
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
    const leagueId = await prisma.$transaction(async (tx) => {
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

    // After the commit, never inside it — see src/server/notifications.ts.
    const joiner = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, handle: true },
    });
    await notify({
      userId: league.commissionerId,
      actorId: userId,
      type: 'LEAGUE_MEMBER_JOINED',
      title: `${joiner?.name ?? joiner?.handle ?? 'Someone'} joined ${league.name}`,
      body: `${teamName} took a seat.`,
      href: `/leagues/${league.id}`,
      data: { leagueId: league.id },
    });

    return leagueId;
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
// League settings
// ---------------------------------------------------------------------------

/**
 * Commissioner edits.
 *
 * Every rule here exists because the alternative corrupts a league in
 * progress rather than merely looking odd:
 *
 * - `maxTeams` cannot drop below the teams already seated. Shrinking past them
 *   does not evict anyone, it just makes the league permanently over capacity
 *   and the "N of M seats" line read backwards.
 * - `rosterSize` is frozen once drafting starts. It sets the total number of
 *   picks, so changing it mid-draft would move the finish line under everyone
 *   — either stranding a draft that can never complete or ending it early.
 * - `scoringRulesetId` is frozen at the same point, and must stay on the same
 *   show. Settled weeks are safe (ScoredEvent snapshots its own points), but
 *   every future week would silently be worth something different from what
 *   people drafted against.
 */
export async function updateLeague(
  leagueId: string,
  userId: string,
  input: z.infer<typeof updateLeagueSchema>,
) {
  await assertLeagueRole(leagueId, userId, ['COMMISSIONER']);
  const data = updateLeagueSchema.parse(input);

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      name: true,
      commissionerId: true,
      rosterSize: true,
      maxTeams: true,
      isPublic: true,
      draftStatus: true,
      scoringRulesetId: true,
      lockOffsetMinutes: true,
      chatWebhookUrl: true,
      season: { select: { showId: true } },
      _count: { select: { teams: true } },
    },
  });
  if (!league) throw new DomainError('That league no longer exists.', 'LEAGUE_NOT_FOUND', 404);
  assertCommissioner(league, userId);

  if (data.maxTeams < league._count.teams) {
    throw new DomainError(
      `This league already has ${league._count.teams} teams, so it cannot cap at ${data.maxTeams}.`,
      'MAX_TEAMS_BELOW_CURRENT',
    );
  }

  const drafting = league.draftStatus !== 'NOT_STARTED';
  if (drafting && data.rosterSize !== league.rosterSize) {
    throw new DomainError(
      'Roster size is locked once the draft starts — it sets how many picks there are.',
      'ROSTER_SIZE_LOCKED',
      409,
    );
  }
  if (drafting && data.scoringRulesetId !== league.scoringRulesetId) {
    throw new DomainError(
      'Scoring is locked once the draft starts. Everyone drafted against these rules.',
      'RULESET_LOCKED',
      409,
    );
  }

  if (data.scoringRulesetId !== league.scoringRulesetId) {
    const ruleset = await prisma.scoringRuleset.findUnique({
      where: { id: data.scoringRulesetId },
      select: { showId: true },
    });
    if (!ruleset || ruleset.showId !== league.season.showId) {
      throw new DomainError('That ruleset belongs to a different show.', 'RULESET_MISMATCH');
    }
  }

  const updated = await prisma.league.update({
    where: { id: leagueId },
    data: {
      name: data.name,
      scoringRulesetId: data.scoringRulesetId,
      rosterSize: data.rosterSize,
      maxTeams: data.maxTeams,
      isPublic: data.isPublic,
      lockOffsetMinutes: data.lockOffsetMinutes,
      chatWebhookUrl: data.chatWebhookUrl,
    },
    select: { id: true, name: true },
  });

  // Only the changes worth interrupting someone for. A commissioner fixing a
  // typo in the league name should not ping eight phones.
  const notable: string[] = [];
  if (data.rosterSize !== league.rosterSize) {
    notable.push(`rosters are now ${data.rosterSize} picks`);
  }
  if (data.scoringRulesetId !== league.scoringRulesetId) notable.push('the scoring rules changed');
  if (data.lockOffsetMinutes !== league.lockOffsetMinutes) {
    // A moved deadline is exactly the kind of change someone needs to hear
    // about — it is the difference between setting a roster in time and not.
    notable.push(
      data.lockOffsetMinutes === null
        ? 'rosters now lock on the season schedule'
        : `rosters now lock ${describeLockOffset(data.lockOffsetMinutes)}`,
    );
  }
  if (data.maxTeams !== league.maxTeams) notable.push(`the league now caps at ${data.maxTeams} teams`);

  if (notable.length > 0) {
    const members = await prisma.leagueMember.findMany({
      where: { leagueId, status: 'ACTIVE' },
      select: { userId: true },
    });
    await notify(
      members.map((member) => ({
        userId: member.userId,
        actorId: userId,
        type: 'LEAGUE_UPDATED' as const,
        title: `${updated.name} settings changed`,
        body: `${notable.join(', ')}.`,
        href: `/leagues/${leagueId}`,
        data: { leagueId },
      })),
    );
  }

  return updated;
}

/**
 * Deletes a league and everything hanging off it.
 *
 * Members, teams, roster slots, draft picks, cycle scores, feed messages and
 * reactions all cascade at the database level, so this is one statement rather
 * than a hand-rolled teardown that could miss a table as the schema grows.
 *
 * Members are notified *before* the delete, on purpose: afterwards there is no
 * membership list left to read, and a league vanishing with no explanation is
 * the single most alarming thing this app can do to someone.
 */
/**
 * Settings and deletion answer to the league's commissioner and nobody else.
 *
 * Two facts claim to say who that is — `League.commissionerId`, which the
 * pages read, and the `COMMISSIONER` membership role, which `assertLeagueRole`
 * reads. They are written together in `createLeague` and nothing today moves
 * one without the other, so this check should never fire; it exists so that
 * if the two ever drift, the mutation refuses rather than letting whichever
 * one happens to be checked decide who may edit or delete a league.
 */
function assertCommissioner(league: { commissionerId: string }, userId: string): void {
  if (league.commissionerId !== userId) {
    throw new DomainError('Only the commissioner can change this league.', 'NOT_COMMISSIONER', 403);
  }
}

export async function deleteLeague(leagueId: string, userId: string, confirmName: string) {
  await assertLeagueRole(leagueId, userId, ['COMMISSIONER']);

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      name: true,
      commissionerId: true,
      season: { select: { id: true, name: true, status: true, show: { select: { name: true } } } },
      members: { where: { status: 'ACTIVE' }, select: { userId: true } },
      teams: {
        select: {
          ownerId: true,
          name: true,
          cycleScores: {
            select: {
              cyclePoints: true,
              cumulativePoints: true,
              rank: true,
              cycle: { select: { label: true, sequence: true, status: true } },
            },
          },
        },
      },
    },
  });
  if (!league) throw new DomainError('That league no longer exists.', 'LEAGUE_NOT_FOUND', 404);
  assertCommissioner(league, userId);

  // Typing the name is the guard. A confirm dialog is dismissed by reflex;
  // this cannot be satisfied by accident.
  if (confirmName.trim() !== league.name) {
    throw new DomainError('Type the league name exactly to confirm deletion.', 'CONFIRM_NAME_MISMATCH');
  }

  await notify(
    league.members.map((member) => ({
      userId: member.userId,
      actorId: userId,
      type: 'LEAGUE_DELETED' as const,
      title: `${league.name} was deleted`,
      body: 'The commissioner closed this league. The points you scored in it stay on your account.',
      href: '/account',
    })),
  );

  // What each manager walks away with. The cascade below takes the teams and
  // every materialized score with them, so this is the last moment the
  // numbers exist — see `CareerRecord` in the schema for why they must
  // outlive the league. A team that never scored (a league closed before its
  // season aired) leaves no record: nothing was played, so there is nothing
  // to keep, and a row of zeros would only pad the career view.
  const records = league.teams.flatMap((team) => {
    const history = playedHistory(team.cycleScores);
    const last = history.at(-1);
    if (!last) return [];
    return [
      {
        userId: team.ownerId,
        leagueId: league.id,
        seasonId: league.season.id,
        leagueName: league.name,
        teamName: team.name,
        seasonName: league.season.name,
        showName: league.season.show.name,
        totalPoints: last.cumulativePoints,
        finalRank: last.rank,
        teamCount: league.teams.length,
        seasonCompleted: league.season.status === 'COMPLETED',
        history,
      },
    ];
  });

  // One transaction: a record without its delete would double-count a league
  // still standing, and a delete without its records is the loss this exists
  // to prevent. `skipDuplicates` covers a retry after a partial failure.
  await prisma.$transaction(async (tx) => {
    if (records.length > 0) await tx.careerRecord.createMany({ data: records, skipDuplicates: true });
    await tx.league.delete({ where: { id: leagueId } });
  });

  return { deleted: true, name: league.name };
}

export async function startDraft(leagueId: string, userId: string) {
  await assertLeagueRole(leagueId, userId, ['COMMISSIONER', 'ADMIN']);
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: {
      draftStatus: true,
      rosterSize: true,
      seasonId: true,
      chatWebhookUrl: true,
      _count: { select: { teams: true } },
    },
  });
  if (league.draftStatus !== 'NOT_STARTED') {
    throw new DomainError('The draft has already started.', 'DRAFT_STARTED', 409);
  }
  if (league._count.teams < 2) {
    throw new DomainError('A draft needs at least two teams.', 'NOT_ENOUGH_TEAMS');
  }

  /**
   * A draft that asks for more houseguests than the show has cannot finish.
   *
   * There is no failure mode worse than this one in the app: the board simply
   * runs out of people, the team on the clock can never pick, and the draft
   * stays IN_PROGRESS forever with no way out short of editing the database.
   * Four teams at five apiece is twenty picks, and a Big Brother season has
   * sixteen houseguests — so this is not an exotic configuration, it is an
   * ordinary one.
   */
  const needed = league._count.teams * league.rosterSize;
  const available = await prisma.contestant.count({ where: { seasonId: league.seasonId } });
  if (needed > available) {
    throw new DomainError(
      `This draft needs ${needed} contestants (${league._count.teams} teams × ${league.rosterSize}) ` +
        `but the season only has ${available}. Lower the roster size in league settings and try again.`,
      'NOT_ENOUGH_CONTESTANTS',
    );
  }
  const updated = await prisma.league.update({
    where: { id: leagueId },
    data: { draftStatus: 'IN_PROGRESS', draftStartsAt: new Date() },
    select: { id: true, name: true, draftStatus: true, draftStartsAt: true },
  });

  // The one notification in this app that is genuinely time-critical: a snake
  // draft stalls on whoever is on the clock, so someone who does not know it
  // started holds up everybody else.
  const members = await prisma.leagueMember.findMany({
    where: { leagueId, status: 'ACTIVE' },
    select: { userId: true },
  });
  await notify(
    members.map((member) => ({
      userId: member.userId,
      actorId: userId,
      type: 'LEAGUE_DRAFT_STARTED' as const,
      title: `The ${updated.name} draft has started`,
      body: 'Get in before your pick comes around.',
      href: `/leagues/${leagueId}/draft`,
      data: { leagueId },
    })),
  );

  if (league.chatWebhookUrl) {
    // Whoever holds the first slot — the same ordering the board uses.
    const first = await prisma.team.findFirst({
      where: { leagueId },
      orderBy: DRAFT_TEAM_ORDER,
      select: { name: true },
    });
    announceDraftStarted({
      id: leagueId,
      name: updated.name,
      chatWebhookUrl: league.chatWebhookUrl,
      rosterSize: league.rosterSize,
      teamCount: league._count.teams,
      firstTeam: first?.name ?? null,
    });
  }

  return updated;
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
    select: {
      id: true,
      name: true,
      seasonId: true,
      rosterSize: true,
      draftType: true,
      draftStatus: true,
      chatWebhookUrl: true,
    },
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
      orderBy: DRAFT_TEAM_ORDER,
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

  await announceDraftProgress({
    leagueId,
    leagueName: league.name,
    chatWebhookUrl: league.chatWebhookUrl,
    order,
    slot: validation.slot,
    actorId: userId,
    teamId,
    contestantId,
  });

  return validation.slot;
}

/**
 * Tells the next manager the draft is waiting on them.
 *
 * A snake draft is a queue with one server: until the person on the clock
 * picks, nobody else can do anything. That makes this the one notification in
 * the app with a real cost to being missed, and the reason it is worth a
 * round trip after every single pick.
 *
 * After the commit and never inside it, like every other notification here —
 * an alert must not be able to roll back the pick it is reporting.
 */
async function announceDraftProgress(input: {
  leagueId: string;
  leagueName: string;
  chatWebhookUrl: string | null;
  order: DraftSlot[];
  slot: DraftSlot;
  actorId: string;
  teamId: string;
  contestantId: string;
}) {
  const { leagueId, leagueName, order, slot, actorId } = input;

  // `slot.pickNumber` is 1-indexed, so this index is the pick *after* it.
  const next = order[slot.pickNumber];

  if (input.chatWebhookUrl) {
    // Names only when there is a chat to tell: two small reads, skipped for
    // the many leagues that never connect one.
    const [picker, contestant, upNext] = await Promise.all([
      prisma.team.findUnique({ where: { id: input.teamId }, select: { name: true } }),
      prisma.contestant.findUnique({ where: { id: input.contestantId }, select: { name: true } }),
      next ? prisma.team.findUnique({ where: { id: next.teamId }, select: { name: true } }) : null,
    ]);
    if (picker && contestant) {
      announceDraftPick({
        leagueId,
        leagueName,
        chatWebhookUrl: input.chatWebhookUrl,
        teamName: picker.name,
        contestantName: contestant.name,
        round: slot.round,
        pickNumber: slot.pickNumber,
        totalPicks: order.length,
        nextTeam: upNext?.name ?? null,
      });
    }
  }

  if (!next) {
    const members = await prisma.leagueMember.findMany({
      where: { leagueId, status: 'ACTIVE' },
      select: { userId: true },
    });
    await notify(
      members.map((member) => ({
        userId: member.userId,
        type: 'LEAGUE_DRAFT_COMPLETED' as const,
        title: `The ${leagueName} draft is done`,
        body: 'Rosters are set. Scores start moving with the next episode.',
        href: `/leagues/${leagueId}`,
        data: { leagueId },
      })),
    );
    return;
  }

  const team = await prisma.team.findUnique({
    where: { id: next.teamId },
    select: { name: true, ownerId: true },
  });
  if (!team) return;

  await notify({
    userId: team.ownerId,
    actorId,
    type: 'LEAGUE_DRAFT_PICK_DUE',
    title: `You're on the clock in ${leagueName}`,
    body: `Round ${next.round}, pick ${next.pickNumber} of ${order.length}. Everyone else is waiting on you.`,
    href: `/leagues/${leagueId}/draft`,
    data: { leagueId, pickNumber: next.pickNumber, round: next.round },
  });
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
export async function recordEvents(userId: string, input: z.infer<typeof recordEventsSchema>) {
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

// ---------------------------------------------------------------------------
// League feed
// ---------------------------------------------------------------------------

const postMessageSchema = z.object({
  body: z.string().trim().min(1, 'Say something first').max(500, 'Keep it under 500 characters'),
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
export async function toggleMessageReaction(messageId: string, userId: string, kind: 'HYPE' | 'SHADE') {
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
