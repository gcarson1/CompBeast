import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapSurvivorSeason } from '../ingestion/mappers/survivor';
import { wikipediaSurvivorAdapter } from '../ingestion/sources/wikipedia-survivor';
import { SURVIVOR_EVENTS, SURVIVOR_RULESETS } from './survivor';

/**
 * The Survivor scoring model, held to the properties it was tuned for on
 * two real seasons. These are the numbers a point-value change has to keep:
 *
 *   - fantasy rank tracks real placement (a good player scores well), but
 *   - the finale is a bonus, not the season, and
 *   - drafting the Sole Survivor does not decide a league by itself.
 *
 * Only the events an adapter can state from a results page are exercised;
 * idols and social events are entered by hand and do not appear here.
 */
const fixtures = join(__dirname, '..', 'ingestion', '__fixtures__');
const SEASONS = [
  { file: 'wikipedia-survivor-49.html', slug: 'survivor-49' },
  { file: 'wikipedia-survivor-50.html', slug: 'survivor-50' },
];

function pointsFor(rulesetSlug: string): Map<string, number> {
  const ruleset = SURVIVOR_RULESETS.find((r) => r.slug === rulesetSlug)!;
  const points = new Map<string, number>();
  for (const event of SURVIVOR_EVENTS) {
    if (!ruleset.categories.includes(event.category)) continue;
    points.set(
      event.code,
      ruleset.useBalancedPoints && event.balancedPoints !== undefined ? event.balancedPoints : event.points,
    );
  }
  return points;
}

function scoreSeason(file: string, slug: string, rulesetSlug: string) {
  const facts = wikipediaSurvivorAdapter.parseSeason(readFileSync(join(fixtures, file), 'utf8'), 'x');
  const points = pointsFor(rulesetSlug);
  const totals = new Map<string, number>();
  const finale = new Map<string, number>();
  const FINALE = new Set([
    'PLACEMENT_WINNER',
    'PLACEMENT_RUNNER_UP',
    'PLACEMENT_THIRD',
    'JURY_VOTE_RECEIVED',
    'MADE_FINAL_TRIBAL',
    'REACHED_JURY',
  ]);
  for (const c of mapSurvivorSeason(facts, slug)) {
    const value = points.get(c.eventCode);
    // Every code the mapper emits must be in the catalogue, or it scores nothing.
    expect(value, `no catalogue entry for ${c.eventCode}`).toBeDefined();
    const id = c.player.externalId;
    totals.set(id, (totals.get(id) ?? 0) + (value ?? 0));
    if (FINALE.has(c.eventCode)) finale.set(id, (finale.get(id) ?? 0) + (value ?? 0));
  }
  const placement = new Map<string, number>();
  const n = facts.placements.length;
  for (const p of facts.placements) {
    const m = /^(\d+)/.exec(p.placeLabel);
    placement.set(
      p.player.externalId,
      p.placeLabel === 'Winner' ? 1 : p.placeLabel === 'Runner-up' ? 2 : m ? Number(m[1]) : n,
    );
  }
  const winner = facts.cast.find((c) => c.placeLabel === 'Winner')!.externalId;
  return { cast: facts.cast.map((c) => c.externalId), totals, finale, placement, winner };
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

/** The share of random equal-roster leagues won by whoever drafted the winner. */
function winnerTeamRate(
  season: ReturnType<typeof scoreSeason>,
  teams: number,
  roster: number,
  trials = 4000,
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
    const holder = rosters.findIndex((r) => r.includes(season.winner));
    if (scores[holder] === Math.max(...scores)) wins += 1;
  }
  return wins / trials;
}

describe.each(SEASONS)('Classic on $slug', ({ file, slug }) => {
  const season = scoreSeason(file, slug, 'classic-measurable');

  it('ranks players roughly as the game did, with room for standouts', () => {
    const ids = season.cast.filter((id) => season.placement.has(id));
    const rho = -spearman(
      ids.map((id) => season.totals.get(id) ?? 0),
      ids.map((id) => season.placement.get(id)!),
    );
    expect(rho).toBeGreaterThan(0.9);
    expect(rho).toBeLessThan(1);
  });

  it('puts the winner at or near the top on weekly play, not on the finale alone', () => {
    const winnerPoints = season.totals.get(season.winner)!;
    const share = (season.finale.get(season.winner) ?? 0) / winnerPoints;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.45);
    const above = [...season.totals.values()].filter((v) => v > winnerPoints).length;
    expect(above).toBeLessThanOrEqual(1);
  });

  it('does not let one draft pick decide a four-team league', () => {
    expect(winnerTeamRate(season, 4, 4)).toBeLessThan(0.75);
    expect(winnerTeamRate(season, 6, 3)).toBeLessThan(0.75);
  });

  it('sends a first boot home in the red and a jury member well into the black', () => {
    const last = [...season.placement.entries()].sort((a, b) => b[1] - a[1])[0][0];
    expect(season.totals.get(last) ?? 0).toBeLessThan(0);
    const juror = [...season.placement.entries()].find(([, p]) => p === 6)![0];
    expect(season.totals.get(juror) ?? 0).toBeGreaterThan(40);
  });
});

describe('Balanced', () => {
  it('shrinks the finale further and keeps the ordering', () => {
    for (const { file, slug } of SEASONS) {
      const classic = scoreSeason(file, slug, 'classic-measurable');
      const balanced = scoreSeason(file, slug, 'balanced-measurable');
      const cShare = classic.finale.get(classic.winner)! / classic.totals.get(classic.winner)!;
      const bShare = balanced.finale.get(balanced.winner)! / balanced.totals.get(balanced.winner)!;
      expect(bShare).toBeLessThan(cShare);
      expect(winnerTeamRate(balanced, 4, 4)).toBeLessThanOrEqual(winnerTeamRate(classic, 4, 4) + 0.02);
    }
  });
});
