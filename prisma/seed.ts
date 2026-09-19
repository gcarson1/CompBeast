import { PrismaClient } from '@prisma/client';
import {
  BIG_BROTHER_EVENTS,
  BIG_BROTHER_LEXICON,
  BIG_BROTHER_RULESETS,
} from '../src/lib/shows/big-brother';
import { buildDraftOrder } from '../src/lib/draft/snake';
import { recalculateLeague } from '../src/lib/scoring/repository';

const prisma = new PrismaClient();

/**
 * Houseguests are fictional. Comp Beast is show-agnostic by design, and seeding
 * invented players keeps the demo data free of real people's names while still
 * exercising a realistic 16-player Big Brother season.
 */
const HOUSEGUESTS = [
  { name: 'Marisol Vega', occupation: 'ER Nurse', hometown: 'Tucson, AZ', age: 29 },
  { name: 'Desmond Park', occupation: 'Sound Engineer', hometown: 'Portland, OR', age: 34 },
  { name: 'Aaliyah Brooks', occupation: 'Law Student', hometown: 'Atlanta, GA', age: 25 },
  { name: 'Grant Whitaker', occupation: 'Ranch Hand', hometown: 'Bozeman, MT', age: 31 },
  { name: 'Priya Raman', occupation: 'Data Analyst', hometown: 'Edison, NJ', age: 27 },
  { name: 'Colton Reyes', occupation: 'Firefighter', hometown: 'San Antonio, TX', age: 33 },
  { name: 'Nina Kowalski', occupation: 'Pastry Chef', hometown: 'Chicago, IL', age: 38 },
  { name: 'Terrence Boyd', occupation: 'High School Coach', hometown: 'Mobile, AL', age: 41 },
  { name: 'Sloane Dubois', occupation: 'Flight Attendant', hometown: 'Miami, FL', age: 26 },
  { name: 'Emeka Nwosu', occupation: 'Software Tester', hometown: 'Houston, TX', age: 30 },
  { name: 'Birdie Lawson', occupation: 'Tattoo Artist', hometown: 'Nashville, TN', age: 24 },
  { name: 'Hank Delgado', occupation: 'Retired Marine', hometown: 'Barstow, CA', age: 52 },
  { name: 'Yuki Tanaka', occupation: 'Esports Coach', hometown: 'Seattle, WA', age: 23 },
  { name: 'Cassandra Hale', occupation: 'Real Estate Agent', hometown: 'Charlotte, NC', age: 36 },
  { name: 'Javier Solis', occupation: 'Line Cook', hometown: 'Albuquerque, NM', age: 28 },
  { name: 'Rowan Fitzgerald', occupation: 'Grad Student', hometown: 'Boston, MA', age: 22 },
];

const DEMO_USERS = [
  { handle: 'alicorak', name: 'Ali Corak', email: 'ali@compbeast.test' },
  { handle: 'alexdavis', name: 'Alex Davis', email: 'alex@compbeast.test' },
  { handle: 'jordanm', name: 'Jordan Mills', email: 'jordan@compbeast.test' },
  { handle: 'samrivera', name: 'Sam Rivera', email: 'sam@compbeast.test' },
];

const TEAM_NAMES = ['Block Party', 'Veto Villains', 'Backdoor Bandits', 'Jury Duty'];

const CYCLE_COUNT = 13;
const AIRED_WEEKS = 3;

/**
 * Anchored relative to today so a freshly seeded database always lands mid-
 * season: the aired weeks are in the past and the next cycle is genuinely
 * upcoming, with a roster lock that has not passed yet.
 */
const SEASON_START = (() => {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - AIRED_WEEKS * 7 + 2);
  start.setUTCHours(0, 0, 0, 0);
  return start;
})();

function cycleDates(sequence: number) {
  const airsAt = new Date(SEASON_START);
  airsAt.setUTCDate(airsAt.getUTCDate() + (sequence - 1) * 7);
  airsAt.setUTCHours(1, 0, 0, 0);
  // Rosters hard-lock 30 minutes before the episode airs.
  const locksAt = new Date(airsAt.getTime() - 30 * 60 * 1000);
  return { airsAt, locksAt };
}

async function main() {
  console.log('Seeding Comp Beast…');

  const show = await prisma.show.upsert({
    where: { slug: 'big-brother' },
    update: { lexicon: BIG_BROTHER_LEXICON },
    create: {
      slug: 'big-brother',
      name: 'Big Brother',
      format: 'TRADITIONAL_FANTASY_SPORT',
      lexicon: BIG_BROTHER_LEXICON,
    },
  });

  // --- Rule dictionary ------------------------------------------------------
  const eventDefinitions = new Map<string, string>();
  for (const spec of BIG_BROTHER_EVENTS) {
    const def = await prisma.eventDefinition.upsert({
      where: { showId_code: { showId: show.id, code: spec.code } },
      update: {
        label: spec.label,
        category: spec.category,
        points: spec.points,
        isRepeatable: spec.isRepeatable ?? true,
        isPerCycleAward: spec.isPerCycleAward ?? false,
        description: spec.description,
      },
      create: {
        showId: show.id,
        code: spec.code,
        label: spec.label,
        category: spec.category,
        points: spec.points,
        isRepeatable: spec.isRepeatable ?? true,
        isPerCycleAward: spec.isPerCycleAward ?? false,
        description: spec.description,
      },
    });
    eventDefinitions.set(spec.code, def.id);
  }
  console.log(`  ${eventDefinitions.size} event definitions`);

  const rulesets = new Map<string, string>();
  for (const spec of BIG_BROTHER_RULESETS) {
    const ruleset = await prisma.scoringRuleset.upsert({
      where: { showId_slug: { showId: show.id, slug: spec.slug } },
      update: { name: spec.name, description: spec.description, isDefault: spec.isDefault },
      create: {
        showId: show.id,
        slug: spec.slug,
        name: spec.name,
        description: spec.description,
        isDefault: spec.isDefault,
      },
    });
    rulesets.set(spec.slug, ruleset.id);

    const included = BIG_BROTHER_EVENTS.filter((e) => spec.categories.includes(e.category));
    for (const eventSpec of included) {
      const eventDefinitionId = eventDefinitions.get(eventSpec.code)!;
      const override =
        spec.useBalancedPoints && eventSpec.balancedPoints !== undefined
          ? eventSpec.balancedPoints
          : null;
      await prisma.scoringRulesetEventDefinition.upsert({
        where: {
          scoringRulesetId_eventDefinitionId: { scoringRulesetId: ruleset.id, eventDefinitionId },
        },
        update: { pointsOverride: override },
        create: { scoringRulesetId: ruleset.id, eventDefinitionId, pointsOverride: override },
      });
    }
    console.log(`  ruleset "${spec.name}" → ${included.length} rules`);
  }

  // --- Season, houseguests, cycles -----------------------------------------
  // Deliberately namespaced away from real season slugs (`big-brother-27`):
  // ingestion claims those, and demo data must never squat on a real season's
  // identifier or the two casts merge into one.
  const season = await prisma.season.upsert({
    where: { slug: 'demo-big-brother' },
    update: {},
    create: {
      showId: show.id,
      slug: 'demo-big-brother',
      name: 'Demo Season',
      year: 2026,
      status: 'ACTIVE',
      startDate: SEASON_START,
    },
  });

  const contestants = new Map<string, string>();
  for (const hg of HOUSEGUESTS) {
    const existing = await prisma.contestant.findFirst({
      where: { seasonId: season.id, name: hg.name },
      select: { id: true },
    });
    const record =
      existing ??
      (await prisma.contestant.create({
        data: {
          seasonId: season.id,
          name: hg.name,
          metadata: { occupation: hg.occupation, hometown: hg.hometown, age: hg.age },
        },
        select: { id: true },
      }));
    contestants.set(hg.name, record.id);
  }
  console.log(`  ${contestants.size} houseguests`);

  const cycles: Array<{ id: string; sequence: number }> = [];
  for (let sequence = 1; sequence <= CYCLE_COUNT; sequence += 1) {
    const { airsAt, locksAt } = cycleDates(sequence);
    const label = sequence === CYCLE_COUNT ? 'Finale' : `Week ${sequence}`;
    const cycle = await prisma.cycle.upsert({
      where: { seasonId_sequence: { seasonId: season.id, sequence } },
      update: { label, airsAt, locksAt },
      create: { seasonId: season.id, sequence, label, airsAt, locksAt, status: 'UPCOMING' },
    });
    cycles.push({ id: cycle.id, sequence });
  }
  console.log(`  ${cycles.length} cycles`);

  // --- Demo users & league --------------------------------------------------
  const users = [];
  for (const [index, spec] of DEMO_USERS.entries()) {
    // The first seeded user doubles as the platform admin so ingestion review
    // is reachable out of the box in development.
    const isPlatformAdmin = index === 0;
    const user = await prisma.user.upsert({
      where: { email: spec.email },
      update: { name: spec.name, handle: spec.handle, isPlatformAdmin },
      create: {
        authId: `seed_${spec.handle}`,
        email: spec.email,
        name: spec.name,
        handle: spec.handle,
        isPlatformAdmin,
      },
    });
    users.push(user);
  }

  const rosterSize = Math.floor(HOUSEGUESTS.length / users.length);
  const league = await prisma.league.upsert({
    where: { inviteCode: 'DEMO-BB27' },
    update: {},
    create: {
      seasonId: season.id,
      name: 'First Eviction Club',
      inviteCode: 'DEMO-BB27',
      commissionerId: users[0].id,
      isPublic: true,
      rosterSize,
      maxTeams: users.length,
      draftType: 'SNAKE',
      scoringRulesetId: rulesets.get('classic-measurable')!,
      draftStatus: 'COMPLETED',
      draftCompletedAt: new Date(),
    },
  });

  const teams = [];
  for (const [index, user] of users.entries()) {
    await prisma.leagueMember.upsert({
      where: { leagueId_userId: { leagueId: league.id, userId: user.id } },
      update: {},
      create: {
        leagueId: league.id,
        userId: user.id,
        role: index === 0 ? 'COMMISSIONER' : 'MEMBER',
        status: 'ACTIVE',
      },
    });
    const team = await prisma.team.upsert({
      where: { leagueId_ownerId: { leagueId: league.id, ownerId: user.id } },
      update: {},
      create: {
        leagueId: league.id,
        ownerId: user.id,
        name: TEAM_NAMES[index],
        draftOrderPosition: index + 1,
      },
    });
    teams.push(team);
  }

  // --- Run the snake draft --------------------------------------------------
  const existingPicks = await prisma.draftPick.count({ where: { leagueId: league.id } });
  if (existingPicks === 0) {
    const order = buildDraftOrder(
      teams.map((t) => t.id),
      rosterSize,
      'SNAKE',
    );
    const pool = [...contestants.values()];

    for (const slot of order) {
      const contestantId = pool.shift();
      if (!contestantId) break;
      await prisma.draftPick.create({
        data: {
          leagueId: league.id,
          teamId: slot.teamId,
          contestantId,
          round: slot.round,
          pickNumber: slot.pickNumber,
        },
      });
      // Fixed squads: the pick holds for every cycle of the season.
      await prisma.rosterSlot.createMany({
        data: cycles.map((cycle) => ({
          teamId: slot.teamId,
          contestantId,
          cycleId: cycle.id,
        })),
        skipDuplicates: true,
      });
    }
    console.log(`  snake draft complete — ${order.length} picks across ${teams.length} teams`);
  }

  // --- Three weeks of aired results ----------------------------------------
  const id = (name: string) => contestants.get(name)!;
  const cycleId = (sequence: number) => cycles.find((c) => c.sequence === sequence)!.id;

  type EventScript = { cycle: number; code: string; contestant: string; note?: string };
  const script: EventScript[] = [
    // Week 1
    { cycle: 1, code: 'HOH_WIN', contestant: 'Terrence Boyd', note: 'Won "Hang Tight" endurance comp' },
    { cycle: 1, code: 'NOMINATED', contestant: 'Yuki Tanaka' },
    { cycle: 1, code: 'NOMINATED', contestant: 'Birdie Lawson' },
    { cycle: 1, code: 'ON_THE_BLOCK', contestant: 'Yuki Tanaka' },
    { cycle: 1, code: 'ON_THE_BLOCK', contestant: 'Birdie Lawson' },
    { cycle: 1, code: 'VETO_WIN', contestant: 'Yuki Tanaka' },
    { cycle: 1, code: 'VETO_USED_ON_SELF', contestant: 'Yuki Tanaka' },
    { cycle: 1, code: 'REPLACEMENT_NOMINEE', contestant: 'Javier Solis' },
    { cycle: 1, code: 'ON_THE_BLOCK', contestant: 'Javier Solis' },
    { cycle: 1, code: 'SURVIVED_BLOCK', contestant: 'Birdie Lawson' },
    { cycle: 1, code: 'EVICTED', contestant: 'Javier Solis' },

    // Week 2
    { cycle: 2, code: 'HOH_WIN', contestant: 'Priya Raman', note: 'Won "Slip n Slide" comp' },
    { cycle: 2, code: 'NOMINATED', contestant: 'Hank Delgado' },
    { cycle: 2, code: 'NOMINATED', contestant: 'Cassandra Hale' },
    { cycle: 2, code: 'ON_THE_BLOCK', contestant: 'Hank Delgado' },
    { cycle: 2, code: 'ON_THE_BLOCK', contestant: 'Cassandra Hale' },
    { cycle: 2, code: 'VETO_WIN', contestant: 'Marisol Vega' },
    { cycle: 2, code: 'VETO_USED_ON_OTHER', contestant: 'Marisol Vega', note: 'Saved Cassandra' },
    { cycle: 2, code: 'REPLACEMENT_NOMINEE', contestant: 'Rowan Fitzgerald' },
    { cycle: 2, code: 'ON_THE_BLOCK', contestant: 'Rowan Fitzgerald' },
    { cycle: 2, code: 'SURVIVED_BLOCK_ZERO_VOTES', contestant: 'Hank Delgado' },
    { cycle: 2, code: 'SURVIVED_BLOCK', contestant: 'Hank Delgado' },
    { cycle: 2, code: 'EVICTED_UNANIMOUS', contestant: 'Rowan Fitzgerald' },
    { cycle: 2, code: 'EVICTED', contestant: 'Rowan Fitzgerald' },
    { cycle: 2, code: 'SPECIAL_POWER_WIN', contestant: 'Sloane Dubois', note: 'Found the Deep Freeze power' },

    // Week 3
    { cycle: 3, code: 'HOH_WIN', contestant: 'Aaliyah Brooks' },
    { cycle: 3, code: 'NOMINATED', contestant: 'Grant Whitaker' },
    { cycle: 3, code: 'NOMINATED', contestant: 'Emeka Nwosu' },
    { cycle: 3, code: 'ON_THE_BLOCK', contestant: 'Grant Whitaker' },
    { cycle: 3, code: 'ON_THE_BLOCK', contestant: 'Emeka Nwosu' },
    { cycle: 3, code: 'BLOCKBUSTER_WIN', contestant: 'Emeka Nwosu' },
    { cycle: 3, code: 'BLOCKBUSTER_FACE_VOTE_LOSS', contestant: 'Nina Kowalski' },
    { cycle: 3, code: 'VETO_WIN', contestant: 'Desmond Park' },
    { cycle: 3, code: 'SPECIAL_COMP_WIN', contestant: 'Colton Reyes', note: 'OTEV' },
    { cycle: 3, code: 'PUNISHMENT', contestant: 'Birdie Lawson', note: 'Unitard for the week' },
    { cycle: 3, code: 'SURVIVED_BLOCK', contestant: 'Emeka Nwosu' },
    { cycle: 3, code: 'EVICTED_BACKDOORED', contestant: 'Grant Whitaker' },
    { cycle: 3, code: 'EVICTED', contestant: 'Grant Whitaker' },
  ];

  const evictedByCycle: Record<number, string[]> = { 1: ['Javier Solis'], 2: ['Rowan Fitzgerald'], 3: ['Grant Whitaker'] };

  const alreadyScored = await prisma.scoredEvent.count({ where: { cycle: { seasonId: season.id } } });
  if (alreadyScored === 0) {
    // "Survive the week" is a per-cycle award: everyone still in the house at
    // the end of the cycle earns it. Generated rather than hand-listed so the
    // script stays readable and cannot drift out of sync with evictions.
    const stillIn = new Set(HOUSEGUESTS.map((h) => h.name));
    const generated: EventScript[] = [];
    for (let week = 1; week <= 3; week += 1) {
      for (const name of evictedByCycle[week] ?? []) stillIn.delete(name);
      for (const name of stillIn) generated.push({ cycle: week, code: 'WEEK_SURVIVED', contestant: name });
    }

    const allEvents = [...script, ...generated];
    for (const entry of allEvents) {
      const spec = BIG_BROTHER_EVENTS.find((e) => e.code === entry.code)!;
      const { airsAt } = cycleDates(entry.cycle);
      await prisma.scoredEvent.create({
        data: {
          contestantId: id(entry.contestant),
          eventDefinitionId: eventDefinitions.get(entry.code)!,
          cycleId: cycleId(entry.cycle),
          pointsAwarded: spec.points,
          note: entry.note,
          occurredAt: airsAt,
          recordedById: users[0].id,
        },
      });
    }
    console.log(`  ${allEvents.length} scored events across 3 aired weeks`);

    for (const [week, names] of Object.entries(evictedByCycle)) {
      for (const name of names) {
        await prisma.contestant.update({
          where: { id: id(name) },
          data: { isActive: false, eliminatedCycleId: cycleId(Number(week)) },
        });
      }
    }
  }

  for (const sequence of [1, 2, 3]) {
    await prisma.cycle.update({ where: { id: cycleId(sequence) }, data: { status: 'SCORED' } });
  }
  await prisma.cycle.update({ where: { id: cycleId(4) }, data: { status: 'UPCOMING' } });

  const snapshot = await recalculateLeague(league.id);
  console.log('\n  Standings after 3 weeks:');
  for (const team of snapshot.teams) {
    console.log(`    ${team.rank}. ${team.teamName.padEnd(20)} ${team.totalPoints} pts`);
  }

  console.log('\nSeed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
