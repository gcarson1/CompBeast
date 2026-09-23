import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapTraitorsSeason } from './mappers/traitors';
import { parseCastPhotos, wikipediaTraitorsAdapter } from './sources/wikipedia-traitors';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8');
const names = (players: Array<{ name: string }>) => players.map((p) => p.name);

describe('wikipediaTraitorsAdapter — season 4, a Traitor win', () => {
  const facts = wikipediaTraitorsAdapter.parseSeasonWithPhotos(
    fixture('wikipedia-traitors-4.html'),
    'x',
    fixture('nbc-traitors-4-cast.html'),
    21,
  );
  const episode = (n: number) => facts.weeks.find((w) => w.weekNumber === n)!;

  it('reads the cast, their affiliations and how they left', () => {
    expect(facts.seasonLabel).toBe('The Traitors 4');
    expect(facts.cast).toHaveLength(23);
    const rob = facts.cast.find((c) => c.name === 'Rob Rausch')!;
    expect(rob.placeLabel).toBe('Winner');
    expect(rob.metadata).toMatchObject({ affiliation: 'Traitor', occupation: 'Love Island USA 5' });
    const ian = facts.cast.find((c) => c.name === 'Ian Terry')!;
    expect(ian.placeLabel).toBe('23rd place');
    expect(ian.metadata).toMatchObject({ exit: 'Murdered' });
    expect(facts.cast.find((c) => c.name === 'Maura Higgins')!.placeLabel).toBe('Runner-up');
  });

  it('attaches every NBC headshot by name', () => {
    expect(facts.cast.every((c) => c.photoUrl?.startsWith('https://www.nbc.com/'))).toBe(true);
  });

  it('dates the episodes at the 9 PM Eastern Peacock drop, an hour apart on a shared night', () => {
    expect(facts.premiereDate?.toISOString()).toBe('2026-01-09T02:00:00.000Z');
    expect(episode(2).airsAt?.toISOString()).toBe('2026-01-09T03:00:00.000Z');
    // Eleven game episodes; the reunion is not one.
    expect(facts.weeks.map((w) => w.weekNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(facts.weeks.every((w) => w.aired)).toBe(true);
  });

  it('knows who held a cloak when — including the ultimatum', () => {
    expect(names(episode(1).newTraitors).sort()).toEqual(
      ['Candiace Dillard Bassett', 'Donna Kelce', 'Lisa Rinna', 'Rob Rausch'].sort(),
    );
    // Eric took the ultimatum on the night of episode 8; the table, and the
    // castle, learn it in episode 9 — the night he and Rob murdered Dorinda.
    expect(names(episode(9).newTraitors)).toEqual(['Eric Nam']);
    expect(names(episode(8).murderers[0]).sort()).toEqual(['Candiace Dillard Bassett', 'Rob Rausch']);
    expect(names(episode(9).murderers[0]).sort()).toEqual(['Eric Nam', 'Rob Rausch']);
  });

  it('reads the Round Table: every ballot, the banishment, and who caught a Traitor', () => {
    const three = episode(3);
    expect(names(three.banished)).toEqual(['Donna Kelce']);
    expect(three.ballots).toHaveLength(20);
    expect(three.ballots.filter((b) => b.caughtTraitor)).toHaveLength(18);
    // Porsha, a Faithful, went home in episode 2: votes for her are not a catch.
    expect(episode(2).ballots.some((b) => b.caughtTraitor)).toBe(false);
    expect(names(episode(2).shields)).toEqual(['Caroline Stanbury', 'Colton Underwood', 'Yam Yam Arocho']);
  });

  it('reads the end game as its own rounds of voting', () => {
    expect(names(facts.endGame)).toEqual(['Rob Rausch', 'Maura Higgins', 'Eric Nam', 'Tara Lipinski']);
    const eleven = episode(11);
    expect(names(eleven.banished).sort()).toEqual(['Eric Nam', 'Johnny Weir', 'Tara Lipinski']);
    const caught = eleven.ballots.filter((b) => b.caughtTraitor);
    expect(names(caught.map((b) => b.voter)).sort()).toEqual(['Maura Higgins', 'Rob Rausch']);
  });
});

describe('wikipediaTraitorsAdapter — season 3, four Faithful winners', () => {
  const facts = wikipediaTraitorsAdapter.parseSeason(fixture('wikipedia-traitors-3.html'), 'x');

  it('crowns every winner and places the rest from the bottom of the table', () => {
    expect(
      facts.cast
        .filter((c) => c.placeLabel === 'Winner')
        .map((c) => c.name)
        .sort(),
    ).toEqual(['Dolores Catania', 'Dylan Efron', 'Gabby Windey', 'Ivar Mountbatten'].sort());
    expect(facts.cast.find((c) => c.name === 'Britney Haynes')!.placeLabel).toBe('5th place');
  });

  it('resolves the short names the voting table uses', () => {
    // "Bob TDQ", "Bob H." and "Ayan" are how the table writes three of them.
    const four = facts.weeks.find((w) => w.weekNumber === 4)!;
    expect(names(four.banished)).toEqual(['Bob the Drag Queen']);
    expect(four.shortlisted.map((p) => p.name).sort()).toEqual([
      'Ciara Miller',
      'Jeremy Collins',
      'Nikki Garcia',
    ]);
    expect(four.ballots.filter((b) => b.target.name === 'Bob the Drag Queen').length).toBeGreaterThan(10);
  });

  it('scores a tied first round as no banishment', () => {
    const ten = facts.weeks.find((w) => w.weekNumber === 10)!;
    const firstRound = ten.ballots.filter((b) => b.round === 1);
    expect(firstRound.length).toBeGreaterThan(0);
    expect(firstRound.every((b) => !b.banished)).toBe(true);
  });
});

describe('wikipediaTraitorsAdapter — The Traitors: New Blood, airing', () => {
  const facts = wikipediaTraitorsAdapter.parseSeasonWithPhotos(
    fixture('wikipedia-traitors-new-blood.html'),
    'x',
    fixture('nbc-traitors-new-blood-cast.html'),
    20,
  );

  it('keeps the unaired episodes unaired and dated for their roster locks', () => {
    expect(facts.weeks.filter((w) => w.aired).map((w) => w.weekNumber)).toEqual([1, 2]);
    // NBC, Thursdays at 8 PM Eastern; the second of a double bill at 9.
    expect(facts.premiereDate?.toISOString()).toBe('2026-09-18T00:00:00.000Z');
    const three = facts.weeks.find((w) => w.weekNumber === 3)!;
    expect(three.airsAt?.toISOString()).toBe('2026-09-25T00:00:00.000Z');
    // November is Eastern Standard Time.
    expect(facts.finaleDate?.toISOString()).toBe('2026-11-20T02:00:00.000Z');
  });

  it('has a photo for all 22 players and leaves the still-playing unplaced', () => {
    expect(facts.cast).toHaveLength(22);
    expect(facts.cast.every((c) => c.photoUrl)).toBe(true);
    expect(facts.placements.map((p) => p.player.name)).toEqual(['Kim Daily', 'Madeline Kostopulos']);
  });

  it('does not treat an Accomplice as a Traitor', () => {
    const one = facts.weeks.find((w) => w.weekNumber === 1)!;
    expect(names(one.newTraitors).sort()).toEqual(['Joe Vanella', 'Tomica Adams']);
  });
});

describe('mapTraitorsSeason', () => {
  const facts = wikipediaTraitorsAdapter.parseSeason(fixture('wikipedia-traitors-4.html'), 'x');
  const candidates = mapTraitorsSeason(facts, 'traitors-4');
  const count = (code: string, name?: string) =>
    candidates.filter((c) => c.eventCode === code && (!name || c.player.name === name)).length;

  it('scores the season it reads, and every key is unique', () => {
    expect(count('PLACEMENT_WINNER')).toBe(1);
    expect(count('PLACEMENT_RUNNER_UP')).toBe(1);
    expect(count('REACHED_END_GAME')).toBe(4);
    expect(count('BECAME_TRAITOR')).toBe(5);
    expect(count('MURDERED')).toBe(9);
    expect(count('SHIELD_WON', 'Kristen Kish')).toBeGreaterThan(2);
    expect(count('CAUGHT_A_TRAITOR', 'Maura Higgins')).toBeGreaterThan(2);
    expect(new Set(candidates.map((c) => c.sourceRef)).size).toBe(candidates.length);
    expect(candidates.every((c) => c.confidence === 'HIGH')).toBe(true);
  });
});

describe('parseCastPhotos', () => {
  it('pairs each name heading with the picture under it', () => {
    const photos = parseCastPhotos(fixture('nbc-traitors-new-blood-cast.html'));
    expect(photos.get('abbeybenjamin')).toMatch(/thetraitorsnewblood_characterportrait_vert_2abbey/);
  });
});
