import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapSurvivorSeason } from './mappers/survivor';
import { parseCastPhotos, wikipediaSurvivorAdapter } from './sources/wikipedia-survivor';
import { IngestionError } from './types';

/**
 * Parsed against saved copies of the real pages. Survivor 49 is a finished
 * season — every table filled in, a medevac, a double tribal, a fire-making
 * round, three tribes, two swaps. Survivor 51 was captured two days before
 * its premiere: a full cast, a schedule, and nothing played.
 */
const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8');

const done = wikipediaSurvivorAdapter.parseSeason(
  fixture('wikipedia-survivor-49.html'),
  'https://example.test/s49',
);

describe('wikipediaSurvivorAdapter.parseSeason — a finished season', () => {
  it('reads the season label from the page heading', () => {
    expect(done.seasonLabel).toBe('Survivor 49');
  });

  it('parses the whole cast with stable ids and the names fans use', () => {
    expect(done.cast).toHaveLength(18);
    const annie = done.cast.find((c) => c.externalId === 'kimberly-annie-davis');
    expect(annie?.name).toBe('Annie Davis');
    expect(annie?.metadata).toMatchObject({ fullName: 'Kimberly "Annie" Davis', age: 49, tribe: 'Kele' });
  });

  it('places everyone from the table order, finalists by title', () => {
    const by = (id: string) => done.cast.find((c) => c.externalId === id)!;
    expect(by('savannah-louie')).toMatchObject({ placeLabel: 'Winner', statusLabel: 'Winner' });
    expect(by('sophi-balerdi')).toMatchObject({ placeLabel: 'Runner-up', statusLabel: 'Runner-Up' });
    expect(by('sage-ahrens-nichols')).toMatchObject({ placeLabel: '3rd place' });
    expect(by('nicole-mazullo')).toMatchObject({ placeLabel: '18th place', statusLabel: 'Out' });
    expect(by('rizo-velovic')).toMatchObject({ placeLabel: '4th place', statusLabel: 'Jury' });
    expect(done.placements).toHaveLength(18);
  });

  it('dates every episode from the summary, at the 8 PM Eastern air slot', () => {
    expect(done.weeks).toHaveLength(13);
    // September 24, 2025, 8 PM EDT.
    expect(done.weeks[0].airsAt?.toISOString()).toBe('2025-09-25T00:00:00.000Z');
    expect(done.premiereDate?.toISOString()).toBe('2025-09-25T00:00:00.000Z');
    expect(done.finaleDate?.toISOString()).toBe('2025-12-18T00:00:00.000Z');
    expect(done.weeks.every((w) => w.aired)).toBe(true);
  });

  it('turns a tribe win into a win for each member of that tribe, in that phase', () => {
    const e1 = done.weeks[0];
    // Episode 1: Hina and Uli won immunity, Kele went to tribal.
    const immune = e1.tribalImmunity.map((p) => p.externalId);
    expect(immune).toContain('savannah-louie'); // Uli
    expect(immune).toContain('steven-ramm'); // Hina
    expect(immune).not.toContain('nicole-mazullo'); // Kele
    expect(e1.immunity).toEqual([]);
  });

  it('splits a tribe reward from an individual one', () => {
    const e1 = done.weeks[0];
    expect(e1.reward).toEqual([]);
    expect(e1.tribalReward.length).toBeGreaterThan(0);
    const e8 = done.weeks.find((w) => w.weekNumber === 8)!;
    expect(e8.tribalReward).toEqual([]);
  });

  it('reads individual immunity and reward winners after the merge', () => {
    const e8 = done.weeks.find((w) => w.weekNumber === 8)!;
    expect(e8.immunity.map((p) => p.externalId)).toEqual(['savannah-louie']);
    expect(e8.tribalImmunity).toEqual([]);
    expect(e8.reward.map((p) => p.externalId)).toEqual(['savannah-louie']);
    const e7 = done.weeks.find((w) => w.weekNumber === 7)!;
    expect(e7.reward.map((p) => p.name).sort()).toEqual(
      ['Nate Moore', 'Rizo Velovic', 'Sophi Balerdi', 'Sophie Segreti', 'Steven Ramm'].sort(),
    );
  });

  it('counts the votes each person received from the voting history', () => {
    const e1 = done.weeks[0];
    const votes = Object.fromEntries(e1.votes.map((v) => [v.player.externalId, v.count]));
    expect(votes).toEqual({ 'nicole-mazullo': 5, 'kimberly-annie-davis': 1 });
  });

  it('counts a tied vote and its revote as one departure', () => {
    const e10 = done.weeks.find((w) => w.weekNumber === 10)!;
    expect(e10.exits).toHaveLength(1);
    expect(e10.exits[0].player.externalId).toBe('jawan-pitts');
  });

  it('tells a medevac from a vote-out in a double-exit episode', () => {
    const e3 = done.weeks.find((w) => w.weekNumber === 3)!;
    expect(e3.exits.map((e) => [e.player.externalId, e.how])).toEqual([
      ['jake-latimer', 'evacuated'],
      ['jeremiah-ing', 'voted'],
    ]);
  });

  it('reads the fire-making round', () => {
    const finale = done.weeks.find((w) => w.weekNumber === 13)!;
    // Sophi held immunity and saved Sage; Savannah beat Rizo at fire.
    expect(finale.fireMakingWinner?.externalId).toBe('savannah-louie');
    expect(finale.exits.map((e) => [e.player.externalId, e.how])).toEqual([
      ['kristina-mills', 'voted'],
      ['rizo-velovic', 'fire'],
    ]);
  });

  it('knows when the tribes merged', () => {
    expect(done.mergeEpisode).toBe(7);
  });

  it('keeps Sophi and Sophie apart', () => {
    const e11 = done.weeks.find((w) => w.weekNumber === 11)!;
    expect(e11.exits[0].player.externalId).toBe('sophie-segreti');
    expect(e11.immunity[0].externalId).toBe('steven-ramm');
  });

  it('throws rather than silently returning nothing when the layout changes', () => {
    expect(() =>
      wikipediaSurvivorAdapter.parseSeason('<html><body><h1>Nope</h1></body></html>', 'x'),
    ).toThrow(IngestionError);
  });
});

const upcoming = wikipediaSurvivorAdapter.parseSeasonWithPhotos(
  fixture('wikipedia-survivor-51.html'),
  'https://example.test/s51',
  fixture('paramount-survivor-51-cast.html'),
);

describe('a season that has not premiered', () => {
  it('has the full cast, nobody placed, nothing aired', () => {
    expect(upcoming.cast).toHaveLength(21);
    expect(upcoming.cast.every((c) => c.statusLabel === 'Active' && c.placeLabel === null)).toBe(true);
    expect(upcoming.placements).toEqual([]);
    expect(upcoming.weeks.length).toBeGreaterThanOrEqual(12);
    expect(upcoming.weeks.every((w) => !w.aired)).toBe(true);
    expect(upcoming.mergeEpisode).toBeNull();
  });

  it('dates the premiere from the summary', () => {
    // September 23, 2026, 8 PM EDT.
    expect(upcoming.premiereDate?.toISOString()).toBe('2026-09-24T00:00:00.000Z');
  });

  it("matches the network's headshot to every castaway, nicknames included", () => {
    const withPhoto = upcoming.cast.filter((c) => c.photoUrl);
    expect(withPhoto).toHaveLength(21);
    const jelly = upcoming.cast.find((c) => c.externalId === 'angelica-jelly-loblack')!;
    expect(jelly.name).toBe('Jelly Loblack');
    expect(jelly.photoUrl).toMatch(/^https:\/\/www\.paramountplus\.com\/.*\.jpe?g$/);
    // Wikipedia writes "Thien An Nguyen"; the network writes 'An "Thien An" Nguyen'.
    const thienAn = upcoming.cast.find((c) => c.externalId === 'thien-an-nguyen')!;
    expect(thienAn.photoUrl).toBeTruthy();
  });

  it('produces no scoring candidates', () => {
    expect(mapSurvivorSeason(upcoming, 'survivor-51')).toEqual([]);
  });
});

const returnees = wikipediaSurvivorAdapter.parseSeason(
  fixture('wikipedia-survivor-50.html'),
  'https://example.test/s50',
);

describe('a returnee season with a subtitle', () => {
  it('reads the name off the first line, not the seasons listed under it', () => {
    expect(returnees.seasonLabel).toBe('Survivor 50: In the Hands of the Fans');
    expect(returnees.cast).toHaveLength(24);
    const cirie = returnees.cast.find((c) => c.externalId === 'cirie-fields')!;
    expect(cirie.name).toBe('Cirie Fields');
    expect(returnees.cast.find((c) => c.placeLabel === 'Winner')?.externalId).toBe('aubry-bracco');
  });

  it('reads a double boot written as "Chrissy & Coach" in one cell', () => {
    const e8 = returnees.weeks.find((w) => w.weekNumber === 8)!;
    expect(e8.exits.map((e) => e.player.externalId).sort()).toEqual([
      'benjamin-coach-wade',
      'chrissy-hofbeck',
    ]);
  });

  it('reads the jury tally in finalist order', () => {
    expect(returnees.juryVotes.map((j) => [j.player.externalId, j.count])).toEqual([
      ['aubry-bracco', 8],
      ['jonathan-young', 3],
      ['joe-hunter', 0],
    ]);
  });

  it("finds every returnee's headshot, including a first name the network spells out", () => {
    const withPhotos = wikipediaSurvivorAdapter.parseSeasonWithPhotos(
      fixture('wikipedia-survivor-50.html'),
      'https://example.test/s50',
      fixture('paramount-survivor-50-cast.html'),
    );
    expect(withPhotos.cast.filter((c) => c.photoUrl)).toHaveLength(24);
    expect(withPhotos.cast.find((c) => c.externalId === 'joe-hunter')?.photoUrl).toMatch(/image-37/);
    expect(wikipediaSurvivorAdapter.castPhotosUrl('survivor-50')).toMatch(
      /everything-we-know-about-survivor-50/,
    );
    expect(wikipediaSurvivorAdapter.castPhotosUrl('survivor-51')).toMatch(/survivor-season-51-cast/);
  });

  it('knows a switched-tribe phase as well as a swap', () => {
    expect(returnees.mergeEpisode).toBe(6);
    expect(returnees.weeks.every((w) => w.aired)).toBe(true);
  });
});

describe('parseCastPhotos', () => {
  it('ignores images that are not castaway headshots', () => {
    const photos = parseCastPhotos(fixture('paramount-survivor-51-cast.html'));
    expect(photos.size).toBe(21);
  });
});

describe('mapSurvivorSeason over the real season', () => {
  const candidates = mapSurvivorSeason(done, 'survivor-49');
  const codes = (code: string) => candidates.filter((c) => c.eventCode === code);

  it('scores placements and the jury from the page', () => {
    expect(codes('PLACEMENT_WINNER')[0].player.externalId).toBe('savannah-louie');
    expect(codes('REACHED_JURY').map((c) => c.player.externalId)).toContain('rizo-velovic');
    expect(codes('REACHED_JURY').map((c) => c.player.externalId)).not.toContain('nicole-mazullo');
  });

  it('scores the merge, fire-making and the medevac', () => {
    // Eighteen cast, seven gone before the merge in episode 7.
    expect(codes('MADE_MERGE')).toHaveLength(11);
    expect(codes('FIRE_MAKING_WIN')[0].player.externalId).toBe('savannah-louie');
    expect(codes('ELIMINATED_INVOLUNTARY')[0].player.externalId).toBe('jake-latimer');
  });

  it('scores the final tribal council and every jury vote from the jury table', () => {
    expect(
      codes('MADE_FINAL_TRIBAL')
        .map((c) => c.player.externalId)
        .sort(),
    ).toEqual(['sage-ahrens-nichols', 'savannah-louie', 'sophi-balerdi']);
    const juryVotes = codes('JURY_VOTE_RECEIVED');
    expect(juryVotes.filter((c) => c.player.externalId === 'savannah-louie')).toHaveLength(5);
    expect(juryVotes.filter((c) => c.player.externalId === 'sophi-balerdi')).toHaveLength(2);
    expect(juryVotes.filter((c) => c.player.externalId === 'sage-ahrens-nichols')).toHaveLength(1);
  });

  it('credits everyone who voted for the person who went home', () => {
    // Episode 1: Nicole went 5–1; the five who voted Nicole voted with the majority.
    const e1 = codes('VOTED_WITH_MAJORITY').filter((c) => c.weekNumber === 1);
    expect(e1).toHaveLength(5);
    expect(e1.map((c) => c.player.externalId)).not.toContain('nicole-mazullo');
  });

  it('gives every candidate a unique dedupe key', () => {
    const refs = candidates.map((c) => c.sourceRef);
    expect(new Set(refs).size).toBe(refs.length);
  });
});
