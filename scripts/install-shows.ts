/**
 * Installs every show in the catalogue — rows, rule dictionaries, rulesets —
 * and nothing else.
 *
 *   npx tsx scripts/install-shows.ts
 *
 * The seed does the same and then adds demo seasons, users and a league;
 * this is for a deployed database, which must get the shows and none of
 * that. Idempotent: re-running refreshes labels and point values only.
 */
import { PrismaClient } from '@prisma/client';
import { SHOW_CATALOGUE } from '../src/lib/shows/catalogue';
import { installShow } from '../src/lib/shows/install';

const prisma = new PrismaClient();

async function main() {
  for (const spec of SHOW_CATALOGUE) await installShow(prisma, spec);
  console.log(`Installed ${SHOW_CATALOGUE.length} shows.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
