import { describe, expect, it } from 'vitest';
import { buildDraftOrder, validatePick } from './snake';

const teamIds = ['a', 'b', 'c'];

describe('buildDraftOrder', () => {
  it('reverses direction every other round for a snake draft', () => {
    const order = buildDraftOrder(teamIds, 4);
    expect(order.map((s) => s.teamId)).toEqual(['a', 'b', 'c', 'c', 'b', 'a', 'a', 'b', 'c', 'c', 'b', 'a']);
  });

  it('keeps a constant order for a linear draft', () => {
    const order = buildDraftOrder(teamIds, 2, 'LINEAR');
    expect(order.map((s) => s.teamId)).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
  });

  it('numbers picks continuously across rounds', () => {
    const order = buildDraftOrder(teamIds, 2);
    expect(order.map((s) => s.pickNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(order[3]).toMatchObject({ round: 2, pickInRound: 1, teamId: 'c' });
  });

  it('does not mutate the supplied order', () => {
    const input = [...teamIds];
    buildDraftOrder(input, 4);
    expect(input).toEqual(teamIds);
  });

  it('returns nothing for an empty league', () => {
    expect(buildDraftOrder([], 5)).toEqual([]);
  });
});

describe('validatePick', () => {
  const order = buildDraftOrder(teamIds, 2);
  const eligible = new Set(['x', 'y', 'z']);

  it('accepts the team on the clock', () => {
    const result = validatePick({
      order,
      picksMade: [],
      teamId: 'a',
      contestantId: 'x',
      eligibleContestantIds: eligible,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a team picking out of turn', () => {
    const result = validatePick({
      order,
      picksMade: [],
      teamId: 'b',
      contestantId: 'x',
      eligibleContestantIds: eligible,
    });
    expect(result).toMatchObject({ ok: false, reason: 'NOT_ON_THE_CLOCK' });
  });

  it('rejects an already-drafted contestant', () => {
    const result = validatePick({
      order,
      picksMade: [{ pickNumber: 1, teamId: 'a', contestantId: 'x' }],
      teamId: 'b',
      contestantId: 'x',
      eligibleContestantIds: eligible,
    });
    expect(result).toMatchObject({ ok: false, reason: 'CONTESTANT_TAKEN' });
  });

  it('rejects a contestant from another season', () => {
    const result = validatePick({
      order,
      picksMade: [],
      teamId: 'a',
      contestantId: 'nope',
      eligibleContestantIds: eligible,
    });
    expect(result).toMatchObject({ ok: false, reason: 'CONTESTANT_INELIGIBLE' });
  });

  it('rejects any pick once the board is full', () => {
    const picksMade = order.map((slot, i) => ({
      pickNumber: slot.pickNumber,
      teamId: slot.teamId,
      contestantId: `p${i}`,
    }));
    const result = validatePick({
      order,
      picksMade,
      teamId: 'a',
      contestantId: 'x',
      eligibleContestantIds: eligible,
    });
    expect(result).toMatchObject({ ok: false, reason: 'DRAFT_COMPLETE' });
  });
});
