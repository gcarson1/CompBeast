import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeLeagueSnapshot } from '../scoring/repository';
import { createLeague, joinLeague, makeDraftPick, startDraft } from '../../server/mutations';
import { bootstrapSeasonFromSource, ingestSeason } from './pipeline';
import type { BigBrotherSeasonFacts, BigBrotherWeekResult, RawPlayerRef } from './types';

/**
 * A live Big Brother season, synced week by week against the database.
 *
 * The mapper tests prove what one read of a page says. What went wrong on
 * Big Brother 28 only shows across syncs: a jury award keyed to the latest
 * week was paid again every week, a Tuesday sync paid "survive the week" to
 * the houseguest evicted on Thursday, and a week the source listed after the
 * draft had nobody's roster on it. Each of those is a sequence, so this is
 * one: draft, sync mid-week, sync after the eviction, glitch, recover.
 *
 * Builds its own season from hand-written facts — no network — and removes
 * it after. Skips itself when no database is reachable.
 */
const prisma = new PrismaClient();

let dbReady = false;
let rulesetId = '';
try {
  const ruleset = await prisma.scoringRuleset.findFirst({
    where: { show: { slug: 'big-brother' }, slug: 'classic-measurable' },
    select: { id: true },
  });
  if (ruleset) {
    rulesetId = ruleset.id;
    dbReady = true;
  }
} catch {
  dbReady = false;
}

const stamp = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const SOURCE = 'big-brother-junkies';
const player = (tag: string): RawPlayerRef => ({ externalId: `${stamp}-${tag}`, name: `HG ${tag}` });
const [ana, ben, cal, dee, eve, fay] = ['ana', 'ben', 'cal', 'dee', 'eve', 'fay'].map(player);

const week = (weekNumber: number, rest: Partial<BigBrotherWeekResult> = {}): BigBrotherWeekResult => ({
  weekLabel: `W${weekNumber}`,
  weekNumber,
  aired: true,
  hoh: [],
  veto: [],
  nominees: [],
  eliminated: [],
  ...rest,
});

function facts(
  weeks: BigBrotherWeekResult[],
  out: Array<[RawPlayerRef, string, string]>,
): BigBrotherSeasonFacts {
  const placed = new Map(out.map(([p, place, status]) => [p.externalId, { place, status }]));
  const everyone = [ana, ben, cal, dee, eve, fay];
  return {
    sourceSlug: SOURCE,
    sourceUrl: 'https://example.test/live',
    seasonLabel: `Test ${stamp}`,
    premiereDate: new Date('2026-07-09T20:00:00-04:00'),
    finaleDate: null,
    weeks,
    placements: everyone.map((p) => ({
      order: null,
      player: p,
      dateLabel: '',
      dayLabel: '',
      placeLabel: placed.get(p.externalId)?.place ?? '',
    })),
    cast: everyone.map((p) => ({
      ...p,
      statusLabel: placed.get(p.externalId)?.status ?? 'Active',
      placeLabel: placed.get(p.externalId)?.place ?? null,
    })),
    fetchedAt: new Date(),
  };
}

const week1 = week(1, { hoh: [ana], veto: [ben], nominees: [eve, fay], eliminated: [fay] });
// Week 2 with its HOH and nominations in, and Cal's eviction still to come.
const midWeek = facts([week1, week(2, { hoh: [ben], nominees: [cal, dee] })], [[fay, '6th Place', 'Out']]);
// A week on: Cal evicted as the first juror, and week 3 — a cycle nobody
// drafted into — under way.
const weekOn = facts(
  [
    week1,
    week(2, { hoh: [ben], nominees: [cal, dee], eliminated: [cal] }),
    week(3, { hoh: [dee], nominees: [ana, eve] }),
  ],
  [
    [fay, '6th Place', 'Out'],
    [cal, '5th Place', 'Jury'],
  ],
);

let seasonId = '';
let leagueId = '';
let alice = '';
const userIds: string[] = [];

const sync = (f: BigBrotherSeasonFacts) =>
  ingestSeason({ sourceSlug: SOURCE, seasonExternalId: stamp, recordedById: alice, facts: f });

async function liveEvents(code: string) {
  return prisma.scoredEvent.findMany({
    where: { isVoided: false, eventDefinition: { code }, cycle: { seasonId } },
    select: { contestant: { select: { name: true } }, cycle: { select: { sequence: true } } },
  });
}

/** What the old mapper left behind: an award published under a key the mapper no longer makes. */
async function legacyEvent(code: string, who: RawPlayerRef, sequence: number, ref: string) {
  const [contestant, cycle, definition] = await Promise.all([
    prisma.contestant.findFirstOrThrow({ where: { seasonId, name: who.name }, select: { id: true } }),
    prisma.cycle.findFirstOrThrow({ where: { seasonId, sequence }, select: { id: true } }),
    prisma.eventDefinition.findFirstOrThrow({
      where: { code, show: { slug: 'big-brother' } },
      select: { id: true, points: true },
    }),
  ]);
  const event = await prisma.scoredEvent.create({
    data: {
      contestantId: contestant.id,
      cycleId: cycle.id,
      eventDefinitionId: definition.id,
      pointsAwarded: definition.points,
    },
  });
  await prisma.ingestedEventCandidate.create({
    data: {
      sourceSlug: SOURCE,
      sourceRef: ref,
      seasonId,
      cycleId: cycle.id,
      contestantId: contestant.id,
      eventCode: code,
      rawPlayerName: who.name,
      rawPlayerRef: who.externalId,
      rawWeekLabel: `W${sequence}`,
      confidence: 'HIGH',
      status: 'AUTO_PUBLISHED',
      scoredEventId: event.id,
    },
  });
  return event.id;
}

beforeAll(async () => {
  if (!dbReady) return;
  for (const tag of ['alice', 'bob']) {
    const user = await prisma.user.create({
      data: { authId: `${stamp}-${tag}`, email: `${stamp}-${tag}@example.invalid`, name: tag },
      select: { id: true },
    });
    userIds.push(user.id);
  }
  alice = userIds[0];

  ({ seasonId } = await bootstrapSeasonFromSource({
    sourceSlug: SOURCE,
    seasonExternalId: stamp,
    showSlug: 'big-brother',
    year: 2026,
    facts: midWeek,
  }));

  const league = await createLeague(alice, {
    name: `${stamp} league`,
    seasonId,
    scoringRulesetId: rulesetId,
    rosterSize: 3,
    maxTeams: 2,
    isPublic: false,
    teamName: 'Alice Squad',
  });
  leagueId = league.id;
  const { inviteCode } = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: { inviteCode: true },
  });
  await joinLeague(userIds[1], inviteCode, 'Bob Squad');
  await startDraft(leagueId, alice);

  // Snake order over the six houseguests: every one of them is on a team.
  const teams = await prisma.team.findMany({
    where: { leagueId },
    orderBy: { draftOrderPosition: 'asc' },
    select: { id: true, ownerId: true },
  });
  const contestants = await prisma.contestant.findMany({
    where: { seasonId },
    orderBy: { name: 'asc' },
    select: { id: true },
  });
  const order = [0, 1, 1, 0, 0, 1];
  for (const [i, contestant] of contestants.entries()) {
    const team = teams[order[i]];
    await makeDraftPick({ leagueId, teamId: team.id, contestantId: contestant.id, userId: team.ownerId });
  }
});

afterAll(async () => {
  if (seasonId) {
    if (leagueId) await prisma.league.delete({ where: { id: leagueId } });
    await prisma.scoredEvent.deleteMany({ where: { cycle: { seasonId } } });
    await prisma.ingestionRun.deleteMany({ where: { seasonId } });
    await prisma.season.delete({ where: { id: seasonId } });
  }
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe.skipIf(!dbReady)('syncing a live season week by week', () => {
  it('pays nobody for surviving a week that is still being played', async () => {
    const summary = await sync(midWeek);
    expect(summary.status).toBe('SUCCESS');
    const survived = await liveEvents('WEEK_SURVIVED');
    expect(survived.filter((e) => e.cycle.sequence === 2)).toHaveLength(0);
    expect(survived.filter((e) => e.cycle.sequence === 1)).toHaveLength(5);
    expect(await liveEvents('SURVIVED_BLOCK')).toHaveLength(1); // Eve, week 1
  });

  it('withdraws what the old keys paid, and pays the jury once, the week it began', async () => {
    // As the old mapper would have it: survival paid to Cal mid-week, and a
    // jury award for Cal keyed to week 3, "the latest week" at the time.
    const survivalId = await legacyEvent(
      'WEEK_SURVIVED',
      cal,
      2,
      `${stamp}:w2:WEEK_SURVIVED:${cal.externalId}`,
    );
    const juryId = await legacyEvent('REACHED_JURY', cal, 2, `${stamp}:w3:REACHED_JURY:${cal.externalId}`);

    // Synced before the week-3 cycle exists, as the admin Sync button used to.
    const summary = await sync(weekOn);
    expect(summary.withdrawn).toBe(2);
    expect(summary.pendingReview).toBe(5); // week 3's HOH and nominations: no cycle yet

    const withdrawn = await prisma.scoredEvent.findMany({
      where: { id: { in: [survivalId, juryId] } },
      select: { isVoided: true, voidedReason: true, audits: { select: { action: true } } },
    });
    for (const event of withdrawn) {
      expect(event.isVoided).toBe(true);
      expect(event.voidedReason).toMatch(/^No longer stated by big-brother-junkies/);
      expect(event.audits.map((a) => a.action)).toContain('VOIDED');
    }

    // Everyone in the house when Cal left — Cal and the four still playing.
    const jury = await liveEvents('REACHED_JURY');
    expect(jury.map((e) => e.contestant.name).sort()).toEqual([
      'HG ana',
      'HG ben',
      'HG cal',
      'HG dee',
      'HG eve',
    ]);
    expect(jury.every((e) => e.cycle.sequence === 2)).toBe(true);

    const week2 = (await liveEvents('WEEK_SURVIVED')).filter((e) => e.cycle.sequence === 2);
    expect(week2.map((e) => e.contestant.name).sort()).toEqual(['HG ana', 'HG ben', 'HG dee', 'HG eve']);

    // A second sync of the same page changes nothing.
    const again = await sync(weekOn);
    expect([again.autoPublished, again.withdrawn, again.restored]).toEqual([0, 0, 0]);
  });

  it('publishes what was held only for want of its week, once the week exists', async () => {
    const { cyclesCreated } = await bootstrapSeasonFromSource({
      sourceSlug: SOURCE,
      seasonExternalId: stamp,
      showSlug: 'big-brother',
      year: 2026,
      facts: weekOn,
    });
    expect(cyclesCreated).toBe(1);
    const summary = await sync(weekOn);
    expect(summary.autoPublished).toBe(5);
    expect(
      await prisma.ingestedEventCandidate.count({ where: { seasonId, status: 'PENDING', cycleId: null } }),
    ).toBe(0);
  });

  it('puts every roster on a week the source listed after the draft', async () => {
    const week3 = await prisma.cycle.findFirstOrThrow({
      where: { seasonId, sequence: 3 },
      select: { id: true },
    });
    expect(await prisma.rosterSlot.count({ where: { cycleId: week3.id } })).toBe(6);

    // Dee's week-3 HOH reaches whichever team drafted her, and every team's
    // total is the sum of its players' events.
    const snapshot = await computeLeagueSnapshot(leagueId);
    expect(snapshot.unattributedEventIds).toEqual([]);
    const stored = await prisma.teamCycleScore.findMany({
      where: { teamId: { in: snapshot.teams.map((t) => t.teamId) }, cycleId: week3.id },
      select: { teamId: true, cumulativePoints: true },
    });
    for (const team of snapshot.teams) {
      expect(Number(stored.find((s) => s.teamId === team.teamId)?.cumulativePoints)).toBe(team.totalPoints);
    }
  });

  it('withdraws a fact the page drops, and restores it when the page has it again', async () => {
    const glitch = {
      ...weekOn,
      weeks: weekOn.weeks.map((w) => (w.weekNumber === 1 ? { ...w, hoh: [] } : w)),
    };
    expect((await sync(glitch)).withdrawn).toBe(1);
    expect(await liveEvents('HOH_WIN')).toHaveLength(2);

    const fixed = await sync(weekOn);
    expect(fixed.restored).toBe(1);
    expect((await liveEvents('HOH_WIN')).map((e) => e.contestant.name).sort()).toEqual([
      'HG ana',
      'HG ben',
      'HG dee',
    ]);
  });

  it('holds back when a page suddenly states far less than it did', async () => {
    const before = await prisma.scoredEvent.count({ where: { isVoided: false, cycle: { seasonId } } });
    // A parser gone half-blind: weeks 1 and 2 read as empty.
    const broken = {
      ...weekOn,
      weeks: weekOn.weeks.map((w) => (w.weekNumber < 3 ? { ...w, aired: false } : w)),
    };
    const summary = await sync(broken);
    expect(summary.withdrawn).toBe(0);
    expect(summary.warning).toMatch(/^Held back withdrawing/);
    expect(await prisma.scoredEvent.count({ where: { isVoided: false, cycle: { seasonId } } })).toBe(before);
  });
});
