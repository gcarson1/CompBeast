import { describe, expect, it } from 'vitest';
import { aggregateTeamScores, cumulativeByCycle, resolveRuleset } from './engine';
import type { CycleRef, RosterAssignment, ScoredEventInput, TeamRef } from './types';

const cycles: CycleRef[] = [
  { id: 'w1', label: 'Week 1', sequence: 1 },
  { id: 'w2', label: 'Week 2', sequence: 2 },
];

const teams: TeamRef[] = [
  { id: 't1', name: 'Alpha' },
  { id: 't2', name: 'Bravo' },
];

const ruleset = resolveRuleset({
  id: 'rs1',
  slug: 'classic-measurable',
  name: 'Classic',
  entries: [
    { eventDefinitionId: 'hoh', code: 'HOH_WIN', label: 'Win HOH', category: 'COMPETITION_GAMEPLAY', basePoints: 10, pointsOverride: null },
    { eventDefinitionId: 'nom', code: 'NOMINATED', label: 'Nominated', category: 'COMPETITION_GAMEPLAY', basePoints: -5, pointsOverride: null },
    { eventDefinitionId: 'veto', code: 'VETO_WIN', label: 'Win Veto', category: 'COMPETITION_GAMEPLAY', basePoints: 5, pointsOverride: 3 },
  ],
});

function roster(assignments: Array<[string, string, string]>): RosterAssignment[] {
  return assignments.map(([teamId, contestantId, cycleId]) => ({ teamId, contestantId, cycleId }));
}

function event(partial: Partial<ScoredEventInput> & { id: string }): ScoredEventInput {
  return {
    contestantId: 'c1',
    eventDefinitionId: 'hoh',
    cycleId: 'w1',
    pointsAwarded: 10,
    isVoided: false,
    occurredAt: new Date('2026-07-01T00:00:00Z'),
    ...partial,
  };
}

describe('aggregateTeamScores', () => {
  it('attributes points to the team that rostered the contestant that cycle', () => {
    const result = aggregateTeamScores({
      teams,
      cycles,
      roster: roster([
        ['t1', 'c1', 'w1'],
        ['t2', 'c2', 'w1'],
      ]),
      events: [event({ id: 'e1' }), event({ id: 'e2', contestantId: 'c2', eventDefinitionId: 'nom', pointsAwarded: -5 })],
      ruleset,
    });

    expect(result.teams.find((t) => t.teamId === 't1')?.totalPoints).toBe(10);
    expect(result.teams.find((t) => t.teamId === 't2')?.totalPoints).toBe(-5);
  });

  it('does not credit a team for a cycle in which it did not roster the contestant', () => {
    const result = aggregateTeamScores({
      teams,
      cycles,
      roster: roster([['t1', 'c1', 'w1']]),
      events: [event({ id: 'e1', cycleId: 'w2' })],
      ruleset,
    });

    expect(result.teams.find((t) => t.teamId === 't1')?.totalPoints).toBe(0);
    expect(result.unattributedEventIds).toEqual(['e1']);
  });

  it('excludes voided events from totals', () => {
    const result = aggregateTeamScores({
      teams,
      cycles,
      roster: roster([['t1', 'c1', 'w1']]),
      events: [event({ id: 'e1' }), event({ id: 'e2', isVoided: true })],
      ruleset,
    });

    expect(result.teams.find((t) => t.teamId === 't1')?.totalPoints).toBe(10);
  });

  it('surfaces voided events in the breakdown when asked, without scoring them', () => {
    const result = aggregateTeamScores({
      teams,
      cycles,
      roster: roster([['t1', 'c1', 'w1']]),
      events: [event({ id: 'e1', isVoided: true })],
      ruleset,
      options: { includeVoided: true },
    });

    const team = result.teams.find((t) => t.teamId === 't1');
    expect(team?.totalPoints).toBe(0);
    expect(team?.cycles[0].lines).toHaveLength(1);
    expect(team?.cycles[0].lines[0].isVoided).toBe(true);
  });

  it('ignores events whose definition is outside the league ruleset', () => {
    const result = aggregateTeamScores({
      teams,
      cycles,
      roster: roster([['t1', 'c1', 'w1']]),
      events: [event({ id: 'e1', eventDefinitionId: 'cried', pointsAwarded: -2 })],
      ruleset,
    });

    expect(result.teams.find((t) => t.teamId === 't1')?.totalPoints).toBe(0);
    expect(result.outOfRulesetEventIds).toEqual(['e1']);
  });

  it('honors the recorded snapshot by default and restates on demand', () => {
    const args = {
      teams,
      cycles,
      roster: roster([['t1', 'c1', 'w1']] as Array<[string, string, string]>),
      events: [event({ id: 'e1', eventDefinitionId: 'veto', pointsAwarded: 5 })],
      ruleset,
    };

    expect(aggregateTeamScores(args).teams[0].totalPoints).toBe(5);

    const restated = aggregateTeamScores({ ...args, options: { pointsSource: 'ruleset' } });
    expect(restated.teams[0].totalPoints).toBe(3);
    expect(restated.teams[0].cycles[0].lines[0].wasRestated).toBe(true);
  });

  it('supports standings as of a given cycle', () => {
    const result = aggregateTeamScores({
      teams,
      cycles,
      roster: roster([
        ['t1', 'c1', 'w1'],
        ['t1', 'c1', 'w2'],
      ]),
      events: [event({ id: 'e1' }), event({ id: 'e2', cycleId: 'w2' })],
      ruleset,
      options: { throughCycleSequence: 1 },
    });

    expect(result.teams.find((t) => t.teamId === 't1')?.totalPoints).toBe(10);
  });

  it('shares a rank across ties and skips the next rank', () => {
    const result = aggregateTeamScores({
      teams: [...teams, { id: 't3', name: 'Charlie' }],
      cycles,
      roster: roster([
        ['t1', 'c1', 'w1'],
        ['t2', 'c2', 'w1'],
        ['t3', 'c3', 'w1'],
      ]),
      events: [
        event({ id: 'e1', contestantId: 'c1' }),
        event({ id: 'e2', contestantId: 'c2' }),
        event({ id: 'e3', contestantId: 'c3', eventDefinitionId: 'nom', pointsAwarded: -5 }),
      ],
      ruleset,
    });

    expect(result.teams.map((t) => [t.teamName, t.rank])).toEqual([
      ['Alpha', 1],
      ['Bravo', 1],
      ['Charlie', 3],
    ]);
  });

  it('sums fractional point values without float drift', () => {
    const halfRuleset = resolveRuleset({
      id: 'rs2',
      slug: 'half',
      name: 'Half',
      entries: [
        { eventDefinitionId: 'h', code: 'H', label: 'H', category: 'SOCIAL_DRAMA', basePoints: 0.1, pointsOverride: null },
      ],
    });

    const result = aggregateTeamScores({
      teams: [teams[0]],
      cycles,
      roster: roster([['t1', 'c1', 'w1']]),
      events: Array.from({ length: 3 }, (_, i) =>
        event({ id: `e${i}`, eventDefinitionId: 'h', pointsAwarded: 0.1 }),
      ),
      ruleset: halfRuleset,
    });

    expect(result.teams[0].totalPoints).toBe(0.3);
  });
});

describe('cumulativeByCycle', () => {
  it('carries running totals through cycles with no scoring', () => {
    const result = aggregateTeamScores({
      teams: [teams[0]],
      cycles,
      roster: roster([['t1', 'c1', 'w1']]),
      events: [event({ id: 'e1' })],
      ruleset,
    });

    expect(cumulativeByCycle(result.teams[0], cycles)).toEqual([
      { cycleId: 'w1', sequence: 1, cyclePoints: 10, cumulativePoints: 10 },
      { cycleId: 'w2', sequence: 2, cyclePoints: 0, cumulativePoints: 10 },
    ]);
  });
});
