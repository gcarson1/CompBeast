import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapBigBrotherSeason } from '../ingestion/mappers/big-brother';
import { bigBrotherJunkiesAdapter } from '../ingestion/sources/big-brother-junkies';
import { aggregateTeamScores, resolveRuleset } from '../scoring/engine';
import type { ScoredEventInput } from '../scoring/types';
import { BIG_BROTHER_EVENTS, BIG_BROTHER_RULESETS } from './big-brother';
import { rulesetRules } from './catalogue';

/**
 * Lauren's Way against Lauren's own season.
 *
 * Every mark on her BB28 scoresheet, week by week, replayed through the real
 * engine under the `laurens-way` ruleset. The ledger rows are recorded at the
 * catalogue's Classic values (+10 for an HOH, −5 for a nomination), which is
 * how the ingestion pipeline records them — so this also proves the ruleset's
 * own values win over what the ledger snapshotted.
 *
 * Her columns map to our codes as: HOH → HOH_WIN; POV → VETO_WIN, or
 * SAVED_BY_VETO for the two houseguests pulled off by someone else's veto
 * (Lyric in week 2, Dee in week 6); BB → BLOCKBUSTER_WIN; NOM → NOMINATED;
 * HN → HAVE_NOT; STV → SURVIVED_BLOCK; SC → SPECIAL_COMP_WIN; TC →
 * TWIST_SELECTED; TCP → SPECIAL_POWER_WIN; X → EVICTION_ORDER.
 */

type Mark = 'HOH' | 'NOM' | 'POV' | 'SAVED' | 'BB' | 'HN' | 'X' | 'STV' | 'SC' | 'TC' | 'TCP';

const CODE: Record<Mark, string> = {
  HOH: 'HOH_WIN',
  NOM: 'NOMINATED',
  POV: 'VETO_WIN',
  SAVED: 'SAVED_BY_VETO',
  BB: 'BLOCKBUSTER_WIN',
  HN: 'HAVE_NOT',
  X: 'EVICTION_ORDER',
  STV: 'SURVIVED_BLOCK',
  SC: 'SPECIAL_COMP_WIN',
  TC: 'TWIST_SELECTED',
  TCP: 'SPECIAL_POWER_WIN',
};

/** Her scoresheet, one block per week, exactly as marked. */
const SHEET: Record<number, Record<string, Mark[]>> = {
  1: {
    Ashley: ['NOM', 'X'],
    Chuk: ['HN', 'SC'],
    Dee: ['HOH'],
    Devens: ['HN'],
    Drew: ['HN'],
    Haley: ['HN'],
    Jason: ['SC'],
    Mallory: ['NOM', 'POV'],
    Rome: ['SC'],
    Taylor: ['NOM', 'HN', 'STV'],
    Yash: ['NOM', 'BB'],
    Angela: ['TC'],
  },
  2: {
    Barrett: ['HN'],
    Devens: ['HOH', 'POV'],
    Jason: ['NOM', 'BB', 'HN'],
    Kamu: ['HN'],
    Lyric: ['NOM', 'SAVED', 'HN'],
    Melody: ['NOM', 'STV'],
    Rome: ['NOM', 'HN', 'X'],
  },
  3: {
    Dee: ['HN'],
    Devens: ['TC', 'TCP'],
    Drew: ['BB'],
    Jason: ['NOM', 'X'],
    Kamu: ['HOH'],
    Lala: ['NOM', 'HN', 'STV'],
    Lyric: ['NOM', 'POV'],
    Mallory: ['NOM', 'BB', 'HN'],
    Melody: ['HN'],
    Angela: ['HN'],
  },
  4: {
    Dee: ['TC', 'TCP'],
    Devens: ['HN'],
    Drew: ['NOM', 'BB'],
    Haley: ['HOH'],
    Kamu: ['HN'],
    Lala: ['HN'],
    Lyric: ['NOM', 'X'],
    Melody: ['NOM', 'STV'],
    Taylor: ['NOM', 'POV'],
  },
  5: {
    Barrett: ['NOM', 'HN', 'STV'],
    Chuk: ['NOM', 'HN', 'X'],
    Drew: ['HN'],
    Haley: ['NOM', 'BB', 'HN'],
    Kamu: ['POV'],
    Lala: ['HOH'],
    Mallory: ['TC'],
    Angela: ['NOM', 'BB'],
  },
  6: {
    Dee: ['NOM', 'SAVED'],
    Haley: ['NOM', 'STV'],
    Kamu: ['NOM', 'X'],
    Melody: ['TC'],
    Yash: ['HOH', 'POV'],
  },
  7: {
    Dee: ['HOH'],
    Drew: ['NOM', 'BB', 'TC', 'TCP'],
    Haley: ['X'],
    Lala: ['NOM', 'POV', 'HN'],
    Mallory: ['NOM', 'HN', 'X'],
    Taylor: ['NOM', 'HN', 'STV'],
  },
  8: {
    Devens: ['NOM', 'BB'],
    Drew: ['HOH'],
    Lala: ['NOM', 'X'],
    Taylor: ['NOM', 'STV'],
    Yash: ['NOM', 'POV'],
    Angela: ['NOM', 'X'],
  },
  9: {
    Barrett: ['HOH'],
    Dee: ['NOM', 'HN', 'STV'],
    Devens: ['NOM', 'BB'],
    Melody: ['HN'],
    Yash: ['POV'],
  },
  10: {
    Barrett: ['NOM', 'HN', 'X'],
    Devens: ['HN'],
    Drew: ['NOM', 'POV'],
    Melody: ['NOM', 'BB'],
    Taylor: ['NOM', 'STV'],
    Yash: ['HOH'],
  },
  11: {
    Dee: ['NOM', 'STV'],
    Devens: ['NOM', 'POV'],
    Melody: ['HOH'],
    Yash: ['NOM', 'X'],
  },
  12: {
    Devens: ['HOH'],
    Drew: ['NOM', 'POV'],
    Melody: ['NOM', 'X'],
    Taylor: ['NOM', 'STV'],
  },
  13: {
    Dee: ['NOM'],
    Drew: ['NOM'],
    Taylor: ['HOH'],
  },
};

/** Where each evictee finished, from the season's eviction table. */
const PLACEMENT: Record<string, number> = {
  Ashley: 17,
  Rome: 16,
  Jason: 15,
  Lyric: 14,
  Chuk: 13,
  Kamu: 12,
  Mallory: 11,
  Haley: 10,
  Lala: 9,
  Angela: 8,
  Barrett: 7,
  Yash: 6,
  Melody: 5,
};

/** Each houseguest's season total on her sheet, as of week 13. */
const HER_TOTALS: Record<string, number> = {
  Devens: 15,
  Drew: 10,
  Yash: 8,
  Dee: 5,
  Melody: -6,
  Angela: -8,
  Taylor: -9,
  Haley: -10,
  Kamu: -10,
  Mallory: -12,
  Barrett: -13,
  Lala: -15,
  Jason: -16,
  Chuk: -17,
  Lyric: -18,
  Rome: -18,
  Ashley: -19,
};

const laurensWay = BIG_BROTHER_RULESETS.find((r) => r.slug === 'laurens-way')!;
const catalogue = new Map(BIG_BROTHER_EVENTS.map((event) => [event.code, event]));

function replay() {
  const rules = rulesetRules(laurensWay, BIG_BROTHER_EVENTS);
  const ruleset = resolveRuleset({
    id: 'laurens-way',
    slug: 'laurens-way',
    name: 'Lauren’s Way',
    entries: [...rules].map(([code, rule]) => {
      const event = catalogue.get(code)!;
      return {
        eventDefinitionId: code,
        code,
        label: event.label,
        category: event.category,
        basePoints: event.points,
        pointsOverride: rule.override,
        isVariable: event.isVariable,
      };
    }),
  });

  const houseguests = Object.keys(HER_TOTALS);
  const cycles = Object.keys(SHEET).map((week) => ({
    id: `w${week}`,
    label: `Week ${week}`,
    sequence: Number(week),
  }));
  const events: ScoredEventInput[] = [];
  for (const [week, marks] of Object.entries(SHEET)) {
    for (const [name, list] of Object.entries(marks)) {
      for (const mark of list) {
        const code = CODE[mark];
        events.push({
          id: `${week}-${name}-${mark}`,
          contestantId: name,
          eventDefinitionId: code,
          cycleId: `w${week}`,
          // What the pipeline records: the catalogue value, or for the order
          // of eviction the value the mapper worked out from the placement.
          pointsAwarded: mark === 'X' ? -(PLACEMENT[name] - 1) : catalogue.get(code)!.points,
          isVoided: false,
          occurredAt: new Date(`2026-07-${String(Number(week)).padStart(2, '0')}T00:00:00Z`),
        });
      }
    }
  }

  // One team per houseguest, holding them every week, so a team total is
  // that houseguest's season.
  const result = aggregateTeamScores({
    teams: houseguests.map((name) => ({ id: name, name })),
    cycles,
    roster: houseguests.flatMap((name) =>
      cycles.map((cycle) => ({ teamId: name, contestantId: name, cycleId: cycle.id })),
    ),
    events,
    ruleset,
  });
  return {
    totals: new Map(result.teams.map((team) => [team.teamId, team.totalPoints])),
    ignored: result.outOfRulesetEventIds,
  };
}

describe("Lauren's Way", () => {
  it('scores every mark on her sheet, and nothing it does not', () => {
    expect(replay().ignored).toEqual([]);

    const rules = rulesetRules(laurensWay, BIG_BROTHER_EVENTS);
    const value = (code: string) => rules.get(code)?.points;
    expect(value('HOH_WIN')).toBe(5);
    expect(value('NOMINATED')).toBe(-3);
    expect(value('VETO_WIN')).toBe(3);
    expect(value('SAVED_BY_VETO')).toBe(3);
    expect(value('BLOCKBUSTER_WIN')).toBe(4);
    expect(value('HAVE_NOT')).toBe(-2);
    expect(value('SURVIVED_BLOCK')).toBe(1);
    expect(value('PLACEMENT_WINNER')).toBe(10);
    expect(value('PLACEMENT_RUNNER_UP')).toBe(7);
    expect(value('AMERICAS_FAVORITE')).toBe(8);
    expect(value('SPECIAL_COMP_WIN')).toBe(2);
    expect(value('TWIST_SELECTED')).toBe(4);
    expect(value('SPECIAL_POWER_WIN')).toBe(2);
    // None of the Classic-only rules leak in.
    for (const code of ['WEEK_SURVIVED', 'REACHED_JURY', 'EVICTED', 'JURY_VOTE_RECEIVED', 'ON_THE_BLOCK']) {
      expect(rules.has(code), code).toBe(false);
    }
  });

  it('reproduces her season totals', () => {
    const { totals } = replay();

    // Her "X" column is "order of eviction, −1 to −16". Her sheet computed it
    // from the week number, which is the same thing until a double
    // eviction: after the one in week 7 her week count ran one ahead of the
    // order, so the six houseguests who left from then on each cost one
    // point more on her sheet than their place in the order does here.
    const AFTER_THE_DOUBLE = new Set(['Haley', 'Lala', 'Angela', 'Barrett', 'Yash', 'Melody']);

    for (const [name, hers] of Object.entries(HER_TOTALS)) {
      const expected = AFTER_THE_DOUBLE.has(name) ? hers + 1 : hers;
      expect(totals.get(name), name).toBe(expected);
    }
  });

  it('records the order of eviction from the BB28 results, one place per evictee', () => {
    const html = readFileSync(
      join(__dirname, '..', 'ingestion', '__fixtures__', 'bbj-season-28.html'),
      'utf8',
    );
    const facts = bigBrotherJunkiesAdapter.parseSeason(html, 'x');
    const order = mapBigBrotherSeason(facts, 'big-brother-28').filter(
      (c) => c.eventCode === 'EVICTION_ORDER',
    );
    const byName = new Map(order.map((c) => [c.player.name.split(' ')[0], c]));

    // Twelve out when the fixture was taken; the five still in the house have
    // no place yet and cost nothing.
    expect(order).toHaveLength(12);
    expect(byName.get('Ashley')).toMatchObject({ points: -16, weekLabel: 'W1', confidence: 'HIGH' });
    expect(byName.get('Rome')).toMatchObject({ points: -15, weekLabel: 'W2' });
    // The week-7 double eviction: the source lists each half as its own week,
    // and each evictee keeps their own place.
    expect(byName.get('Mallory')).toMatchObject({ points: -10, weekLabel: 'W7' });
    expect(byName.get('Haley')).toMatchObject({ points: -9, weekLabel: 'W8' });
    expect(byName.get('Yash')).toMatchObject({ points: -5, weekLabel: 'W12' });
    for (const name of ['Dee', 'Drew', 'Melody', 'Rick', 'Taylor'])
      expect(byName.has(name), name).toBe(false);
  });
});
