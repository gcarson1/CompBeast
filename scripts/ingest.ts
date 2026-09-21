/**
 * Manual ingestion trigger.
 *
 *   npx tsx scripts/ingest.ts bootstrap big-brother-27 2025
 *   npx tsx scripts/ingest.ts sync      big-brother-27
 *   npx tsx scripts/ingest.ts sync      survivor-50 --source=<adapter-slug>
 *
 * Bootstrap creates the season, its cast, and its cycles. Sync reads the
 * results grid and publishes what it can. Both are safe to re-run. The
 * source defaults to Big Brother Junkies; the show is whatever that source
 * declares it covers, so a season can never be bootstrapped under the wrong
 * show by hand.
 */
import { PrismaClient } from '@prisma/client';
import { bootstrapSeasonFromSource, getAdapter, ingestSeason } from '../src/lib/ingestion/pipeline';

const prisma = new PrismaClient();
const DEFAULT_SOURCE = 'big-brother-junkies';

async function main() {
  const args = process.argv.slice(2);
  const sourceSlug = args.find((a) => a.startsWith('--source='))?.slice('--source='.length) ?? DEFAULT_SOURCE;
  const [command, seasonExternalId, yearArg] = args.filter((a) => !a.startsWith('--'));

  if (!command || !seasonExternalId) {
    console.error('usage: ingest.ts <bootstrap|sync> <season-slug> [year] [--source=<adapter-slug>]');
    process.exit(1);
  }

  const adapter = getAdapter(sourceSlug);

  const admin = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!admin) throw new Error('No users exist — run `npm run db:seed` first.');

  if (command === 'bootstrap') {
    const result = await bootstrapSeasonFromSource({
      sourceSlug,
      seasonExternalId,
      showSlug: adapter.showSlug,
      year: Number(yearArg ?? new Date().getFullYear()),
    });
    console.log('Bootstrap complete:', result);
    return;
  }

  if (command === 'sync') {
    const result = await ingestSeason({
      sourceSlug,
      seasonExternalId,
      recordedById: admin.id,
    });
    console.log('Sync complete:', result);
    return;
  }

  console.error(`Unknown command "${command}"`);
  process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
