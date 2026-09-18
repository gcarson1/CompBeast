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
    expect(week1.evicted.map((p) => p.externalId)).toEqual(['isaiah-zae-frederich']);
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
    expect(facts.evictionOrder).toHaveLength(17);
    expect(facts.evictionOrder[0]).toMatchObject({
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

  it('flags inferred jury placement as needing review', () => {
    const jury = candidates.filter((c) => c.eventCode === 'REACHED_JURY');
    expect(jury).toHaveLength(9);
    expect(jury.every((c) => c.confidence === 'MEDIUM')).toBe(true);
    expect(jury[0].reasons[0]).toMatch(/jury size assumed/i);
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
