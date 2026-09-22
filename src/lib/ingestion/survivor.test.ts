import { describe, expect, it } from 'vitest';
import { mapSurvivorSeason } from './mappers/survivor';
import type { RawPlayerRef, SurvivorEpisodeResult, SurvivorSeasonFacts } from './types';

/**
 * No Survivor results site is parsed yet, so the facts are built by hand.
 * That is the point of the test: it pins down the shape an adapter has to
 * produce, and what the mapper is allowed to conclude from it.
 */

const p = (externalId: string): RawPlayerRef => ({
  externalId,
  name: externalId
    .split('-')
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(' '),
});

const [ana, ben, cal, dee, eli, fay] = ['ana', 'ben', 'cal', 'dee', 'eli', 'fay'].map(p);

function episode(
  overrides: Partial<SurvivorEpisodeResult> & Pick<SurvivorEpisodeResult, 'weekNumber'>,
): SurvivorEpisodeResult {
  // `eliminated` is the generic view of `exits`; a test states the exits and
  // gets the other for free, the way an adapter would build them.
  const exits =
    overrides.exits ?? (overrides.eliminated ?? []).map((player) => ({ player, how: 'voted' as const }));
  return {
    weekLabel: `E${overrides.weekNumber}`,
    aired: true,
    immunity: [],
    tribalImmunity: [],
    reward: [],
    tribalReward: [],
    idolsPlayed: [],
    votes: [],
    correctVoters: [],
    fireMakingWinner: null,
    ...overrides,
    exits,
    eliminated: exits.map((e) => e.player),
  };
}

const facts: SurvivorSeasonFacts = {
  sourceSlug: 'test-source',
  sourceUrl: 'https://example.test/s50',
  seasonLabel: 'Survivor 50',
  premiereDate: null,
  finaleDate: null,
  weeks: [
    // Pre-merge: a tribe wins immunity, the other votes someone out 4–1.
    episode({
      weekNumber: 1,
      tribalImmunity: [ana, ben, cal],
      reward: [ana, ben, cal],
      votes: [
        { player: fay, count: 4 },
        { player: dee, count: 1 },
      ],
      eliminated: [fay],
    }),
    // Post-merge: individual immunity, an idol that worked, a unanimous boot.
    episode({
      weekNumber: 2,
      immunity: [dee],
      idolsPlayed: [{ player: eli, negatedVotes: true }],
      votes: [{ player: cal, count: 4 }],
      eliminated: [cal],
    }),
    // A medevac: the source says so.
    episode({ weekNumber: 3, exits: [{ player: ben, how: 'evacuated' }], votes: [], immunity: [ana] }),
    // Scheduled, not aired.
    episode({ weekNumber: 4, aired: false }),
  ],
  placements: [
    { order: 1, player: ana, dateLabel: '', dayLabel: '', placeLabel: 'Sole Survivor' },
    { order: 2, player: dee, dateLabel: '', dayLabel: '', placeLabel: 'Runner-Up' },
    { order: 3, player: eli, dateLabel: '', dayLabel: '', placeLabel: '3rd Place' },
    { order: 4, player: ben, dateLabel: '', dayLabel: '', placeLabel: '4th Place' },
    { order: 5, player: cal, dateLabel: '', dayLabel: '', placeLabel: '5th Place' },
    { order: 6, player: fay, dateLabel: '', dayLabel: '', placeLabel: '6th Place' },
  ],
  mergeEpisode: 2,
  juryVotes: [
    { player: ana, count: 5 },
    { player: dee, count: 2 },
  ],
  cast: [
    { ...ana, statusLabel: 'Winner', placeLabel: 'Sole Survivor' },
    { ...dee, statusLabel: 'Runner-Up', placeLabel: 'Runner-Up' },
    { ...eli, statusLabel: 'Jury', placeLabel: '3rd Place' },
    { ...ben, statusLabel: 'Jury', placeLabel: '4th Place' },
    { ...cal, statusLabel: 'Jury', placeLabel: '5th Place' },
    { ...fay, statusLabel: 'Out', placeLabel: '6th Place' },
  ],
  fetchedAt: new Date(),
};

const candidates = mapSurvivorSeason(facts, 'survivor-50');
const forWeek = (week: number, code: string) =>
  candidates.filter((c) => c.weekNumber === week && c.eventCode === code);

describe('mapSurvivorSeason', () => {
  it('credits every member of a tribe that won immunity', () => {
    expect(forWeek(1, 'TRIBAL_IMMUNITY_WIN').map((c) => c.player.externalId)).toEqual(['ana', 'ben', 'cal']);
  });

  it('maps individual immunity at high confidence', () => {
    const [win] = forWeek(2, 'IMMUNITY_WIN');
    expect(win.player.externalId).toBe('dee');
    expect(win.confidence).toBe('HIGH');
  });

  it('records one VOTE_RECEIVED per vote, each with its own dedupe key', () => {
    const votes = forWeek(1, 'VOTE_RECEIVED');
    expect(votes.filter((v) => v.player.externalId === 'fay')).toHaveLength(4);
    expect(votes.filter((v) => v.player.externalId === 'dee')).toHaveLength(1);
    expect(new Set(votes.map((v) => v.sourceRef)).size).toBe(votes.length);
    // The label is still the episode's own; the suffix lives only in the ref.
    expect(votes.every((v) => v.weekLabel === 'E1')).toBe(true);
  });

  it('tells a successful idol from a wasted one', () => {
    expect(forWeek(2, 'IDOL_PLAYED_SUCCESSFULLY').map((c) => c.player.externalId)).toEqual(['eli']);
    expect(forWeek(2, 'IDOL_PLAYED_WASTED')).toHaveLength(0);
  });

  it('marks a boot unanimous only when every vote landed on them', () => {
    expect(forWeek(1, 'VOTED_OUT_UNANIMOUS')).toHaveLength(0);
    expect(forWeek(2, 'VOTED_OUT_UNANIMOUS').map((c) => c.player.externalId)).toEqual(['cal']);
  });

  it('scores a medevac as an involuntary exit, not a vote-out', () => {
    expect(forWeek(3, 'VOTED_OUT')).toHaveLength(0);
    expect(forWeek(3, 'ELIMINATED_INVOLUNTARY').map((c) => c.player.externalId)).toEqual(['ben']);
  });

  it('credits the merge to everyone still in when the tribes merged', () => {
    const merged = forWeek(2, 'MADE_MERGE')
      .map((c) => c.player.externalId)
      .sort();
    expect(merged).toEqual(['ana', 'ben', 'cal', 'dee', 'eli']);
  });

  it('awards survival only through aired episodes and only to those still in', () => {
    expect(
      forWeek(1, 'EPISODE_SURVIVED')
        .map((c) => c.player.externalId)
        .sort(),
    ).toEqual(['ana', 'ben', 'cal', 'dee', 'eli']);
    expect(
      forWeek(3, 'EPISODE_SURVIVED')
        .map((c) => c.player.externalId)
        .sort(),
    ).toEqual(['ana', 'dee', 'eli']);
    expect(forWeek(4, 'EPISODE_SURVIVED')).toHaveLength(0);
  });

  it('reads "Sole Survivor" as the winner', () => {
    expect(candidates.find((c) => c.eventCode === 'PLACEMENT_WINNER')?.player.externalId).toBe('ana');
    expect(candidates.find((c) => c.eventCode === 'PLACEMENT_RUNNER_UP')?.player.externalId).toBe('dee');
  });

  it('derives the jury from the boundary, so the finalists count too', () => {
    const jury = candidates.filter((c) => c.eventCode === 'REACHED_JURY').map((c) => c.player.externalId);
    expect(jury.sort()).toEqual(['ana', 'ben', 'cal', 'dee', 'eli']);
    expect(jury).not.toContain('fay');
  });

  it('never infers events the source cannot support', () => {
    const codes = new Set(candidates.map((c) => c.eventCode));
    expect(codes.has('IDOL_FOUND')).toBe(false);
    expect(codes.has('BLINDSIDE_ORCHESTRATED')).toBe(false);
    expect(codes.has('FIRE_MAKING_WIN')).toBe(false);
  });
});
