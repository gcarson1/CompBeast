import Link from 'next/link';
import { CandidateCard, SeasonSourceCard, type PendingCandidate } from '@/components/IngestionReview';
import { StatStrip } from '@/components/StatStrip';
import { Sticker } from '@/components/Sticker';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { relativeTime } from '@/lib/ui';

export const dynamic = 'force-dynamic';

// Sync and bootstrap both fetch and parse a full season off the source before
// writing. That comfortably outruns the default serverless budget on a cold
// start, and the failure mode is a half-written season, so buy the headroom.
export const maxDuration = 60;

// Sticker tones per run status. EMPTY is the "a parser silently broke"
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
        <div className="card mt-6 p-6">
          <h1 className="headline text-2xl">Admins only</h1>
          <p className="mt-2 max-w-measure text-xs text-muted">
            Ingestion review rewrites scores across every league on a season.
          </p>
        </div>
      </div>
    );
  }

  const [pending, runs, seasons, counts] = await Promise.all([
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
        season: { select: { show: { select: { id: true } } } },
      },
    }),
    prisma.ingestionRun.findMany({ orderBy: { startedAt: 'desc' }, take: 5 }),
    prisma.season.findMany({
      where: { contestants: { some: { externalRefs: { some: {} } } } },
      select: { slug: true, name: true, year: true, show: { select: { slug: true } } },
    }),
    prisma.ingestedEventCandidate.groupBy({ by: ['status'], _count: true }),
  ]);

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
      points: definition ? Number(definition.points) : null,
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
          <p className="card p-4 text-xs text-muted">
            No season has been bootstrapped yet. Run{' '}
            <code className="text-2xs">npx tsx scripts/ingest.ts bootstrap &lt;slug&gt;</code> first.
          </p>
        ) : (
          <div className="space-y-2">
            {seasons.map((season) => (
              <SeasonSourceCard
                key={season.slug}
                sourceSlug="big-brother-junkies"
                seasonSlug={season.slug}
                seasonName={season.name}
                showSlug={season.show.slug}
                year={season.year}
              />
            ))}
          </div>
        )}
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
          <p className="card p-4 text-xs text-muted">Nothing waiting. Everything parsed cleanly.</p>
        ) : (
          <ul className="space-y-3">
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
          <p className="card p-4 text-xs text-muted">No syncs have run yet.</p>
        ) : (
          <ul className="card divide-y divide-hairline">
            {runs.map((run) => (
              <li key={run.id} className="flex items-center justify-between gap-3 p-4">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {run.weeksParsed} weeks · {run.autoPublished} published
                  </span>
                  <span className="mt-0.5 block truncate text-2xs text-muted">
                    {relativeTime(run.startedAt)}
                    {run.error && ` · ${run.error}`}
                  </span>
                </span>
                <Sticker tone={RUN_TONE[run.status] ?? 'ink'} size="sm" className="shrink-0">
                  {run.status.toLowerCase()}
                </Sticker>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
