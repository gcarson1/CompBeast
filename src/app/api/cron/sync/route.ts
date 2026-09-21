import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { type IngestionSummary, ingestSeason } from '@/lib/ingestion/pipeline';
import { announceSeasonResults } from '@/server/league-chat';

export const dynamic = 'force-dynamic';
/** A sync fetches one page per season and recalculates every league on it; well inside this. */
export const maxDuration = 60;

/**
 * Scheduled sync — `vercel.json` calls this once a day, after the last West
 * Coast airing has been written up. It does exactly what the Sync button on
 * /admin/ingestion does, for every season that is airing and has a known
 * source, so results land on the leaderboards without anyone pressing
 * anything. Both paths are idempotent: candidates upsert on their source
 * reference, so a re-run over an unchanged page changes nothing.
 *
 * Vercel signs its cron requests with `Authorization: Bearer $CRON_SECRET`.
 * Without that variable the route refuses everything rather than accept
 * anyone's request — a sync is cheap, but it is still work this server does
 * on somebody's say-so.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not set, so the sync schedule is inert. Set it in the project environment.' },
      { status: 503 },
    );
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Published events carry a recorder. A platform admin is the honest choice —
  // it is who would have pressed the button — falling back to the oldest
  // account, which is what scripts/ingest.ts does.
  const recorder =
    (await prisma.user.findFirst({
      where: { isPlatformAdmin: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })) ?? (await prisma.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } }));
  if (!recorder) return NextResponse.json({ error: 'No users exist yet.' }, { status: 503 });

  // Airing seasons whose cast was linked from a source: that link is what
  // makes a sync possible, and its slug is the adapter to use.
  const refs = await prisma.contestantExternalRef.findMany({
    where: { contestant: { season: { status: 'ACTIVE' } } },
    select: { sourceSlug: true, contestant: { select: { season: { select: { id: true, slug: true } } } } },
  });
  const targets = new Map<string, { seasonId: string; seasonSlug: string; sourceSlug: string }>();
  for (const ref of refs) {
    const { id: seasonId, slug: seasonSlug } = ref.contestant.season;
    targets.set(`${ref.sourceSlug}:${seasonSlug}`, { seasonId, seasonSlug, sourceSlug: ref.sourceSlug });
  }

  const results: Array<
    { seasonSlug: string; sourceSlug: string; chatsPosted: number } & Partial<IngestionSummary> & {
        error?: string;
      }
  > = [];

  for (const target of targets.values()) {
    try {
      const summary = await ingestSeason({
        sourceSlug: target.sourceSlug,
        seasonExternalId: target.seasonSlug,
        recordedById: recorder.id,
      });
      // Only when something new actually reached a leaderboard — a quiet week
      // should not post the same standings to a channel again.
      const chatsPosted = summary.autoPublished > 0 ? await announceSeasonResults(target.seasonId) : 0;
      results.push({ seasonSlug: target.seasonSlug, sourceSlug: target.sourceSlug, chatsPosted, ...summary });
    } catch (error) {
      console.error(`[cron/sync] ${target.seasonSlug} failed`, error);
      results.push({
        seasonSlug: target.seasonSlug,
        sourceSlug: target.sourceSlug,
        chatsPosted: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), seasons: results });
}
