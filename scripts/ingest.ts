/**
 * Manual ingestion trigger.
 *
 *   npx tsx scripts/ingest.ts bootstrap big-brother-27 2025
 *   npx tsx scripts/ingest.ts sync      big-brother-27
 *
 * Bootstrap creates the season, its cast, and its cycles. Sync reads the
 * results grid and publishes what it can. Both are safe to re-run.
 */
import { PrismaClient } from '@prisma/client';
import { bootstrapSeasonFromSource, ingestSeason } from '../src/lib/ingestion/pipeline';

const prisma = new PrismaClient();
const SOURCE = 'big-brother-junkies';

async function main() {
  const [command, seasonExternalId, yearArg] = process.argv.slice(2);

  if (!command || !seasonExternalId) {
    console.error('usage: ingest.ts <bootstrap|sync> <season-slug> [year]');
    process.exit(1);
  }

  const admin = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!admin) throw new Error('No users exist — run `npm run db:seed` first.');

  if (command === 'bootstrap') {
    const result = await bootstrapSeasonFromSource({
      sourceSlug: SOURCE,
      seasonExternalId,
      showSlug: 'big-brother',
      year: Number(yearArg ?? new Date().getFullYear()),
    });
    console.log('Bootstrap complete:', result);
    return;
  }

  if (command === 'sync') {
    const result = await ingestSeason({
      sourceSlug: SOURCE,
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
