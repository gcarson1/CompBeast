/**
 * The shape of a career: what a team did, week by week, reduced to the part
 * that has actually happened.
 *
 * Pure and Prisma-free so the account page and the league-deletion snapshot
 * reduce a team's `TeamCycleScore` rows the same way. If those two disagreed,
 * a season would change shape the moment its league was closed.
 */

export interface PointHistoryPoint {
  label: string;
  sequence: number;
  cyclePoints: number;
  cumulativePoints: number;
  rank: number | null;
}

/** A `TeamCycleScore` row with the cycle fields the reduction needs. Decimals arrive as Prisma's Decimal. */
export interface ScoreLine {
  cyclePoints: { toString(): string } | number;
  cumulativePoints: { toString(): string } | number;
  rank: number | null;
  cycle: { label: string; sequence: number; status: string };
}

/**
 * Orders a team's score rows by week and cuts the series at the last cycle
 * that has actually happened. Cumulative totals carry forward through
 * unscored weeks, so keeping them would draw a long flat tail into the
 * future and read as a team that stopped scoring rather than a season still
 * being played.
 */
export function playedHistory(scores: ScoreLine[]): PointHistoryPoint[] {
  const ordered = [...scores].sort((a, b) => a.cycle.sequence - b.cycle.sequence);

  let lastPlayed = -1;
  ordered.forEach((score, index) => {
    if (score.cycle.status !== 'UPCOMING') lastPlayed = index;
  });

  return ordered.slice(0, lastPlayed + 1).map((score) => ({
    label: score.cycle.label,
    sequence: score.cycle.sequence,
    cyclePoints: Number(score.cyclePoints),
    cumulativePoints: Number(score.cumulativePoints),
    rank: score.rank,
  }));
}

/**
 * Reads a stored career-record `history` back into typed points. Written by
 * this module's own `playedHistory`, so the shape is known; the guard is for
 * a hand-edited row, which should lose its chart rather than crash the page.
 */
export function parseStoredHistory(value: unknown): PointHistoryPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((point) => {
    if (typeof point !== 'object' || point === null) return [];
    const p = point as Record<string, unknown>;
    if (typeof p.label !== 'string' || typeof p.sequence !== 'number') return [];
    return [
      {
        label: p.label,
        sequence: p.sequence,
        cyclePoints: Number(p.cyclePoints ?? 0),
        cumulativePoints: Number(p.cumulativePoints ?? 0),
        rank: typeof p.rank === 'number' ? p.rank : null,
      },
    ];
  });
}
