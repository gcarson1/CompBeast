import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bigBrotherJunkiesAdapter } from './sources/big-brother-junkies';
import { mapBigBrotherSeason } from './mappers/big-brother';
import { IngestionError } from './types';

/**
 * Parsed against a saved copy of the real page. Tests never hit the network —
 * a scraper suite that depends on a live third-party site fails for reasons
 * that have nothing to do with our code.
 */
const fixture = readFileSync(join(__dirname, '__fixtures__', 'bbj-season-27.html'), 'utf8');
const facts = bigBrotherJunkiesAdapter.parseSeason(fixture, 'https://example.test/bb27');

describe('bigBrotherJunkiesAdapter.parseSeason', () => {
  it('reads the season label from the page heading', () => {
    expect(facts.seasonLabel).toBe('Big Brother 27');
  });

  it('parses every week of the season', () => {
    expect(facts.weeks).toHaveLength(15);
    expect(facts.weeks.map((w) => w.weekNumber)).toEqual([...Array(15)].map((_, i) => i + 1));
  });

  it('extracts the full grid for a known week', () => {
    const week1 = facts.weeks.find((w) => w.weekNumber === 1)!;
    expect(week1.hoh.map((p) => p.name)).toEqual(['Vince Panaro']);
    expect(week1.veto.map((p) => p.name)).toEqual(['Ashley Hollis']);
    expect(week1.nominees).toHaveLength(3);
    expect(week1.eliminated.map((p) => p.externalId)).toEqual(['isaiah-zae-frederich']);
  });

  it('identifies players by source slug rather than display name', () => {
    const week1 = facts.weeks.find((w) => w.weekNumber === 1)!;
    expect(week1.hoh[0]).toEqual({ externalId: 'vince-panaro', name: 'Vince Panaro' });
  });

  it('handles weeks where a column is empty', () => {
    const finale = facts.weeks.find((w) => w.weekNumber === 15)!;
    expect(finale.veto).toEqual([]);
    expect(finale.hoh).toHaveLength(1);
  });

  it('parses the full cast with status tags', () => {
    expect(facts.cast).toHaveLength(17);
    const winner = facts.cast.find((c) => c.externalId === 'ashley-hollis')!;
    expect(winner.name).toBe('Ashley Hollis');
    expect(winner.statusLabel).toBe('Winner');
  });

  it('parses the eviction order with placements', () => {
    expect(facts.placements).toHaveLength(17);
    expect(facts.placements[0]).toMatchObject({
      order: 1,
      placeLabel: 'Winner',
      player: { externalId: 'ashley-hollis' },
    });
  });

  it('throws rather than silently returning nothing when the layout changes', () => {
    expect(() =>
      bigBrotherJunkiesAdapter.parseSeason('<html><body><h1>Nope</h1></body></html>', 'x'),
    ).toThrow(IngestionError);
  });
});

/**
 * BB28 was mid-season when captured. A live season exercises paths a finished
 * one never reaches: unaired weeks, houseguests with no finish position, and an
 * eviction table ordered from the most recent eviction instead of the winner.
 */
const liveFixture = readFileSync(join(__dirname, '__fixtures__', 'bbj-season-28.html'), 'utf8');
const liveFacts = bigBrotherJunkiesAdapter.parseSeason(liveFixture, 'https://example.test/bb28');

describe('in-progress season', () => {
  it('parses premiere and finale dates', () => {
    expect(liveFacts.premiereDate?.getFullYear()).toBe(2026);
    expect(liveFacts.finaleDate?.getMonth()).toBe(9); // October
  });

  it('has no winner while the season is running', () => {
    expect(liveFacts.placements.some((e) => /winner/i.test(e.placeLabel))).toBe(false);
  });

  it('records a null order for houseguests still in the house', () => {
    const active = liveFacts.placements.filter((e) => e.order === null);
    expect(active).toHaveLength(5);
    expect(active.every((e) => Number.isNaN(e.order as unknown as number))).toBe(false);
  });

  it('does not score weeks that have not aired', () => {
    const scheduled = liveFacts.weeks.at(-1)!;
    expect(scheduled.hoh).toEqual([]);
    expect(scheduled.eliminated).toEqual([]);
    expect(scheduled.aired).toBe(false);

    const candidates = mapBigBrotherSeason(liveFacts, 'big-brother-28');
    expect(candidates.some((c) => c.weekNumber === scheduled.weekNumber)).toBe(false);
  });

  it('counts only houseguests who have actually reached jury so far', () => {
    const candidates = mapBigBrotherSeason(liveFacts, 'big-brother-28');
    const jury = candidates.filter((c) => c.eventCode === 'REACHED_JURY');

    // Four have been jury-evicted; nobody else has placed yet.
    expect(jury).toHaveLength(4);
    expect(jury.every((c) => c.confidence === 'HIGH')).toBe(true);

    // Houseguests still in the house have no placement, so they cannot yet
    // qualify — a row-order threshold would have swept them in.
    const activeIds = liveFacts.cast
      .filter((c) => c.statusLabel?.toLowerCase() === 'active')
      .map((c) => c.externalId);
    expect(jury.some((c) => activeIds.includes(c.player.externalId))).toBe(false);
  });

  it('awards no placement points before anyone has placed', () => {
    const candidates = mapBigBrotherSeason(liveFacts, 'big-brother-28');
    expect(candidates.some((c) => c.eventCode.startsWith('PLACEMENT_'))).toBe(false);
  });

  it('still credits survival only through the last aired week', () => {
    const candidates = mapBigBrotherSeason(liveFacts, 'big-brother-28');
    const weeks = new Set(candidates.filter((c) => c.eventCode === 'WEEK_SURVIVED').map((c) => c.weekNumber));
    expect(weeks.has(12)).toBe(true);
    expect(weeks.has(13)).toBe(false);
  });
});

describe('mapBigBrotherSeason', () => {
  const candidates = mapBigBrotherSeason(facts, 'big-brother-27');

  const forWeek = (week: number, code: string) =>
    candidates.filter((c) => c.weekNumber === week && c.eventCode === code);

  it('maps a clean HOH win at high confidence', () => {
    const [hoh] = forWeek(1, 'HOH_WIN');
    expect(hoh.player.externalId).toBe('vince-panaro');
    expect(hoh.confidence).toBe('HIGH');
    expect(hoh.reasons).toEqual([]);
  });

  it('emits both NOMINATED and ON_THE_BLOCK for each nominee', () => {
    expect(forWeek(1, 'NOMINATED')).toHaveLength(3);
    expect(forWeek(1, 'ON_THE_BLOCK')).toHaveLength(3);
  });

  it('credits nominees who were not evicted with surviving the block', () => {
    const survivors = forWeek(1, 'SURVIVED_BLOCK').map((c) => c.player.externalId);
    expect(survivors).toHaveLength(2);
    expect(survivors).not.toContain('isaiah-zae-frederich');
  });

  it('awards weekly survival only to houseguests still in the house', () => {
    const week1 = forWeek(1, 'WEEK_SURVIVED').map((c) => c.player.externalId);
    expect(week1).toHaveLength(16); // 17 cast, one evicted
    expect(week1).not.toContain('isaiah-zae-frederich');

    const week2 = forWeek(2, 'WEEK_SURVIVED');
    expect(week2).toHaveLength(15);
  });

  it('maps final placements from the eviction order', () => {
    const winner = candidates.find((c) => c.eventCode === 'PLACEMENT_WINNER')!;
    expect(winner.player.externalId).toBe('ashley-hollis');
    expect(candidates.filter((c) => c.eventCode === 'PLACEMENT_RUNNER_UP')).toHaveLength(1);
    expect(candidates.filter((c) => c.eventCode === 'PLACEMENT_THIRD')).toHaveLength(1);
  });

  it('derives the full jury cohort from the boundary, not the status tag', () => {
    const jury = candidates.filter((c) => c.eventCode === 'REACHED_JURY');
    const names = jury.map((c) => c.player.name);

    // Nine made jury: the final three plus the six tagged as jury.
    expect(jury).toHaveLength(9);
    expect(names).toContain('Ashley Hollis'); // winner, tagged "Winner"
    expect(names).toContain('Rachel Reilly'); // 9th, the jury boundary
    // Tagged "AFP" rather than "Jury", but finished 5th and was on the jury.
    expect(names).toContain('Keanu Soto');
    // Evicted pre-jury.
    expect(names).not.toContain('Mickey Lee');
  });

  it('never infers events the source cannot support', () => {
    const codes = new Set(candidates.map((c) => c.eventCode));
    expect(codes.has('VETO_USED_ON_SELF')).toBe(false);
    expect(codes.has('EVICTED_UNANIMOUS')).toBe(false);
    expect(codes.has('ALLIANCE_FORMED')).toBe(false);
    expect(codes.has('CRIED')).toBe(false);
  });

  it('gives every candidate a stable, unique dedupe key', () => {
    const refs = candidates.map((c) => c.sourceRef);
    expect(new Set(refs).size).toBe(refs.length);
    expect(refs[0]).toMatch(/^big-brother-27:w\d+:[A-Z_]+:[a-z-]+$/);
  });

  it('produces the same keys on a re-parse, so re-syncing cannot duplicate', () => {
    const again = mapBigBrotherSeason(
      bigBrotherJunkiesAdapter.parseSeason(fixture, 'https://example.test/bb27'),
      'big-brother-27',
    );
    expect(again.map((c) => c.sourceRef)).toEqual(candidates.map((c) => c.sourceRef));
  });
});
