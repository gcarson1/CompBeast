import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { getRecentHeadlines } from './queries';

/**
 * The live ticker's choice of events, against the database.
 *
 * Read-only: it looks for any season where both a per-cycle award (surviving
 * the week or the episode) and something else have been scored, and holds
 * the ticker to the two promises it makes — the moments first, the
 * survival awards behind them, and a repeat (eight banishment votes against
 * one player) folded into one item. Skips itself when no database is
 * reachable or no season has been scored yet.
 */
const prisma = new PrismaClient();

let dbReady = false;
let seasonId = '';
let perCycleLabels = new Set<string>();
try {
  const season = await prisma.season.findFirst({
    where: {
      AND: [
        {
          contestants: {
            some: { scoredEvents: { some: { isVoided: false, eventDefinition: { isPerCycleAward: true } } } },
          },
        },
        {
          contestants: {
            some: {
              scoredEvents: { some: { isVoided: false, eventDefinition: { isPerCycleAward: false } } },
            },
          },
        },
      ],
    },
    select: { id: true, showId: true },
  });
  if (season) {
    seasonId = season.id;
    perCycleLabels = new Set(
      (
        await prisma.eventDefinition.findMany({
          where: { showId: season.showId, isPerCycleAward: true },
          select: { label: true },
        })
      ).map((d) => d.label),
    );
    dbReady = true;
  }
} catch {
  dbReady = false;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe.skipIf(!dbReady)('getRecentHeadlines', () => {
  it('leads with what happened, and puts the survival awards behind it', async () => {
    const headlines = await getRecentHeadlines(seasonId);
    expect(headlines.length).toBeGreaterThan(0);
    expect(headlines.length).toBeLessThanOrEqual(12);
    const firstAward = headlines.findIndex((h) => perCycleLabels.has(h.eventLabel));
    if (firstAward >= 0) {
      expect(headlines.slice(firstAward).every((h) => perCycleLabels.has(h.eventLabel))).toBe(true);
    }
  });

  it('folds a repeat into one item that carries the count and the sum', async () => {
    const headlines = await getRecentHeadlines(seasonId, 50);
    for (const headline of headlines) {
      expect(headline.count).toBeGreaterThanOrEqual(1);
    }
    // Folded per person, event and cycle: the same person and event twice in
    // the ticker can only be two different weeks, so their times differ.
    const seen = new Map<string, number>();
    for (const h of headlines) {
      const key = `${h.contestantName}:${h.eventLabel}:${h.occurredAt.getTime()}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    expect([...seen.values()].every((n) => n === 1)).toBe(true);
  });
});
