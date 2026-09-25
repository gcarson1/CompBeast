/**
 * Checks every league's standings against the ledger, and prints them.
 *
 *   npx tsx scripts/audit-scores.ts
 *
 * Runs in the build after the seasons are synced, so every deploy leaves the
 * standings of every league in the build log, and a loud line for anything
 * that does not add up. For each league it:
 *
 *   1. puts every drafted player on their team's roster for every cycle — a
 *      cycle the source listed after the draft has no rosters until then;
 *   2. rebuilds the stored standings from the ledger; and
 *   3. checks them a second way that shares no code with the scoring engine.
 *      Nothing moves a player between teams after the draft, so a team's
 *      total is the sum, over the players it drafted, of their unvoided
 *      events that the league's ruleset scores — at the ruleset's own value
 *      where it sets one, else the value recorded.
 *
 * It also holds the ledger to the two mistakes this project has shipped: a
 * once-a-season award held twice (a jury paid every week), and a survival
 * award in the cycle its holder left (a mid-week sync paying the evictee).
 *
 * Never fails the build: problems are printed, not thrown.
 */
import { prisma } from '../src/lib/db';
import { ensureRosterSlots, recalculateLeague } from '../src/lib/scoring/repository';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function main() {
  // Every season with a ledger, not only those with leagues: the public
  // player pages and season scoreboards read the ledger too.
  const seasons = await prisma.season.findMany({
    where: { OR: [{ leagues: { some: {} } }, { cycles: { some: { scoredEvents: { some: {} } } } }] },
    select: { id: true, slug: true },
    orderBy: { slug: 'asc' },
  });
  let problems = 0;
  const flag = (line: string) => {
    problems += 1;
    console.log(`  ! ${line}`);
  };

  for (const season of seasons) {
    const slotsAdded = await ensureRosterSlots(season.id);
    console.log(`${season.slug}${slotsAdded > 0 ? ` — ${slotsAdded} missing roster slots filled` : ''}`);

    const events = await prisma.scoredEvent.findMany({
      where: { isVoided: false, cycle: { seasonId: season.id } },
      select: {
        contestantId: true,
        eventDefinitionId: true,
        cycleId: true,
        pointsAwarded: true,
        cycle: { select: { label: true } },
        eventDefinition: { select: { code: true, isRepeatable: true, isPerCycleAward: true } },
        contestant: { select: { name: true, eliminatedCycleId: true } },
      },
    });

    const held = new Map<string, number>();
    for (const event of events) {
      const { code, isRepeatable, isPerCycleAward } = event.eventDefinition;
      if (!isRepeatable) {
        const key = `${event.contestant.name}: ${code}`;
        held.set(key, (held.get(key) ?? 0) + 1);
      }
      const survival = isPerCycleAward || code === 'SURVIVED_BLOCK';
      if (survival && event.cycleId === event.contestant.eliminatedCycleId) {
        flag(`${event.contestant.name} holds ${code} in ${event.cycle.label}, the cycle they left`);
      }
    }
    for (const [key, count] of held) if (count > 1) flag(`${key} is held ${count} times`);

    const leagues = await prisma.league.findMany({
      where: { seasonId: season.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        scoringRuleset: {
          select: {
            name: true,
            eventDefinitions: { select: { eventDefinitionId: true, pointsOverride: true } },
          },
        },
        teams: { select: { id: true, name: true, draftPicks: { select: { contestantId: true } } } },
      },
    });

    for (const league of leagues) {
      const drafted = league.teams.some((team) => team.draftPicks.length > 0);
      const label = `${league.name} (${league.scoringRuleset.name}, ${league.teams.length} teams)`;
      if (!drafted) {
        console.log(`  ${label}: not drafted`);
        continue;
      }
      await recalculateLeague(league.id);

      const rules = new Map(
        league.scoringRuleset.eventDefinitions.map((link) => [
          link.eventDefinitionId,
          link.pointsOverride === null ? null : Number(link.pointsOverride),
        ]),
      );
      const byContestant = new Map<string, number>();
      for (const event of events) {
        if (!rules.has(event.eventDefinitionId)) continue;
        const value = rules.get(event.eventDefinitionId) ?? Number(event.pointsAwarded);
        byContestant.set(event.contestantId, round2((byContestant.get(event.contestantId) ?? 0) + value));
      }

      const stored = await prisma.teamCycleScore.findMany({
        where: { team: { leagueId: league.id } },
        select: { teamId: true, cumulativePoints: true, cycle: { select: { sequence: true } } },
      });
      const latest = new Map<string, { sequence: number; points: number }>();
      for (const row of stored) {
        const current = latest.get(row.teamId);
        if (!current || row.cycle.sequence > current.sequence) {
          latest.set(row.teamId, { sequence: row.cycle.sequence, points: Number(row.cumulativePoints) });
        }
      }

      const standings = league.teams
        .map((team) => ({
          name: team.name,
          expected: round2(
            team.draftPicks.reduce((sum, pick) => sum + (byContestant.get(pick.contestantId) ?? 0), 0),
          ),
          stored: latest.get(team.id)?.points ?? 0,
        }))
        .sort((a, b) => b.expected - a.expected);

      const wrong = standings.filter((team) => Math.abs(team.expected - team.stored) > 0.001);
      console.log(
        `  ${label}: ${wrong.length === 0 ? 'ok' : 'MISMATCH'} — ${standings
          .map((team) => `${team.name} ${team.stored}`)
          .join(' · ')}`,
      );
      for (const team of wrong)
        flag(`${league.name} / ${team.name}: stored ${team.stored}, ledger says ${team.expected}`);
    }
  }

  console.log(
    problems === 0 ? 'Scoring audit: every league adds up.' : `Scoring audit: ${problems} problem(s).`,
  );
}

main()
  .catch((error) => {
    console.error('Scoring audit could not run:', error instanceof Error ? error.message : error);
  })
  .finally(() => prisma.$disconnect());
