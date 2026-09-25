import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import {
  ensureRosterSlots,
  recalculateLeaguesForCycle,
  recalculateSeasonLeagues,
} from '../scoring/repository';
import { lexiconFor } from '../shows/lexicon';
import { bigBrotherJunkiesAdapter } from './sources/big-brother-junkies';
import { wikipediaSurvivorAdapter } from './sources/wikipedia-survivor';
import { wikipediaTraitorsAdapter } from './sources/wikipedia-traitors';
import { mapBigBrotherSeason } from './mappers/big-brother';
import { mapSurvivorSeason } from './mappers/survivor';
import { mapTraitorsSeason } from './mappers/traitors';
import {
  IngestionError,
  placementFromLabel,
  type CandidateEvent,
  type RawSeasonFacts,
  type SeasonMapper,
  type SeasonSourceAdapter,
} from './types';

/**
 * The two registries. Adapters are keyed by the site they parse; mappers by
 * the show whose rules they know. An adapter's facts are typed to its show,
 * and the pipeline pairs the two through the season's show — which is why
 * both are widened to the generic facts here: the pairing is checked at
 * runtime (`assertAdapterServes`), not by the type system across the map.
 */
const ADAPTERS: Record<string, SeasonSourceAdapter> = {
  [bigBrotherJunkiesAdapter.slug]: bigBrotherJunkiesAdapter,
  [wikipediaSurvivorAdapter.slug]: wikipediaSurvivorAdapter as SeasonSourceAdapter,
  [wikipediaTraitorsAdapter.slug]: wikipediaTraitorsAdapter as SeasonSourceAdapter,
};

const MAPPERS: Record<string, SeasonMapper> = {
  'big-brother': mapBigBrotherSeason as SeasonMapper,
  survivor: mapSurvivorSeason as SeasonMapper,
  traitors: mapTraitorsSeason as SeasonMapper,
};

export function getAdapter(slug: string): SeasonSourceAdapter {
  const adapter = ADAPTERS[slug];
  if (!adapter) throw new IngestionError(`No adapter registered for "${slug}"`, slug);
  return adapter;
}

export function getMapper(showSlug: string, sourceSlug: string): SeasonMapper {
  const mapper = MAPPERS[showSlug];
  if (!mapper) throw new IngestionError(`No mapper registered for show "${showSlug}"`, sourceSlug);
  return mapper;
}

/** The sources that can feed a show, for the admin page's sync controls. */
export function adaptersForShow(showSlug: string): SeasonSourceAdapter[] {
  return Object.values(ADAPTERS).filter((adapter) => adapter.showSlug === showSlug);
}

/**
 * A Big Brother site cannot populate a Survivor season: the mapper would read
 * columns the facts do not have. Refused up front rather than left to produce
 * an empty run that looks like a parser failure.
 */
function assertAdapterServes(adapter: SeasonSourceAdapter, showSlug: string): void {
  if (adapter.showSlug !== showSlug) {
    throw new IngestionError(
      `Source "${adapter.slug}" covers ${adapter.showSlug}, not ${showSlug}.`,
      adapter.slug,
    );
  }
}

// ---------------------------------------------------------------------------
// Season bootstrap
// ---------------------------------------------------------------------------

/**
 * A season with a crowned winner is over. One with an aired cycle, or a
 * premiere already behind us, is in play. Anything else is still to come —
 * and must say so, or the home page announces it as airing now. Both
 * bootstrap and every sync apply this, so a season that premiered since it
 * was bootstrapped flips to ACTIVE on its own.
 */
export function seasonStatusFrom(facts: RawSeasonFacts): 'UPCOMING' | 'ACTIVE' | 'COMPLETED' {
  const hasWinner = facts.placements.some((e) => /winner|sole survivor/i.test(e.placeLabel));
  const anyAired = facts.weeks.some((w) => w.aired);
  const premiered = facts.premiereDate !== null && facts.premiereDate.getTime() <= Date.now();
  return hasWinner ? 'COMPLETED' : anyAired || premiered ? 'ACTIVE' : 'UPCOMING';
}

export interface BootstrapResult {
  seasonId: string;
  contestantsCreated: number;
  contestantsLinked: number;
  photosBackfilled: number;
  cyclesCreated: number;
}

/**
 * Creates the season's contestants and cycles from a source, and records each
 * contestant's source-side id.
 *
 * This has to run before event ingestion: candidates are matched by external
 * id, so without these links every parsed event is unattributable.
 */
export async function bootstrapSeasonFromSource(input: {
  sourceSlug: string;
  seasonExternalId: string;
  showSlug: string;
  seasonName?: string;
  year: number;
  facts?: RawSeasonFacts;
}): Promise<BootstrapResult> {
  const adapter = getAdapter(input.sourceSlug);
  assertAdapterServes(adapter, input.showSlug);
  const facts = input.facts ?? (await adapter.fetchSeason(input.seasonExternalId));

  const show = await prisma.show.findUnique({ where: { slug: input.showSlug } });
  if (!show) throw new IngestionError(`Unknown show "${input.showSlug}"`, input.sourceSlug);
  const lexicon = lexiconFor(show.slug, show.lexicon);

  const name = input.seasonName ?? facts.seasonLabel;
  const status = seasonStatusFrom(facts);

  const dates = {
    startDate: facts.premiereDate ?? undefined,
    endDate: facts.finaleDate ?? undefined,
  };
  const season = await prisma.season.upsert({
    where: { slug: input.seasonExternalId },
    update: { name, status, ...dates },
    create: { showId: show.id, slug: input.seasonExternalId, name, year: input.year, status, ...dates },
  });

  // Cycles: one per week the source reports, plus a finale label on the last.
  const existingCycles = await prisma.cycle.findMany({
    where: { seasonId: season.id },
    select: { id: true, sequence: true },
  });
  const cycleBySequence = new Map(existingCycles.map((c) => [c.sequence, c.id]));
  const schedule = buildCycleSchedule(facts);

  let cyclesCreated = 0;
  for (const week of facts.weeks) {
    const isFinale = week.weekNumber === facts.weeks.at(-1)?.weekNumber;
    const airsAt = schedule.get(week.weekNumber) ?? null;
    // Rosters lock 30 minutes before the episode airs.
    const locksAt = airsAt ? new Date(airsAt.getTime() - 30 * 60 * 1000) : new Date();

    const data = {
      label: isFinale ? 'Finale' : `${lexicon.cycleSingular} ${week.weekNumber}`,
      airsAt,
      locksAt,
      // An unaired week must stay UPCOMING or its roster lock is meaningless
      // and the app will present a future week as already settled.
      status: week.aired ? ('SCORED' as const) : ('UPCOMING' as const),
    };

    const existingId = cycleBySequence.get(week.weekNumber);
    if (existingId) {
      await prisma.cycle.update({ where: { id: existingId }, data });
      continue;
    }

    await prisma.cycle.create({
      data: { seasonId: season.id, sequence: week.weekNumber, ...data },
    });
    cyclesCreated += 1;
  }

  // Contestants, keyed by the source's slug.
  let contestantsCreated = 0;
  let contestantsLinked = 0;
  let photosBackfilled = 0;

  for (const member of facts.cast) {
    const existingLink = await prisma.contestantExternalRef.findUnique({
      where: {
        sourceSlug_externalId: { sourceSlug: facts.sourceSlug, externalId: member.externalId },
      },
      select: { contestantId: true, contestant: { select: { photoUrl: true, metadata: true } } },
    });

    if (existingLink) {
      // Bootstrap is safe to re-run. A photo the source has since gained is
      // filled in, never overwritten; whatever else the source knows about
      // the person is merged over what is there, so a re-run after the cast
      // page grew a hometown column picks it up.
      const data: Prisma.ContestantUpdateInput = {};
      if (member.photoUrl && !existingLink.contestant.photoUrl) {
        data.photoUrl = member.photoUrl;
        photosBackfilled += 1;
      }
      if (member.metadata) {
        const current = (existingLink.contestant.metadata ?? {}) as Record<string, unknown>;
        data.metadata = { ...current, ...member.metadata } as Prisma.InputJsonObject;
      }
      if (Object.keys(data).length > 0) {
        await prisma.contestant.update({ where: { id: existingLink.contestantId }, data });
      }
      continue;
    }

    const contestant = await prisma.contestant.create({
      data: {
        seasonId: season.id,
        name: member.name,
        photoUrl: member.photoUrl,
        metadata: {
          ...(member.metadata ?? {}),
          sourceStatus: member.statusLabel,
          sourcePlace: member.placeLabel,
        } as Prisma.InputJsonObject,
      },
    });
    contestantsCreated += 1;

    await prisma.contestantExternalRef.create({
      data: {
        contestantId: contestant.id,
        sourceSlug: facts.sourceSlug,
        externalId: member.externalId,
      },
    });
    contestantsLinked += 1;
  }

  // A new cycle has no rosters on it until someone puts them there.
  if (cyclesCreated > 0) await ensureRosterSlots(season.id);

  return { seasonId: season.id, contestantsCreated, contestantsLinked, photosBackfilled, cyclesCreated };
}

/**
 * Works out when each cycle aired.
 *
 * Elimination dates are the only real dates a results page carries, so cycles
 * with an elimination are pinned to theirs and everything else is
 * interpolated a week apart from the premiere. Without this every cycle would
 * lock at import time and a live season would have no future deadline to
 * play against.
 */
function buildCycleSchedule(facts: RawSeasonFacts): Map<number, Date> {
  const schedule = new Map<number, Date>();
  const year = facts.premiereDate?.getFullYear() ?? new Date().getFullYear();

  // A source that states each cycle's air date needs no interpolation.
  for (const week of facts.weeks) {
    if (week.airsAt) schedule.set(week.weekNumber, week.airsAt);
  }

  const eliminationDateByPlayer = new Map<string, string>();
  for (const entry of facts.placements) {
    if (entry.dateLabel) eliminationDateByPlayer.set(entry.player.externalId, entry.dateLabel);
  }

  for (const week of facts.weeks) {
    for (const player of week.eliminated) {
      const label = eliminationDateByPlayer.get(player.externalId);
      if (!label) continue;
      // Labels read "Sep 17" with no year; the season supplies it.
      const parsed = new Date(`${label} ${year}`);
      if (!Number.isNaN(parsed.getTime())) {
        schedule.set(week.weekNumber, parsed);
        break;
      }
    }
  }

  // Fill gaps by walking a week at a time from the nearest known anchor.
  const sorted = [...facts.weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  for (const week of sorted) {
    if (schedule.has(week.weekNumber)) continue;

    const anchor = [...schedule.entries()].sort(
      (a, b) => Math.abs(a[0] - week.weekNumber) - Math.abs(b[0] - week.weekNumber),
    )[0];

    if (anchor) {
      const [anchorWeek, anchorDate] = anchor;
      const offsetDays = (week.weekNumber - anchorWeek) * 7;
      schedule.set(week.weekNumber, new Date(anchorDate.getTime() + offsetDays * 86_400_000));
    } else if (facts.premiereDate) {
      schedule.set(
        week.weekNumber,
        new Date(facts.premiereDate.getTime() + (week.weekNumber - 1) * 7 * 86_400_000),
      );
    }
  }

  if (facts.finaleDate) {
    const finale = sorted.at(-1);
    if (finale) schedule.set(finale.weekNumber, facts.finaleDate);
  }

  return schedule;
}

// ---------------------------------------------------------------------------
// Event ingestion
// ---------------------------------------------------------------------------

export interface IngestionSummary {
  runId: string;
  status: 'SUCCESS' | 'EMPTY' | 'FAILED';
  weeksParsed: number;
  candidatesNew: number;
  autoPublished: number;
  pendingReview: number;
  /** Published events the source no longer states, voided by this sync. */
  withdrawn: number;
  /** Events this sync had withdrawn before, which the source states again. */
  restored: number;
  /** Set when the sync held back from withdrawing more than looked safe. */
  warning?: string;
  error?: string;
}

/**
 * Fetches a season, maps it to candidates, and publishes what it can.
 *
 * Candidates are upserted on `(sourceSlug, sourceRef)`, so re-running this on
 * an unchanged page is a no-op. Only HIGH-confidence candidates that resolve
 * cleanly to a contestant and cycle publish automatically; everything else is
 * left PENDING for review. Then what was published before is held to what the
 * source says now (see `reconcilePublished`).
 */
export async function ingestSeason(input: {
  sourceSlug: string;
  seasonExternalId: string;
  recordedById: string;
  facts?: RawSeasonFacts;
}): Promise<IngestionSummary> {
  const { sourceSlug, seasonExternalId, recordedById } = input;

  const run = await prisma.ingestionRun.create({
    data: { sourceSlug, status: 'RUNNING' },
  });

  try {
    const adapter = getAdapter(sourceSlug);

    const season = await prisma.season.findUnique({
      where: { slug: seasonExternalId },
      select: { id: true, showId: true, status: true, show: { select: { slug: true } } },
    });
    if (!season) {
      throw new IngestionError(`Season "${seasonExternalId}" has not been bootstrapped yet.`, sourceSlug);
    }
    assertAdapterServes(adapter, season.show.slug);
    const mapSeason = getMapper(season.show.slug, sourceSlug);

    const facts = input.facts ?? (await adapter.fetchSeason(seasonExternalId));
    const candidates = mapSeason(facts, seasonExternalId);

    const seasonStatus = seasonStatusFrom(facts);
    if (seasonStatus !== season.status) {
      await prisma.season.update({ where: { id: season.id }, data: { status: seasonStatus } });
    }

    const [links, cycles, definitions] = await Promise.all([
      prisma.contestantExternalRef.findMany({
        where: { sourceSlug },
        select: { externalId: true, contestantId: true },
      }),
      prisma.cycle.findMany({
        where: { seasonId: season.id },
        select: { id: true, sequence: true, airsAt: true },
      }),
      prisma.eventDefinition.findMany({
        where: { showId: season.showId },
        select: { id: true, code: true, points: true },
      }),
    ]);

    const contestantByExternalId = new Map(links.map((l) => [l.externalId, l.contestantId]));
    const cycleBySequence = new Map(cycles.map((c) => [c.sequence, c.id]));
    const airsAtByCycle = new Map(cycles.map((c) => [c.id, c.airsAt]));
    const definitionByCode = new Map(definitions.map((d) => [d.code, d]));

    let candidatesNew = 0;
    let autoPublished = 0;
    let pendingReview = 0;
    const touchedCycleIds = new Set<string>();

    // One query for every candidate's dedupe check rather than one per
    // candidate: a full-season sync proposes hundreds, and the per-row lookup
    // made the round trips, not the work, the bottleneck.
    const known = new Map(
      (
        await prisma.ingestedEventCandidate.findMany({
          where: { sourceSlug, sourceRef: { in: candidates.map((c) => c.sourceRef) } },
          select: { id: true, sourceRef: true, status: true, cycleId: true, contestantId: true },
        })
      ).map((row) => [row.sourceRef, row]),
    );

    for (const candidate of candidates) {
      const resolved = resolveCandidate(candidate, {
        contestantByExternalId,
        cycleBySequence,
        hasDefinition: definitionByCode.has(candidate.eventCode),
      });
      const canAutoPublish =
        resolved.confidence === 'HIGH' && resolved.contestantId !== null && resolved.cycleId !== null;

      // Already handled — never re-publish or re-open a reviewed decision.
      // The one exception was never a decision: a fact held only because its
      // week or player was not in the database yet (a sync that ran before
      // the season's cycles were refreshed). It publishes once it resolves,
      // rather than waiting forever on a review that cannot approve it.
      const existing = known.get(candidate.sourceRef);
      const unblocked =
        existing?.status === 'PENDING' &&
        (existing.cycleId === null || existing.contestantId === null) &&
        canAutoPublish;
      if (existing && !unblocked) continue;

      const data = {
        cycleId: resolved.cycleId,
        contestantId: resolved.contestantId,
        confidence: resolved.confidence,
        confidenceReasons: resolved.reasons,
        status: canAutoPublish ? ('AUTO_PUBLISHED' as const) : ('PENDING' as const),
      };
      const record = existing
        ? await prisma.ingestedEventCandidate.update({ where: { id: existing.id }, data })
        : await prisma.ingestedEventCandidate.create({
            data: {
              ...data,
              sourceSlug,
              sourceRef: candidate.sourceRef,
              sourceUrl: facts.sourceUrl,
              seasonId: season.id,
              eventCode: candidate.eventCode,
              points: candidate.points,
              rawPlayerName: candidate.player.name,
              rawPlayerRef: candidate.player.externalId,
              rawWeekLabel: candidate.weekLabel,
            },
          });
      if (!existing) candidatesNew += 1;

      if (!canAutoPublish) {
        pendingReview += 1;
        continue;
      }

      const scoredEventId = await publishCandidate({
        candidateId: record.id,
        contestantId: resolved.contestantId!,
        cycleId: resolved.cycleId!,
        definition: definitionByCode.get(candidate.eventCode)!,
        points: candidate.points,
        occurredAt: occurredAt(airsAtByCycle.get(resolved.cycleId!)),
        recordedById,
        note: `Auto-ingested from ${sourceSlug}`,
      });

      touchedCycleIds.add(resolved.cycleId!);
      autoPublished += 1;
      void scoredEventId;
    }

    const reconciled = await reconcilePublished({
      sourceSlug,
      seasonId: season.id,
      candidates,
      recordedById,
    });
    for (const cycleId of reconciled.cycleIds) touchedCycleIds.add(cycleId);

    await reconcileContestantState(facts, season.id, cycleBySequence);
    const slotsAdded = await ensureRosterSlots(season.id);

    // One pass per season, not per cycle: a league recompute already spans the
    // whole season, so looping the touched cycles repeated the same work for
    // every week the sync happened to publish into.
    if (touchedCycleIds.size > 0 || slotsAdded > 0) {
      await recalculateSeasonLeagues(season.id);
    }

    const status = facts.weeks.length === 0 ? 'EMPTY' : 'SUCCESS';
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        seasonId: season.id,
        status,
        weeksParsed: facts.weeks.length,
        candidatesNew,
        autoPublished,
        pendingReview,
        error: reconciled.held,
        finishedAt: new Date(),
      },
    });

    return {
      runId: run.id,
      status,
      weeksParsed: facts.weeks.length,
      candidatesNew,
      autoPublished,
      pendingReview,
      withdrawn: reconciled.withdrawn,
      restored: reconciled.restored,
      ...(reconciled.held ? { warning: reconciled.held } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', error: message, finishedAt: new Date() },
    });
    return {
      runId: run.id,
      status: 'FAILED',
      weeksParsed: 0,
      candidatesNew: 0,
      autoPublished: 0,
      pendingReview: 0,
      withdrawn: 0,
      restored: 0,
      error: message,
    };
  }
}

/** How a withdrawal is recognised later, so only the pipeline's own are ever undone. */
const WITHDRAWN = 'No longer stated by';

/**
 * Most of a season's events one sync may withdraw before it stops and asks a
 * person: a parser that has half-broken reads as a source that retracted
 * half its facts, and leaderboards should not empty out on its say-so.
 */
const WITHDRAWAL_LIMIT = { events: 25, share: 0.1 };

/**
 * Holds the season's published events to what the source says now.
 *
 * Publishing only ever adds, so without this a fact the source has since
 * restated stays on the board beside its replacement. That is how a jury
 * award keyed to "the latest week" was paid again every week, and how a
 * houseguest evicted on Thursday kept the survival points a Tuesday sync had
 * given the whole house. A published event whose key the mapper no longer
 * produces is voided, with the reason on the audit trail; one that comes
 * back (a page edit reverted) is restored; a variable event whose value has
 * changed is re-valued. Events entered by hand, and events a person voided,
 * are never touched.
 */
async function reconcilePublished(input: {
  sourceSlug: string;
  seasonId: string;
  candidates: CandidateEvent[];
  recordedById: string;
}): Promise<{ withdrawn: number; restored: number; cycleIds: Set<string>; held: string | null }> {
  const { sourceSlug, seasonId, candidates, recordedById } = input;
  const current = new Map(candidates.map((candidate) => [candidate.sourceRef, candidate]));

  const links = await prisma.ingestedEventCandidate.findMany({
    where: {
      sourceSlug,
      seasonId,
      status: { in: ['AUTO_PUBLISHED', 'PUBLISHED'] },
      scoredEventId: { not: null },
    },
    select: { sourceRef: true, scoredEventId: true },
  });
  const events = new Map(
    (
      await prisma.scoredEvent.findMany({
        where: { id: { in: links.map((link) => link.scoredEventId!) } },
        select: { id: true, cycleId: true, isVoided: true, voidedReason: true, pointsAwarded: true },
      })
    ).map((event) => [event.id, event]),
  );
  const published = links.flatMap((link) => {
    const event = events.get(link.scoredEventId!);
    return event ? [{ sourceRef: link.sourceRef, event }] : [];
  });

  const live = published.filter((row) => !row.event.isVoided);
  const stale = live.filter((row) => !current.has(row.sourceRef));
  const revived = published.filter(
    (row) =>
      current.has(row.sourceRef) && row.event.isVoided && row.event.voidedReason?.startsWith(WITHDRAWN),
  );
  const revalued = live.filter((row) => {
    const points = current.get(row.sourceRef)?.points;
    return points !== undefined && Number(row.event.pointsAwarded) !== points;
  });

  let held: string | null = null;
  let withdraw = stale;
  if (stale.length > Math.max(WITHDRAWAL_LIMIT.events, live.length * WITHDRAWAL_LIMIT.share)) {
    held = `Held back withdrawing ${stale.length} of ${live.length} published events the source no longer states — check the parser before trusting this page.`;
    withdraw = [];
  }

  const cycleIds = new Set<string>();
  const writes: Prisma.PrismaPromise<unknown>[] = [];

  for (const row of withdraw) {
    const { event } = row;
    const reason = `${WITHDRAWN} ${sourceSlug} (${row.sourceRef})`;
    cycleIds.add(event.cycleId);
    writes.push(
      prisma.scoredEvent.update({ where: { id: event.id }, data: { isVoided: true, voidedReason: reason } }),
      prisma.scoreAudit.create({
        data: {
          scoredEventId: event.id,
          action: 'VOIDED',
          previousPoints: event.pointsAwarded,
          newPoints: 0,
          reason,
          performedById: recordedById,
        },
      }),
    );
  }

  for (const row of revived) {
    const { event } = row;
    cycleIds.add(event.cycleId);
    writes.push(
      prisma.scoredEvent.update({ where: { id: event.id }, data: { isVoided: false, voidedReason: null } }),
      prisma.scoreAudit.create({
        data: {
          scoredEventId: event.id,
          action: 'RESTORED',
          newPoints: event.pointsAwarded,
          reason: `Stated again by ${sourceSlug}`,
          performedById: recordedById,
        },
      }),
    );
  }

  for (const row of revalued) {
    const { event } = row;
    const points = current.get(row.sourceRef)!.points!;
    cycleIds.add(event.cycleId);
    writes.push(
      prisma.scoredEvent.update({ where: { id: event.id }, data: { pointsAwarded: points } }),
      prisma.ingestedEventCandidate.update({
        where: { sourceSlug_sourceRef: { sourceSlug, sourceRef: row.sourceRef } },
        data: { points },
      }),
      prisma.scoreAudit.create({
        data: {
          scoredEventId: event.id,
          action: 'POINTS_ADJUSTED',
          previousPoints: event.pointsAwarded,
          newPoints: points,
          reason: `Restated by ${sourceSlug}`,
          performedById: recordedById,
        },
      }),
    );
  }

  if (writes.length > 0) await prisma.$transaction(writes);
  return { withdrawn: withdraw.length, restored: revived.length, cycleIds, held };
}

/**
 * Syncs who is still in the game, when they left, and where they finished.
 *
 * Scored events alone do not carry this: a contestant row created at bootstrap
 * stays `isActive` forever otherwise, and a live season would show eliminated
 * contestants as still playing.
 */
async function reconcileContestantState(
  facts: RawSeasonFacts,
  seasonId: string,
  cycleBySequence: Map<number, string>,
): Promise<void> {
  const links = await prisma.contestantExternalRef.findMany({
    where: { sourceSlug: facts.sourceSlug, contestant: { seasonId } },
    select: {
      externalId: true,
      contestantId: true,
      contestant: { select: { isActive: true, placement: true, eliminatedCycleId: true } },
    },
  });
  const contestantByExternalId = new Map(links.map((l) => [l.externalId, l.contestantId]));
  const currentState = new Map(links.map((l) => [l.contestantId, l.contestant]));

  // The cycle each contestant left in, from the weekly grid.
  const eliminationCycleByPlayer = new Map<string, string>();
  for (const week of facts.weeks) {
    const cycleId = cycleBySequence.get(week.weekNumber);
    if (!cycleId) continue;
    for (const player of week.eliminated) eliminationCycleByPlayer.set(player.externalId, cycleId);
  }

  const placementByPlayer = new Map<string, number>();
  for (const entry of facts.placements) {
    const placement = placementFromLabel(entry.placeLabel);
    if (placement !== null) placementByPlayer.set(entry.player.externalId, placement);
  }

  // Only write rows that actually changed, in one batch. A re-sync of an
  // unchanged page is the common case and should cost nothing.
  const updates: Prisma.PrismaPromise<unknown>[] = [];

  for (const [externalId, contestantId] of contestantByExternalId) {
    const eliminatedCycleId = eliminationCycleByPlayer.get(externalId) ?? null;
    const placement = placementByPlayer.get(externalId) ?? null;
    const isActive = eliminatedCycleId === null;

    const current = currentState.get(contestantId);
    if (
      current &&
      current.isActive === isActive &&
      current.eliminatedCycleId === eliminatedCycleId &&
      current.placement === placement
    ) {
      continue;
    }

    updates.push(
      prisma.contestant.update({
        where: { id: contestantId },
        data: { isActive, eliminatedCycleId, placement },
      }),
    );
  }

  if (updates.length > 0) await prisma.$transaction(updates);
}

function resolveCandidate(
  candidate: CandidateEvent,
  lookups: {
    contestantByExternalId: Map<string, string>;
    cycleBySequence: Map<number, string>;
    hasDefinition: boolean;
  },
): {
  contestantId: string | null;
  cycleId: string | null;
  confidence: CandidateEvent['confidence'];
  reasons: string[];
} {
  const reasons = [...candidate.reasons];
  let confidence = candidate.confidence;

  const contestantId = lookups.contestantByExternalId.get(candidate.player.externalId) ?? null;
  if (!contestantId) {
    reasons.push(`No contestant linked to source id "${candidate.player.externalId}"`);
    confidence = 'LOW';
  }

  const cycleId =
    candidate.weekNumber === null ? null : (lookups.cycleBySequence.get(candidate.weekNumber) ?? null);
  if (!cycleId) {
    reasons.push(`No cycle matches ${candidate.weekLabel}`);
    confidence = 'LOW';
  }

  if (!lookups.hasDefinition) {
    reasons.push(`No EventDefinition for code "${candidate.eventCode}"`);
    confidence = 'LOW';
  }

  return { contestantId, cycleId, confidence, reasons };
}

/**
 * When an ingested event happened, as near as the pipeline knows: its cycle's
 * air date, unless that is still ahead (a week in progress is dated by its
 * eviction night). Stamping the sync time instead made a correction to week
 * 9, published in week 15, lead the live ticker as the latest news.
 */
function occurredAt(airsAt: Date | null | undefined): Date {
  const now = new Date();
  return airsAt && airsAt < now ? airsAt : now;
}

/**
 * Writes the ScoredEvent for a candidate and links the two.
 *
 * Goes through the same ledger + audit shape as manual admin entry, so an
 * ingested event is corrected, voided, and recalculated exactly like one a
 * commissioner typed in.
 */
async function publishCandidate(input: {
  candidateId: string;
  contestantId: string;
  cycleId: string;
  definition: { id: string; points: Prisma.Decimal };
  /** A variable event's own value; a fixed one scores the definition's points. */
  points?: Prisma.Decimal | number | null;
  occurredAt: Date;
  recordedById: string;
  note: string;
}): Promise<string> {
  const { candidateId, contestantId, cycleId, definition, points, occurredAt, recordedById, note } = input;

  return prisma.$transaction(async (tx) => {
    const event = await tx.scoredEvent.create({
      data: {
        contestantId,
        eventDefinitionId: definition.id,
        cycleId,
        pointsAwarded: points ?? definition.points,
        occurredAt,
        note,
        recordedById,
      },
      select: { id: true, pointsAwarded: true },
    });

    await tx.scoreAudit.create({
      data: {
        scoredEventId: event.id,
        action: 'CREATED',
        newPoints: event.pointsAwarded,
        reason: note,
        performedById: recordedById,
      },
    });

    await tx.ingestedEventCandidate.update({
      where: { id: candidateId },
      data: { scoredEventId: event.id },
    });

    return event.id;
  });
}

// ---------------------------------------------------------------------------
// Review actions
// ---------------------------------------------------------------------------

export async function approveCandidate(candidateId: string, userId: string): Promise<void> {
  const candidate = await prisma.ingestedEventCandidate.findUniqueOrThrow({
    where: { id: candidateId },
    include: { season: { select: { showId: true } } },
  });

  if (candidate.status !== 'PENDING') {
    throw new IngestionError('That candidate has already been resolved.', candidate.sourceSlug);
  }
  if (!candidate.contestantId || !candidate.cycleId) {
    throw new IngestionError(
      'This candidate is missing a contestant or cycle and cannot be published as-is.',
      candidate.sourceSlug,
    );
  }

  const definition = await prisma.eventDefinition.findUnique({
    where: { showId_code: { showId: candidate.season.showId, code: candidate.eventCode } },
    select: { id: true, points: true },
  });
  if (!definition) {
    throw new IngestionError(`No EventDefinition for "${candidate.eventCode}".`, candidate.sourceSlug);
  }

  const cycle = await prisma.cycle.findUnique({ where: { id: candidate.cycleId }, select: { airsAt: true } });
  await publishCandidate({
    candidateId: candidate.id,
    contestantId: candidate.contestantId,
    cycleId: candidate.cycleId,
    definition,
    points: candidate.points,
    occurredAt: occurredAt(cycle?.airsAt),
    recordedById: userId,
    note: `Approved from ${candidate.sourceSlug}`,
  });

  await prisma.ingestedEventCandidate.update({
    where: { id: candidateId },
    data: { status: 'PUBLISHED', reviewedById: userId, reviewedAt: new Date() },
  });

  await recalculateLeaguesForCycle(candidate.cycleId);
}

export async function rejectCandidate(candidateId: string, userId: string, reason: string): Promise<void> {
  const candidate = await prisma.ingestedEventCandidate.findUniqueOrThrow({
    where: { id: candidateId },
    select: { status: true, sourceSlug: true },
  });
  if (candidate.status !== 'PENDING') {
    throw new IngestionError('That candidate has already been resolved.', candidate.sourceSlug);
  }

  await prisma.ingestedEventCandidate.update({
    where: { id: candidateId },
    data: {
      status: 'REJECTED',
      rejectedReason: reason,
      reviewedById: userId,
      reviewedAt: new Date(),
    },
  });
}
