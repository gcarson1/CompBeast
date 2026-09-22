/**
 * Bootstraps and syncs the seasons a deployment names, from their sources.
 *
 *   BOOTSTRAP_SEASONS="wikipedia-survivor:survivor-51:2026,big-brother-junkies:big-brother-28:2026"
 *   npx tsx scripts/bootstrap-seasons.ts
 *
 * Runs in the build after `install-shows`, which is how a new season reaches
 * a deployed database without anyone pointing a shell at it. Both steps are
 * idempotent, so a rebuild refreshes the cast and schedule and publishes
 * whatever has aired since; the daily cron does the same thereafter.
 *
 * A source being unreachable must not fail a deploy: each season is tried
 * on its own, failures are logged, and the script exits cleanly regardless.
 * With the variable unset it does nothing, so a preview build costs nothing.
 */
import { PrismaClient } from '@prisma/client';
import { bootstrapSeasonFromSource, getAdapter, ingestSeason } from '../src/lib/ingestion/pipeline';

const prisma = new PrismaClient();

async function main() {
  const list = (process.env.BOOTSTRAP_SEASONS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (list.length === 0) {
    console.log('BOOTSTRAP_SEASONS is unset; nothing to bootstrap.');
    return;
  }

  // Ingestion needs someone to record events as. A platform admin is the
  // honest choice; the oldest account is the fallback, as in the cron.
  const recorder =
    (await prisma.user.findFirst({ where: { isPlatformAdmin: true }, orderBy: { createdAt: 'asc' } })) ??
    (await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } }));

  for (const entry of list) {
    const [sourceSlug, seasonExternalId, yearText] = entry.split(':');
    const year = Number.parseInt(yearText ?? '', 10);
    if (!sourceSlug || !seasonExternalId || !Number.isFinite(year)) {
      console.error(`  skip "${entry}": expected source:season-slug:year`);
      continue;
    }
    try {
      const adapter = getAdapter(sourceSlug);
      const result = await bootstrapSeasonFromSource({
        sourceSlug,
        seasonExternalId,
        showSlug: adapter.showSlug,
        year,
      });
      console.log(
        `  ${seasonExternalId}: ${result.contestantsCreated} new, ${result.cyclesCreated} cycles created`,
      );
      if (recorder) {
        const sync = await ingestSeason({ sourceSlug, seasonExternalId, recordedById: recorder.id });
        console.log(`  ${seasonExternalId}: sync ${sync.status}, ${sync.autoPublished} published`);
      }
    } catch (error) {
      console.error(`  ${seasonExternalId} failed:`, error instanceof Error ? error.message : error);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
  })
  .finally(() => prisma.$disconnect());
