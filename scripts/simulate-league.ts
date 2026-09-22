/**
 * Plays a whole league over a finished season, through the real draft and
 * scoring code, and prints the standings week by week.
 *
 *   npx tsx scripts/simulate-league.ts survivor-50
 *   npx tsx scripts/simulate-league.ts big-brother-27 --ruleset=balanced-measurable --seed=7 --keep
 *
 * This is how a scoring model gets checked against a season people have
 * actually watched: draft four teams blind (a seeded shuffle stands in for
 * the room's opinions), score every episode, and read whether the standings
 * moved for the right reasons. The league is deleted afterwards unless
 * --keep is passed, so a finished season stays the archive it should be.
 * Needs the seeded demo users.
 */
import { PrismaClient } from '@prisma/client';
import { recalculateLeague } from '../src/lib/scoring/repository';
import { createLeague, joinLeague, makeDraftPick, startDraft } from '../src/server/mutations';

const prisma = new PrismaClient();
const TEAMS = ['Torch Snuffers', 'Idol Hoarders', 'Merge Boots', 'Fire Makers'];
const ROSTER = 4;

async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith('--'));
  if (!slug)
    throw new Error('usage: simulate-league.ts <season-slug> [--ruleset=<slug>] [--seed=<n>] [--keep]');
  const rulesetSlug = args.find((a) => a.startsWith('--ruleset='))?.slice(10) ?? 'classic-measurable';
  const seed = Number.parseInt(args.find((a) => a.startsWith('--seed='))?.slice(7) ?? '50', 10);
  const keep = args.includes('--keep');

  const season = await prisma.season.findUniqueOrThrow({
    where: { slug },
    select: { id: true, name: true, status: true, showId: true },
  });
  const ruleset = await prisma.scoringRuleset.findFirstOrThrow({
    where: { showId: season.showId, slug: rulesetSlug },
    select: { id: true, name: true },
  });
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@compbeast.test' } },
    orderBy: { createdAt: 'asc' },
    take: TEAMS.length,
  });
  if (users.length < TEAMS.length) throw new Error(`Need ${TEAMS.length} demo users — run npm run db:seed.`);

  // A finished season cannot host a league, by design; it is briefly in
  // play for the simulation and restored whatever happens.
  await prisma.season.update({ where: { id: season.id }, data: { status: 'ACTIVE' } });
  let leagueId: string | null = null;
  try {
    const league = await createLeague(users[0].id, {
      name: `Simulation · ${season.name}`,
      seasonId: season.id,
      scoringRulesetId: ruleset.id,
      rosterSize: ROSTER,
      maxTeams: TEAMS.length,
      isPublic: false,
      teamName: TEAMS[0],
    });
    leagueId = league.id;
    const { inviteCode } = await prisma.league.findUniqueOrThrow({
      where: { id: league.id },
      select: { inviteCode: true },
    });
    for (let i = 1; i < TEAMS.length; i += 1) await joinLeague(users[i].id, inviteCode, TEAMS[i]);
    await startDraft(league.id, users[0].id);

    const cast = await prisma.contestant.findMany({ where: { seasonId: season.id }, select: { id: true } });
    let s = seed >>> 0;
    const random = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
    const pool = [...cast];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const teams = await prisma.team.findMany({
      where: { leagueId: league.id },
      orderBy: { draftOrderPosition: 'asc' },
      select: { id: true, ownerId: true, name: true },
    });
    let pick = 0;
    for (let round = 0; round < ROSTER; round += 1) {
      const order = round % 2 === 0 ? teams : [...teams].reverse();
      for (const team of order) {
        await makeDraftPick({
          leagueId: league.id,
          teamId: team.id,
          contestantId: pool[pick].id,
          userId: team.ownerId,
        });
        pick += 1;
      }
    }

    const snapshot = await recalculateLeague(league.id);
    console.log(`\n${season.name} · ${ruleset.name} · seed ${seed}\n`);
    for (const team of snapshot.teams) {
      const roster = team.contestants.map((c) => `${c.contestantId.slice(-4)}:${c.points}`).join(' ');
      console.log(
        `#${team.rank} ${team.teamName.padEnd(15)} ${String(team.totalPoints).padStart(5)}   ${roster}`,
      );
    }
    const cycles = [...new Set(snapshot.teams.flatMap((t) => t.cycles.map((c) => c.sequence)))].sort(
      (a, b) => a - b,
    );
    console.log('\nweek by week (points that week, leader in caps):');
    for (const sequence of cycles) {
      const line = snapshot.teams.map((t) => ({
        name: t.teamName.split(' ')[0],
        points: t.cycles.find((c) => c.sequence === sequence)?.points ?? 0,
        cumulative: t.cycles.filter((c) => c.sequence <= sequence).reduce((sum, c) => sum + c.points, 0),
      }));
      const lead = Math.max(...line.map((l) => l.cumulative));
      console.log(
        `${String(sequence).padStart(2)}  ${line
          .map((l) => `${l.cumulative === lead ? l.name.toUpperCase() : l.name} ${l.points}`)
          .join('   ')}`,
      );
    }
    if (keep) console.log(`\nLeague kept: ${league.id}`);
  } finally {
    if (leagueId && !keep) await prisma.league.delete({ where: { id: leagueId } });
    await prisma.season.update({ where: { id: season.id }, data: { status: season.status } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
