import Link from 'next/link';
import { CandidateCard, SeasonSourceCard, type PendingCandidate } from '@/components/IngestionReview';
import { RecordEvents, type RecordableSeason } from '@/components/RecordEvents';
import { StatStrip } from '@/components/StatStrip';
import { Tag } from '@/components/Tag';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { adaptersForShow } from '@/lib/ingestion/pipeline';
import { lexiconFor, lower } from '@/lib/shows/lexicon';
import { relativeTime } from '@/lib/ui';

export const dynamic = 'force-dynamic';

// Sync and bootstrap both fetch and parse a full season off the source before
// writing. That comfortably outruns the default serverless budget on a cold
// start, and the failure mode is a half-written season, so buy the headroom.
export const maxDuration = 60;

// Tag tones per run status. EMPTY is the "a parser silently broke"
// signal (see README), so it gets the same red as a failure.
const RUN_TONE: Record<string, 'gold' | 'ink' | 'red'> = {
  SUCCESS: 'gold',
  RUNNING: 'ink',
  EMPTY: 'red',
  FAILED: 'red',
};

export default async function IngestionPage() {
  const user = await getCurrentUser();
  if (!user?.isPlatformAdmin) {
    return (
      <div className="pt-2">
        <Link href="/leagues" className="text-xs text-muted">
          ← Leagues
        </Link>
        <div className="mt-6">
          <h1 className="headline text-4xl">Admins only</h1>
          <p className="mt-2 max-w-measure text-xs text-muted">
            Ingestion review rewrites scores across every league on a season.
          </p>
        </div>
      </div>
    );
  }

  const [pending, runs, seasons, counts, recordable] = await Promise.all([
    prisma.ingestedEventCandidate.findMany({
      where: { status: 'PENDING' },
      orderBy: [{ confidence: 'asc' }, { createdAt: 'asc' }],
      take: 100,
      select: {
        id: true,
        eventCode: true,
        rawPlayerName: true,
        rawWeekLabel: true,
        confidence: true,
        confidenceReasons: true,
        sourceSlug: true,
        sourceUrl: true,
        contestantId: true,
        cycleId: true,
        points: true,
        season: { select: { show: { select: { id: true } } } },
      },
    }),
    prisma.ingestionRun.findMany({ orderBy: { startedAt: 'desc' }, take: 5 }),
    prisma.season.findMany({
      where: { contestants: { some: { externalRefs: { some: {} } } } },
      select: { slug: true, name: true, year: true, show: { select: { slug: true } } },
    }),
    prisma.ingestedEventCandidate.groupBy({ by: ['status'], _count: true }),
    // Everything a hand-recorded event needs, for every season that has weeks:
    // airing first, then upcoming, then the archive.
    prisma.season.findMany({
      where: { cycles: { some: {} } },
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
      select: {
        id: true,
        name: true,
        status: true,
        cycles: { orderBy: { sequence: 'asc' }, select: { id: true, label: true, airsAt: true } },
        contestants: { orderBy: { name: 'asc' }, select: { id: true, name: true, isActive: true } },
        show: {
          select: {
            slug: true,
            lexicon: true,
            eventDefinitions: {
              where: { isPerCycleAward: false },
              orderBy: [{ category: 'asc' }, { points: 'desc' }],
              select: { code: true, label: true, category: true, points: true, isVariable: true },
            },
          },
        },
      },
    }),
  ]);

  const now = Date.now();
  const STATUS_ORDER = { ACTIVE: 0, UPCOMING: 1, COMPLETED: 2 } as const;
  const recordableSeasons: RecordableSeason[] = [...recordable]
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
    .map((season) => ({
      id: season.id,
      name: season.name,
      cycles: season.cycles.map((c) => ({ id: c.id, label: c.label })),
      currentCycleId:
        season.cycles.filter((c) => c.airsAt && c.airsAt.getTime() <= now).at(-1)?.id ??
        season.cycles[0]?.id ??
        null,
      contestants: season.contestants,
      contestantPlural: lower(lexiconFor(season.show.slug, season.show.lexicon).contestantPlural),
      events: season.show.eventDefinitions.map((d) => ({ ...d, points: Number(d.points) })),
    }));

  // Resolve labels/points so a reviewer sees what approving actually awards.
  const showIds = [...new Set(pending.map((c) => c.season.show.id))];
  const definitions = await prisma.eventDefinition.findMany({
    where: { showId: { in: showIds } },
    select: { code: true, label: true, points: true },
  });
  const byCode = new Map(definitions.map((d) => [d.code, d]));

  const candidates: PendingCandidate[] = pending.map((c) => {
    const definition = byCode.get(c.eventCode);
    return {
      id: c.id,
      eventCode: c.eventCode,
      eventLabel: definition?.label ?? null,
      // A variable event (order of eviction) carries its own value.
      points: c.points !== null ? Number(c.points) : definition ? Number(definition.points) : null,
      playerName: c.rawPlayerName,
      weekLabel: c.rawWeekLabel,
      confidence: c.confidence,
      reasons: c.confidenceReasons,
      sourceSlug: c.sourceSlug,
      sourceUrl: c.sourceUrl,
      resolvable: c.contestantId !== null && c.cycleId !== null,
    };
  });

  const tally = Object.fromEntries(counts.map((c) => [c.status, c._count]));

  return (
    <div className="pt-2">
      <Link href="/leagues" className="text-xs text-muted">
        ← Leagues
      </Link>
      <h1 className="headline mt-3 text-4xl">Ingestion</h1>
      <p className="mt-2 max-w-measure text-xs text-muted">
        Automatically captured results. High-confidence events publish on their own; anything inferred waits
        here.
      </p>

      <StatStrip
        className="mt-6"
        items={[
          { label: 'Published', value: String((tally.AUTO_PUBLISHED ?? 0) + (tally.PUBLISHED ?? 0)) },
          {
            label: 'To review',
            value: String(tally.PENDING ?? 0),
            tone: tally.PENDING ? 'text-brand-gold-deep' : undefined,
          },
          { label: 'Rejected', value: String(tally.REJECTED ?? 0) },
        ]}
      />

      <section className="mt-8" aria-labelledby="sources-heading">
        <h2 id="sources-heading" className="section-title mb-3">
          Sources
        </h2>
        {seasons.length === 0 ? (
          <p className="list-empty">
            No season has been bootstrapped yet. Run{' '}
            <code className="text-2xs">npx tsx scripts/ingest.ts bootstrap &lt;slug&gt;</code> first.
          </p>
        ) : (
          <div className="list">
            {/* One row per season per source that covers its show. A season
                whose show has no adapter yet shows nothing here; its
                candidates can still be reviewed above once something else
                writes them. */}
            {seasons.flatMap((season) =>
              adaptersForShow(season.show.slug).map((adapter) => (
                <SeasonSourceCard
                  key={`${season.slug}:${adapter.slug}`}
                  sourceSlug={adapter.slug}
                  seasonSlug={season.slug}
                  seasonName={season.name}
                  showSlug={season.show.slug}
                  year={season.year}
                />
              )),
            )}
          </div>
        )}
      </section>

      <section className="mt-8" aria-labelledby="record-heading">
        <h2 id="record-heading" className="section-title mb-1">
          Record events
        </h2>
        <p className="mb-3 max-w-measure text-2xs leading-relaxed text-muted">
          What the results page never says — on Big Brother the Have-Nots, the Blockbuster and America&apos;s
          Favorite; on The Traitors the dagger, the seer and the Round Table showdowns; on every show the
          alliances, the blowups and the episode title. Every league on the season is rescored as soon as they
          land.
        </p>
        <RecordEvents seasons={recordableSeasons} />
      </section>

      <section className="mt-8" aria-labelledby="review-heading">
        <h2 id="review-heading" className="section-title mb-3">
          Needs review
          {candidates.length > 0 && (
            <span className="font-sans text-sm normal-case tracking-normal text-muted">
              {candidates.length}
            </span>
          )}
        </h2>
        {candidates.length === 0 ? (
          <p className="list-empty">Nothing waiting. Everything parsed cleanly.</p>
        ) : (
          <ul className="list">
            {candidates.map((candidate) => (
              <CandidateCard key={candidate.id} candidate={candidate} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-labelledby="runs-heading">
        <h2 id="runs-heading" className="eyebrow mb-3">
          Recent runs
        </h2>
        {runs.length === 0 ? (
          <p className="list-empty">No syncs have run yet.</p>
        ) : (
          <ul className="list">
            {runs.map((run) => (
              <li key={run.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {run.weeksParsed} weeks · {run.autoPublished} published
                  </span>
                  <span className="mt-0.5 block truncate text-2xs text-muted">
                    {relativeTime(run.startedAt)}
                    {run.error && ` · ${run.error}`}
                  </span>
                </span>
                <Tag tone={RUN_TONE[run.status] ?? 'ink'} size="sm">
                  {run.status.toLowerCase()}
                </Tag>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
