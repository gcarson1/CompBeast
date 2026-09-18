import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { recalculateLeaguesForCycle } from '../scoring/repository';
import { bigBrotherJunkiesAdapter } from './sources/big-brother-junkies';
import { mapBigBrotherSeason } from './mappers/big-brother';
import { IngestionError, type CandidateEvent, type RawSeasonFacts, type SeasonSourceAdapter } from './types';

const ADAPTERS: Record<string, SeasonSourceAdapter> = {
  [bigBrotherJunkiesAdapter.slug]: bigBrotherJunkiesAdapter,
};

export function getAdapter(slug: string): SeasonSourceAdapter {
  const adapter = ADAPTERS[slug];
  if (!adapter) throw new IngestionError(`No adapter registered for "${slug}"`, slug);
  return adapter;
}

// ---------------------------------------------------------------------------
// Season bootstrap
// ---------------------------------------------------------------------------

export interface BootstrapResult {
  seasonId: string;
  contestantsCreated: number;
  contestantsLinked: number;
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
  const facts = input.facts ?? (await adapter.fetchSeason(input.seasonExternalId));

  const show = await prisma.show.findUnique({ where: { slug: input.showSlug } });
  if (!show) throw new IngestionError(`Unknown show "${input.showSlug}"`, input.sourceSlug);

  const name = input.seasonName ?? facts.seasonLabel;

  const season = await prisma.season.upsert({
    where: { slug: input.seasonExternalId },
    update: { name },
    create: { showId: show.id, slug: input.seasonExternalId, name, year: input.year },
  });

  // Cycles: one per week the source reports, plus a finale label on the last.
  const existingCycles = await prisma.cycle.findMany({
    where: { seasonId: season.id },
    select: { sequence: true },
  });
  const knownSequences = new Set(existingCycles.map((c) => c.sequence));

  let cyclesCreated = 0;
  for (const week of facts.weeks) {
    if (knownSequences.has(week.weekNumber)) continue;
    const isFinale = week.weekNumber === facts.weeks.at(-1)?.weekNumber;
    // Real air dates are not in the results grid, so cycles start unscheduled;
    // a commissioner sets lock times, or a later sync fills them in.
    await prisma.cycle.create({
      data: {
        seasonId: season.id,
        sequence: week.weekNumber,
        label: isFinale ? 'Finale' : `Week ${week.weekNumber}`,
        locksAt: new Date(),
        status: 'SCORED',
      },
    });
    cyclesCreated += 1;
  }

  // Contestants, keyed by the source's slug.
  let contestantsCreated = 0;
  let contestantsLinked = 0;

  for (const member of facts.cast) {
    const existingLink = await prisma.contestantExternalRef.findUnique({
      where: {
        sourceSlug_externalId: { sourceSlug: facts.sourceSlug, externalId: member.externalId },
      },
      select: { contestantId: true },
    });
    if (existingLink) continue;

    const contestant = await prisma.contestant.create({
      data: {
        seasonId: season.id,
        name: member.name,
        photoUrl: member.photoUrl,
        metadata: { sourceStatus: member.statusLabel, sourcePlace: member.placeLabel },
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

  return { seasonId: season.id, contestantsCreated, contestantsLinked, cyclesCreated };
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
  error?: string;
}

/**
 * Fetches a season, maps it to candidates, and publishes what it can.
 *
 * Candidates are upserted on `(sourceSlug, sourceRef)`, so re-running this on
 * an unchanged page is a no-op. Only HIGH-confidence candidates that resolve
 * cleanly to a contestant and cycle publish automatically; everything else is
 * left PENDING for review.
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
    const facts = input.facts ?? (await adapter.fetchSeason(seasonExternalId));

    const season = await prisma.season.findUnique({
      where: { slug: seasonExternalId },
      select: { id: true, showId: true },
    });
    if (!season) {
      throw new IngestionError(
        `Season "${seasonExternalId}" has not been bootstrapped yet.`,
        sourceSlug,
      );
    }

    const candidates = mapBigBrotherSeason(facts, seasonExternalId);

    const [links, cycles, definitions] = await Promise.all([
      prisma.contestantExternalRef.findMany({
        where: { sourceSlug },
        select: { externalId: true, contestantId: true },
      }),
      prisma.cycle.findMany({
        where: { seasonId: season.id },
        select: { id: true, sequence: true },
      }),
      prisma.eventDefinition.findMany({
        where: { showId: season.showId },
        select: { id: true, code: true, points: true },
      }),
    ]);

    const contestantByExternalId = new Map(links.map((l) => [l.externalId, l.contestantId]));
    const cycleBySequence = new Map(cycles.map((c) => [c.sequence, c.id]));
    const definitionByCode = new Map(definitions.map((d) => [d.code, d]));

    let candidatesNew = 0;
    let autoPublished = 0;
    let pendingReview = 0;
    const touchedCycleIds = new Set<string>();

    for (const candidate of candidates) {
      const resolved = resolveCandidate(candidate, {
        contestantByExternalId,
        cycleBySequence,
        hasDefinition: definitionByCode.has(candidate.eventCode),
      });

      const existing = await prisma.ingestedEventCandidate.findUnique({
        where: { sourceSlug_sourceRef: { sourceSlug, sourceRef: candidate.sourceRef } },
        select: { id: true, status: true },
      });

      // Already handled — never re-publish or re-open a reviewed decision.
      if (existing) continue;

      const canAutoPublish =
        resolved.confidence === 'HIGH' &&
        resolved.contestantId !== null &&
        resolved.cycleId !== null;

      const record = await prisma.ingestedEventCandidate.create({
        data: {
          sourceSlug,
          sourceRef: candidate.sourceRef,
          sourceUrl: facts.sourceUrl,
          seasonId: season.id,
          cycleId: resolved.cycleId,
          contestantId: resolved.contestantId,
          eventCode: candidate.eventCode,
          rawPlayerName: candidate.player.name,
          rawPlayerRef: candidate.player.externalId,
          rawWeekLabel: candidate.weekLabel,
          confidence: resolved.confidence,
          confidenceReasons: resolved.reasons,
          status: canAutoPublish ? 'AUTO_PUBLISHED' : 'PENDING',
        },
      });
      candidatesNew += 1;

      if (!canAutoPublish) {
        pendingReview += 1;
        continue;
      }

      const scoredEventId = await publishCandidate({
        candidateId: record.id,
        contestantId: resolved.contestantId!,
        cycleId: resolved.cycleId!,
        definition: definitionByCode.get(candidate.eventCode)!,
        recordedById,
        note: `Auto-ingested from ${sourceSlug}`,
      });

      touchedCycleIds.add(resolved.cycleId!);
      autoPublished += 1;
      void scoredEventId;
    }

    for (const cycleId of touchedCycleIds) {
      await recalculateLeaguesForCycle(cycleId);
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
      error: message,
    };
  }
}

function resolveCandidate(
  candidate: CandidateEvent,
  lookups: {
    contestantByExternalId: Map<string, string>;
    cycleBySequence: Map<number, string>;
    hasDefinition: boolean;
  },
): { contestantId: string | null; cycleId: string | null; confidence: CandidateEvent['confidence']; reasons: string[] } {
  const reasons = [...candidate.reasons];
  let confidence = candidate.confidence;

  const contestantId = lookups.contestantByExternalId.get(candidate.player.externalId) ?? null;
  if (!contestantId) {
    reasons.push(`No contestant linked to source id "${candidate.player.externalId}"`);
    confidence = 'LOW';
  }

  const cycleId =
    candidate.weekNumber === null ? null : lookups.cycleBySequence.get(candidate.weekNumber) ?? null;
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
  recordedById: string;
  note: string;
}): Promise<string> {
  const { candidateId, contestantId, cycleId, definition, recordedById, note } = input;

  return prisma.$transaction(async (tx) => {
    const event = await tx.scoredEvent.create({
      data: {
        contestantId,
        eventDefinitionId: definition.id,
        cycleId,
        pointsAwarded: definition.points,
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
    throw new IngestionError(
      `No EventDefinition for "${candidate.eventCode}".`,
      candidate.sourceSlug,
    );
  }

  await publishCandidate({
    candidateId: candidate.id,
    contestantId: candidate.contestantId,
    cycleId: candidate.cycleId,
    definition,
    recordedById: userId,
    note: `Approved from ${candidate.sourceSlug}`,
  });

  await prisma.ingestedEventCandidate.update({
    where: { id: candidateId },
    data: { status: 'PUBLISHED', reviewedById: userId, reviewedAt: new Date() },
  });

  await recalculateLeaguesForCycle(candidate.cycleId);
}

export async function rejectCandidate(
  candidateId: string,
  userId: string,
  reason: string,
): Promise<void> {
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
