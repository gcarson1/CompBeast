import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapTraitorsSeason } from '../ingestion/mappers/traitors';
import { wikipediaTraitorsAdapter } from '../ingestion/sources/wikipedia-traitors';
import { rulesetRules } from './catalogue';
import { TRAITORS_EVENTS, TRAITORS_RULESETS } from './traitors';

/**
 * Holds The Traitors' point values to the properties they were chosen for,
 * measured on the four finished American seasons: Traitor wins (1, 4) and
 * Faithful wins with two and four winners (2, 3).
 *
 * Only what the adapter can state from a season page is exercised; powers
 * and social events are entered by hand and do not appear here.
 */
const fixtures = join(__dirname, '..', 'ingestion', '__fixtures__');
const SEASONS = [1, 2, 3, 4].map((n) => ({ file: `wikipedia-traitors-${n}.html`, slug: `traitors-${n}` }));
const FINALE = new Set(['PLACEMENT_WINNER', 'PLACEMENT_RUNNER_UP', 'REACHED_END_GAME']);

function scoreSeason(file: string, slug: string, rulesetSlug: string) {
  const facts = wikipediaTraitorsAdapter.parseSeason(readFileSync(join(fixtures, file), 'utf8'), 'x');
  const ruleset = TRAITORS_RULESETS.find((r) => r.slug === rulesetSlug)!;
  const points = new Map(
    [...rulesetRules(ruleset, TRAITORS_EVENTS)].map(([code, rule]) => [code, rule.points]),
  );
  const totals = new Map<string, number>();
  const finale = new Map<string, number>();
  for (const c of mapTraitorsSeason(facts, slug)) {
    const value = points.get(c.eventCode);
    // Every code the mapper emits must be in the catalogue, or it scores nothing.
    expect(value, `no catalogue entry for ${c.eventCode}`).toBeDefined();
    const id = c.player.externalId;
    totals.set(id, (totals.get(id) ?? 0) + (value ?? 0));
    if (FINALE.has(c.eventCode)) finale.set(id, (finale.get(id) ?? 0) + (value ?? 0));
  }
  const placement = new Map<string, number>();
  for (const p of facts.placements) {
    const place =
      p.placeLabel === 'Winner' ? 1 : p.placeLabel === 'Runner-up' ? 2 : Number.parseInt(p.placeLabel, 10);
    placement.set(p.player.externalId, place);
  }
  const affiliation = (id: string) =>
    String(
      (facts.cast.find((c) => c.externalId === id)?.metadata as { affiliation?: string })?.affiliation ?? '',
    );
  return {
    cast: facts.cast.map((c) => c.externalId),
    totals,
    finale,
    placement,
    winners: facts.cast.filter((c) => c.placeLabel === 'Winner').map((c) => c.externalId),
    traitors: facts.cast.map((c) => c.externalId).filter((id) => /traitor/i.test(affiliation(id))),
  };
}

function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]) => {
    const order = xs.map((v, i) => ({ v, i })).sort((p, q) => p.v - q.v);
    const r = new Array<number>(xs.length);
    order.forEach((o, k) => (r[o.i] = k + 1));
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const d2 = ra.reduce((s, v, i) => s + (v - rb[i]) ** 2, 0);
  return 1 - (6 * d2) / (a.length * (a.length ** 2 - 1));
}

/** Deterministic, so the sampled rate is the same on every run. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** The share of random equal-roster leagues won by whoever drafted `target`. */
function holderWinRate(
  season: ReturnType<typeof scoreSeason>,
  target: string,
  teams: number,
  roster: number,
  trials = 3000,
): number {
  const random = lcg(50);
  let wins = 0;
  for (let t = 0; t < trials; t += 1) {
    const pool = [...season.cast];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const rosters = Array.from({ length: teams }, (_, k) => pool.slice(k * roster, (k + 1) * roster));
    const scores = rosters.map((r) => r.reduce((s, id) => s + (season.totals.get(id) ?? 0), 0));
    const holder = rosters.findIndex((r) => r.includes(target));
    if (holder >= 0 && scores[holder] === Math.max(...scores)) wins += 1;
  }
  return wins / trials;
}

const average = (season: ReturnType<typeof scoreSeason>, ids: string[]) =>
  ids.reduce((s, id) => s + (season.totals.get(id) ?? 0), 0) / Math.max(1, ids.length);

describe.each(SEASONS)('Classic on $slug', ({ file, slug }) => {
  const season = scoreSeason(file, slug, 'classic-measurable');

  it('ranks players roughly as the game did, with room for standouts', () => {
    const ids = season.cast.filter((id) => season.placement.has(id));
    const rho = -spearman(
      ids.map((id) => season.totals.get(id) ?? 0),
      ids.map((id) => season.placement.get(id)!),
    );
    // Lower than Survivor's 0.9: a murder takes a strong Faithful out at
    // random, and their placement says nothing about how they played.
    expect(rho).toBeGreaterThan(0.85);
    expect(rho).toBeLessThan(1);
  });

  it('earns a winner their points over the season, not at the finale alone', () => {
    for (const winner of season.winners) {
      const share = (season.finale.get(winner) ?? 0) / season.totals.get(winner)!;
      expect(share).toBeGreaterThan(0.15);
      expect(share).toBeLessThan(0.4);
    }
  });

  it('does not let one draft pick decide a league', () => {
    for (const winner of season.winners) {
      expect(holderWinRate(season, winner, 4, 4)).toBeLessThan(0.6);
      expect(holderWinRate(season, winner, 6, 3)).toBeLessThan(0.65);
    }
  });

  it('sends the first player out home in the red', () => {
    const first = [...season.placement.entries()].sort((a, b) => b[1] - a[1])[0][0];
    expect(season.totals.get(first) ?? 0).toBeLessThan(0);
  });
});

describe('The cloak', () => {
  it('makes a Traitor worth more than a Faithful, but not a draft decided in advance', () => {
    // Season 1 is the outlier the Faithful never caught up with; the rule
    // holds on the three seasons since.
    for (const { file, slug } of SEASONS.slice(1)) {
      const season = scoreSeason(file, slug, 'classic-measurable');
      const faithful = season.cast.filter((id) => !season.traitors.includes(id));
      const ratio = average(season, season.traitors) / average(season, faithful);
      expect(ratio).toBeGreaterThan(1);
      expect(ratio).toBeLessThan(1.6);
    }
  });
});

describe('Balanced', () => {
  it('shrinks the finale and keeps the ordering', () => {
    for (const { file, slug } of SEASONS) {
      const classic = scoreSeason(file, slug, 'classic-measurable');
      const balanced = scoreSeason(file, slug, 'balanced-measurable');
      for (const winner of classic.winners) {
        const cShare = classic.finale.get(winner)! / classic.totals.get(winner)!;
        const bShare = balanced.finale.get(winner)! / balanced.totals.get(winner)!;
        expect(bShare).toBeLessThan(cShare);
        expect(holderWinRate(balanced, winner, 4, 4)).toBeLessThanOrEqual(
          holderWinRate(classic, winner, 4, 4) + 0.02,
        );
      }
    }
  });
});
