import { describe, expect, it } from 'vitest';
import { parseStoredHistory, playedHistory } from './career';

const line = (sequence: number, status: string, cumulative: number, rank: number | null = null) => ({
  cyclePoints: sequence * 10,
  cumulativePoints: cumulative,
  rank,
  cycle: { label: `Week ${sequence}`, sequence, status },
});

describe('playedHistory', () => {
  it('orders by week and stops at the last cycle that has happened', () => {
    const history = playedHistory([
      line(3, 'UPCOMING', 30),
      line(1, 'SCORED', 10, 2),
      line(4, 'UPCOMING', 30),
      line(2, 'LIVE', 30, 1),
    ]);
    expect(history.map((p) => p.sequence)).toEqual([1, 2]);
    expect(history.at(-1)).toMatchObject({ cumulativePoints: 30, rank: 1 });
  });

  it('is empty before anything has aired', () => {
    expect(playedHistory([line(1, 'UPCOMING', 0), line(2, 'UPCOMING', 0)])).toEqual([]);
    expect(playedHistory([])).toEqual([]);
  });

  it('reads Decimal-like values as numbers', () => {
    const [point] = playedHistory([
      { cyclePoints: { toString: () => '7.50' }, cumulativePoints: { toString: () => '7.50' }, rank: null, cycle: { label: 'Week 1', sequence: 1, status: 'SCORED' } },
    ]);
    expect(point).toMatchObject({ cyclePoints: 7.5, cumulativePoints: 7.5 });
  });
});

describe('parseStoredHistory', () => {
  it('round-trips what playedHistory wrote', () => {
    const written = playedHistory([line(1, 'SCORED', 10, 3), line(2, 'SCORED', 25, 1)]);
    expect(parseStoredHistory(JSON.parse(JSON.stringify(written)))).toEqual(written);
  });

  it('drops anything that is not a history point instead of throwing', () => {
    expect(parseStoredHistory(null)).toEqual([]);
    expect(parseStoredHistory('nope')).toEqual([]);
    expect(parseStoredHistory([{ label: 'Week 1' }, 42, { label: 'Week 2', sequence: 2 }])).toEqual([
      { label: 'Week 2', sequence: 2, cyclePoints: 0, cumulativePoints: 0, rank: null },
    ]);
  });
});
