import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import {
  IngestionError,
  type RawCastMember,
  type RawPlacementEntry,
  type RawPlayerRef,
  type SeasonSourceAdapter,
  type TraitorsBallot,
  type TraitorsEpisodeResult,
  type TraitorsSeasonFacts,
} from '../types';
import {
  type Cell,
  NameResolver,
  USER_AGENT,
  WIKI_BASE,
  clean,
  easternAirTime,
  expandTable,
  findTable,
  norm,
  ordinal,
  slugify,
  splitName,
} from './wikipedia';

const SLUG = 'wikipedia-traitors';
const NBC_INSIDER = 'https://www.nbc.com/nbc-insider/';

/**
 * Seasons whose pages do not follow the numbered pattern. The civilian
 * edition has its own article and airs on NBC at 8 PM; the celebrity seasons
 * drop on Peacock at 9 PM Eastern.
 */
const SEASONS: Record<string, { article: string; photos?: string; airHour: number }> = {
  'traitors-new-blood': {
    article: 'The_Traitors:_New_Blood',
    photos: `${NBC_INSIDER}the-traitors-new-blood-cast`,
    airHour: 20,
  },
  'traitors-4': {
    article: 'The_Traitors_(American_TV_series)_season_4',
    photos: `${NBC_INSIDER}the-traitors-season-4-peacock-full-cast-details`,
    airHour: 21,
  },
};

function seasonFor(seasonExternalId: string): { article: string; photos?: string; airHour: number } {
  const pinned = SEASONS[seasonExternalId];
  if (pinned) return pinned;
  const match = /^traitors-(\d+)$/.exec(seasonExternalId);
  if (!match) {
    throw new IngestionError(
      `Season id "${seasonExternalId}" is not "traitors-<number>" or a known edition.`,
      SLUG,
    );
  }
  return { article: `The_Traitors_(American_TV_series)_season_${match[1]}`, airHour: 21 };
}

/**
 * The Traitors (US), from the English Wikipedia season article.
 *
 * A season's page carries everything a results grid can: the contestants
 * (their affiliation — Faithful, Traitor, Secret Traitor — and how and when
 * they left), the episodes with their release dates, the elimination
 * history (the Traitors' decision each night, the shields, the banishment
 * and every player's Round Table vote), and the end game. The community
 * keeps it current within hours of an episode, the same as Survivor's.
 *
 * Who is a Traitor when is the one thing no table states directly: the
 * contestants table gives the final affiliation, and the Traitors' decision
 * row says, per episode, whether that night was a murder or a recruitment
 * (a "recruit", "ultimatum" or "seduce"). The row is laid out by the episode
 * a decision is revealed in — a murder at breakfast, a recruit at the next
 * Round Table — so a Traitor named in a recruitment holds the cloak from
 * that episode, and shares that night's murder; every other Traitor held it
 * from the first. That is enough to credit each murder to the Traitors who were in
 * the game the night it happened, and to know whether a banished player was
 * a Traitor when the castle voted them out.
 *
 * Photos are not on Wikipedia. They come from NBC Insider's cast article —
 * each cast member under a heading with their name, their picture next —
 * matched here by name. A season without that article has no photos, never
 * a wrong one.
 */

interface Contestant extends RawCastMember {
  shortNames: string[];
  fullName: string;
  age: number | null;
  hometown: string | null;
  occupation: string | null;
  affiliation: string;
  finishText: string;
  exit: { how: 'murdered' | 'banished' | 'walked' | 'winner' | 'runner-up'; episode: number } | null;
}

function ref(member: Contestant): RawPlayerRef {
  return { externalId: member.externalId, name: member.name, photoUrl: member.photoUrl };
}

const isTraitorAffiliation = (affiliation: string) => /traitor/i.test(affiliation);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function parseExit(finish: string): Contestant['exit'] {
  const episode = Number.parseInt(/episode\s*(\d+)/i.exec(finish)?.[1] ?? '', 10);
  if (!Number.isFinite(episode)) return null;
  if (/^murder/i.test(finish)) return { how: 'murdered', episode };
  if (/^banish/i.test(finish)) return { how: 'banished', episode };
  if (/^(walk|quit|withdr|left|removed|medic)/i.test(finish)) return { how: 'walked', episode };
  if (/^winner/i.test(finish)) return { how: 'winner', episode };
  if (/^runner/i.test(finish)) return { how: 'runner-up', episode };
  return null;
}

function shortNamesFor(full: string): string[] {
  const { first, nickname, last } = splitName(full);
  const rest = last.split(' ').filter(Boolean);
  // "Bob the Drag Queen" is "Bob TDQ" on the voting table: the first name
  // and the initials of the rest.
  const initials =
    rest.length > 1
      ? `${first} ${rest
          .map((w) => w[0])
          .join('')
          .toUpperCase()}`
      : null;
  return [
    full,
    nickname,
    first,
    last ? `${first} ${last[0]}.` : null,
    nickname && last ? `${nickname} ${last[0]}.` : null,
    last || null,
    initials,
  ].filter((s): s is string => Boolean(s));
}

function parseContestants($: cheerio.CheerioAPI): Contestant[] {
  const table = findTable($, /contestants/i);
  if (!table) return [];
  const grid = expandTable($, table);
  const header = grid[0];
  const col = (pattern: RegExp) => header.findIndex((cell) => pattern.test(norm(cell.text)));
  const nameCol = col(/^contestant/);
  const ageCol = col(/^age/);
  const fromCol = col(/^(from|hometown)/);
  const occupationCol = col(/notability|occupation|known/);
  const affiliationCol = col(/^affiliation/);
  const finishCol = col(/^finish/);
  if (nameCol === -1 || finishCol === -1) return [];

  const rows = grid.slice(1).filter((row) => row[nameCol]?.origin && row[nameCol].text);
  const total = rows.length;

  const members = rows.map((row) => {
    const full = row[nameCol].firstLine || row[nameCol].text;
    const { nickname, last } = splitName(full);
    const finishText = row[finishCol]?.text ?? '';
    return {
      externalId: slugify(full),
      name: nickname ? `${nickname} ${last}`.trim() : full,
      photoUrl: undefined as string | undefined,
      statusLabel: null as string | null,
      placeLabel: null as string | null,
      shortNames: shortNamesFor(full),
      fullName: full,
      age: Number.parseInt(row[ageCol]?.text ?? '', 10) || null,
      hometown: row[fromCol]?.text.replace(/,(?=\S)/g, ', ') || null,
      occupation: row[occupationCol]?.text || null,
      affiliation: clean(row[affiliationCol]?.text ?? ''),
      finishText,
      exit: parseExit(finishText),
    };
  });

  // The table is in finishing order — first out at the top, the winners at
  // the bottom, the still-playing below everyone who has left — so a placed
  // player's finish is their position from the bottom. Every winner of a
  // Faithful win shares first place.
  members.forEach((member, index) => {
    const rank = member.exit ? total - index : null;
    member.statusLabel = !member.exit
      ? 'Active'
      : member.exit.how === 'winner'
        ? 'Winner'
        : member.exit.how === 'runner-up'
          ? 'Runner-Up'
          : 'Out';
    member.placeLabel =
      rank === null
        ? null
        : member.exit?.how === 'winner'
          ? 'Winner'
          : member.exit?.how === 'runner-up'
            ? 'Runner-up'
            : `${ordinal(rank)} place`;
  });

  return members;
}

interface EpisodeDate {
  number: number;
  dateText: string;
}

function parseEpisodes($: cheerio.CheerioAPI): EpisodeDate[] {
  const table = findTable($, /episodes/i);
  if (!table) return [];
  const grid = expandTable($, table);
  const header = grid[0];
  const noCol = header.findIndex((cell) => norm(cell.text).includes('inseason'));
  const titleCol = header.findIndex((cell) => norm(cell.text) === 'title');
  const dateCol = header.findIndex((cell) => /release|air/i.test(cell.text));
  if (noCol === -1 || dateCol === -1) return [];
  return (
    grid
      .slice(1)
      // The reunion is listed as an episode but is not one of the game's.
      .filter((row) => !/reunion/i.test(row[titleCol]?.text ?? ''))
      .map((row) => ({
        number: Number.parseInt(row[noCol]?.text ?? '', 10),
        // "September 17, 2026 (2026-09-17)" — the day, without the ISO echo.
        dateText: (row[dateCol]?.text ?? '').replace(/\s*\(.*$/, '').trim(),
      }))
      .filter((e) => Number.isFinite(e.number) && e.dateText)
  );
}

/** The elimination-history table: the one with a "Banishment" row. */
function findHistory($: cheerio.CheerioAPI): Cell[][] | null {
  for (const table of $('table.wikitable').toArray() as Element[]) {
    const grid = expandTable($, table);
    if (grid.some((row) => norm(row[0]?.text ?? '').startsWith('banishment'))) return grid;
  }
  return null;
}

/** The end-game table: an "Episode" and a "Decision" row, and no banishment row. */
function findEndGame($: cheerio.CheerioAPI): Cell[][] | null {
  for (const table of $('table.wikitable').toArray() as Element[]) {
    const grid = expandTable($, table);
    const labels = grid.map((row) => norm(row[0]?.text ?? ''));
    if (
      labels.some((l) => l.startsWith('episode')) &&
      labels.some((l) => l.startsWith('decision')) &&
      !labels.some((l) => l.startsWith('banishment'))
    ) {
      return grid;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

/**
 * NBC Insider's cast article: a heading per cast member ("Rob Rausch (Love
 * Island USA)"), their photo the next image after it. Returns heading name →
 * absolute image URL.
 */
export function parseCastPhotos(html: string): Map<string, string> {
  const $ = cheerio.load(html);
  const photos = new Map<string, string>();
  let heading: string | null = null;
  for (const el of $('h2, h3, img').toArray()) {
    const tag = (el as Element).tagName;
    if (tag === 'h2' || tag === 'h3') {
      heading = $(el)
        .text()
        .replace(/\([^)]*\)/g, '')
        .trim();
      continue;
    }
    if (!heading) continue;
    const src = $(el).attr('src') ?? $(el).attr('data-src') ?? '';
    if (src && !/logo/i.test(src)) {
      photos.set(norm(heading), src.startsWith('http') ? src : `https://www.nbc.com${src}`);
    }
    heading = null;
  }
  return photos;
}

function photoFor(photos: Map<string, string>, member: Contestant): string | undefined {
  const exact = photos.get(norm(member.fullName));
  if (exact) return exact;
  const { first, nickname, last } = splitName(member.fullName);
  if (!last) return photos.get(norm(first));
  const lastKey = norm(last);
  const firstKeys = [first, nickname].filter(Boolean).map((s) => norm(s as string));
  for (const [key, url] of photos) {
    if (key.endsWith(lastKey) && firstKeys.some((f) => key.startsWith(f))) return url;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const wikipediaTraitorsAdapter: SeasonSourceAdapter<TraitorsSeasonFacts> & {
  castPhotosUrl(seasonExternalId: string): string | null;
  /** Pure: the same parse, with an already-fetched photos page attached. */
  parseSeasonWithPhotos(
    html: string,
    sourceUrl: string,
    photosHtml: string | null,
    airHour?: number,
  ): TraitorsSeasonFacts;
} = {
  slug: SLUG,
  showSlug: 'traitors',

  seasonUrl(seasonExternalId: string): string {
    return `${WIKI_BASE}${seasonFor(seasonExternalId).article}`;
  },

  castPhotosUrl(seasonExternalId: string): string | null {
    return seasonFor(seasonExternalId).photos ?? null;
  },

  parseSeason(html: string, sourceUrl: string): TraitorsSeasonFacts {
    return this.parseSeasonWithPhotos(html, sourceUrl, null);
  },

  parseSeasonWithPhotos(html, sourceUrl, photosHtml, airHour = 21): TraitorsSeasonFacts {
    const $ = cheerio.load(html);
    // "The Traitors (American TV series) season 4" → "The Traitors 4", the
    // way "Survivor 51" and "Big Brother 28" read; "The Traitors: New Blood"
    // is already its own name.
    const seasonLabel = $('h1')
      .first()
      .text()
      .trim()
      .replace(/\s*\(American TV series\)\s*season\s*(\d+)$/i, ' $1');

    const cast = parseContestants($);
    if (cast.length === 0) {
      throw new IngestionError(
        `Parsed no contestants from ${sourceUrl} — the page layout has probably changed.`,
        SLUG,
      );
    }
    if (photosHtml) {
      const photos = parseCastPhotos(photosHtml);
      for (const member of cast) member.photoUrl = photoFor(photos, member);
    }
    const resolver = new NameResolver<Contestant>(cast);
    const resolveAll = (text: string): Contestant[] =>
      text
        .split(/,\s*/)
        .map((part) => resolver.resolve(part))
        .filter((m): m is Contestant => m !== null);

    // --- Episodes and when they air --------------------------------------
    const dates = parseEpisodes($);
    // Two episodes on one night air an hour apart.
    const airsAt = new Map<number, Date>();
    const nthOnDate = new Map<string, number>();
    for (const { number, dateText } of dates) {
      const n = nthOnDate.get(dateText) ?? 0;
      nthOnDate.set(dateText, n + 1);
      const at = easternAirTime(dateText, airHour + n);
      if (at) airsAt.set(number, at);
    }

    // --- Elimination history ---------------------------------------------
    const history = findHistory($);
    const perEpisode = new Map<
      number,
      {
        shields: Contestant[];
        shortlisted: Contestant[];
        ballots: Array<{ voter: Contestant; target: Contestant; round: number }>;
        banishedByRound: Map<number, Contestant>;
        recruited: Contestant[];
      }
    >();
    const bucket = (episode: number) => {
      let entry = perEpisode.get(episode);
      if (!entry) {
        entry = { shields: [], shortlisted: [], ballots: [], banishedByRound: new Map(), recruited: [] };
        perEpisode.set(episode, entry);
      }
      return entry;
    };

    if (history) {
      // Labels are matched on letters and digits only: a line break inside
      // "Traitors' Decision" reads as "Traitors', Decision" once expanded.
      const label = (row: Cell[]) => norm(row[0]?.text ?? '');
      const episodeRow = history.find((row) => label(row).startsWith('episode'));
      const decisionRows = history.filter((row) => label(row).startsWith('traitorsdecision'));
      const shortlistRow = history.find((row) => label(row).includes('shortlist'));
      const shieldRow = history.find((row) => label(row).startsWith('shield'));
      const banishRow = history.find((row) => label(row).startsWith('banishment'));
      const voteRow = history.find((row) => label(row) === 'vote' || label(row) === 'votes');

      if (episodeRow && banishRow) {
        const dataCols = episodeRow
          .map((cell, c) => ({ c, episode: Number.parseInt(cell.text, 10) }))
          .filter(({ episode }) => Number.isFinite(episode));
        const firstDataCol = dataCols[0]?.c ?? 1;
        // Player rows: below the vote tally, named in the column just before
        // the episodes (after the coloured affiliation cells).
        const playerRows = history
          .slice(voteRow ? history.indexOf(voteRow) + 1 : history.indexOf(banishRow) + 1)
          .map((row) => {
            for (let c = firstDataCol - 1; c >= 0; c -= 1) {
              const who = row[c]?.text ? resolver.resolve(row[c].text) : null;
              if (who) return { who, row };
            }
            return null;
          })
          .filter((p): p is { who: Contestant; row: Cell[] } => p !== null);

        const [decisionNames, decisionKinds] = decisionRows;
        for (const { c, episode } of dataCols) {
          const entry = bucket(episode);
          const round = dataCols.filter((d) => d.episode === episode && d.c <= c).length;

          const shield = shieldRow?.[c];
          if (shield?.origin && !/^(none|all)$/i.test(shield.text)) {
            for (const m of resolveAll(shield.text)) if (!entry.shields.includes(m)) entry.shields.push(m);
          }
          const shortlist = shortlistRow?.[c];
          if (shortlist?.origin) {
            for (const m of resolveAll(shortlist.text)) {
              if (!entry.shortlisted.includes(m)) entry.shortlisted.push(m);
            }
          }
          const kind = decisionKinds?.[c]?.text ?? '';
          if (decisionNames?.[c]?.origin && /shortlist/i.test(kind)) {
            for (const m of resolveAll(decisionNames[c].text)) {
              if (!entry.shortlisted.includes(m)) entry.shortlisted.push(m);
            }
          }
          if (decisionNames?.[c]?.origin && /recruit|ultimatum|seduc/i.test(kind)) {
            for (const m of resolveAll(decisionNames[c].text)) {
              if (isTraitorAffiliation(m.affiliation) && !entry.recruited.includes(m))
                entry.recruited.push(m);
            }
          }

          const banishCell = banishRow[c];
          const banished = banishCell?.origin ? resolver.resolve(banishCell.text) : null;
          if (banished) entry.banishedByRound.set(round, banished);
          else if (!banishCell?.origin) {
            const carried = entry.banishedByRound.get(round - 1);
            if (carried) entry.banishedByRound.set(round, carried);
          }

          for (const { who, row } of playerRows) {
            const cell = row[c];
            // A vote that spans two columns is one vote, counted at its origin.
            if (!cell?.origin) continue;
            const target = resolver.resolve(cell.text);
            if (target && target !== who) entry.ballots.push({ voter: who, target, round });
          }
        }
      }
    }

    // --- The end game ---------------------------------------------------
    const endGame: Contestant[] = [];
    const endGameGrid = findEndGame($);
    if (endGameGrid) {
      const episodeRow = endGameGrid.find((row) => norm(row[0]?.text ?? '').startsWith('episode'));
      const decisionRow = endGameGrid.find((row) => norm(row[0]?.text ?? '').startsWith('decision'));
      const episode = Number.parseInt(episodeRow?.find((cell) => /^\d+$/.test(cell.text))?.text ?? '', 10);
      if (decisionRow && Number.isFinite(episode)) {
        const entry = bucket(episode);
        const players = endGameGrid
          .map((row) => {
            for (let c = 0; c < Math.min(3, row.length); c += 1) {
              const who = row[c]?.text ? resolver.resolve(row[c].text) : null;
              if (who) return { who, row, nameCol: c };
            }
            return null;
          })
          .filter((p): p is { who: Contestant; row: Cell[]; nameCol: number } => p !== null);
        for (const { who } of players) if (!endGame.includes(who)) endGame.push(who);

        // Rounds after the Round Table's own; each named decision is a banishment.
        let round = Math.max(0, ...[...(perEpisode.get(episode)?.banishedByRound.keys() ?? [])]);
        for (let c = 1; c < decisionRow.length; c += 1) {
          const decided = decisionRow[c];
          if (!decided?.origin) continue;
          const banished = resolver.resolve(decided.text);
          if (!banished) continue;
          round += 1;
          entry.banishedByRound.set(round, banished);
          for (const { who, row, nameCol } of players) {
            if (c <= nameCol) continue;
            const cell = row[c];
            if (!cell?.origin) continue;
            const target = resolver.resolve(cell.text);
            if (target && target !== who) entry.ballots.push({ voter: who, target, round });
          }
        }
      }
    }

    // --- Who held the cloak, and when --------------------------------------
    const traitorFrom = new Map<Contestant, number>();
    for (const [episode, entry] of perEpisode) {
      for (const m of entry.recruited) {
        traitorFrom.set(m, Math.min(traitorFrom.get(m) ?? Infinity, episode));
      }
    }
    for (const m of cast) {
      if (isTraitorAffiliation(m.affiliation) && !traitorFrom.has(m)) traitorFrom.set(m, 1);
    }
    const isTraitorAt = (m: Contestant, episode: number) =>
      traitorFrom.has(m) && (traitorFrom.get(m) as number) <= episode;
    const exitEpisode = (m: Contestant) => m.exit?.episode ?? Infinity;

    // --- Assemble the episodes -------------------------------------------
    const numbers = [
      ...new Set([
        ...dates.map((d) => d.number),
        ...perEpisode.keys(),
        ...cast.flatMap((m) => (m.exit ? [m.exit.episode] : [])),
      ]),
    ].sort((a, b) => a - b);

    // An episode has aired when the page has any result for it — or for any
    // later episode: the first season's table starts at episode two, and
    // episode one still happened.
    const hasResults = (number: number) => {
      const entry = perEpisode.get(number);
      return (
        cast.some((m) => m.exit?.episode === number) ||
        (entry?.ballots.length ?? 0) > 0 ||
        (entry?.shields.length ?? 0) > 0 ||
        (entry?.recruited.length ?? 0) > 0
      );
    };
    const lastWithResults = Math.max(0, ...numbers.filter(hasResults));

    const weeks: TraitorsEpisodeResult[] = numbers.map((number) => {
      const entry = perEpisode.get(number);
      const leaving = cast.filter((m) => m.exit?.episode === number);
      const murdered = leaving.filter((m) => m.exit?.how === 'murdered');
      const banished = leaving.filter((m) => m.exit?.how === 'banished');
      const walked = leaving.filter((m) => m.exit?.how === 'walked');

      const ballots: TraitorsBallot[] = (entry?.ballots ?? []).map(({ voter, target, round }) => {
        const out = entry?.banishedByRound.get(round) ?? null;
        const hit = out !== null && out === target;
        return {
          voter: ref(voter),
          target: ref(target),
          round,
          banished: hit,
          caughtTraitor: hit && isTraitorAt(target, number),
        };
      });

      // The murder revealed this episode was made the night before, by the
      // Traitors still in the game after that night's Round Table — and by
      // anyone recruited that same night, whom the table lists under this
      // episode too.
      const murderers = murdered.map(() =>
        [...traitorFrom.keys()].filter((t) => isTraitorAt(t, number) && exitEpisode(t) >= number).map(ref),
      );

      const newTraitors = cast.filter((m) => traitorFrom.get(m) === number);

      const aired = number <= lastWithResults;

      return {
        weekLabel: `E${number}`,
        weekNumber: number,
        aired,
        airsAt: airsAt.get(number) ?? null,
        eliminated: [...murdered, ...banished, ...walked].map(ref),
        murdered: murdered.map(ref),
        banished: banished.map(ref),
        shields: (entry?.shields ?? []).map(ref),
        shortlisted: (entry?.shortlisted ?? []).map(ref),
        ballots,
        newTraitors: aired ? newTraitors.map(ref) : [],
        murderers,
      };
    });

    const EXIT_LABEL: Record<string, string | null> = {
      murdered: 'Murdered',
      banished: null,
      walked: 'Left the game',
      winner: null,
      'runner-up': null,
    };

    const placements: RawPlacementEntry[] = cast
      .filter((m) => m.placeLabel)
      .map((m, i) => ({
        order: i + 1,
        player: ref(m),
        dateLabel: '',
        dayLabel: '',
        placeLabel: m.placeLabel as string,
      }));

    const airDates = [...airsAt.entries()].sort((a, b) => a[0] - b[0]).map(([, d]) => d);

    return {
      sourceSlug: SLUG,
      sourceUrl,
      seasonLabel,
      premiereDate: airDates[0] ?? null,
      finaleDate: airDates.length > 1 ? (airDates.at(-1) as Date) : null,
      weeks,
      placements,
      cast: cast.map((m) => ({
        externalId: m.externalId,
        name: m.name,
        photoUrl: m.photoUrl,
        statusLabel: m.statusLabel,
        placeLabel: m.placeLabel,
        metadata: {
          fullName: m.fullName,
          age: m.age,
          hometown: m.hometown,
          occupation: m.occupation,
          affiliation: m.affiliation || null,
          finish: m.finishText || null,
          exit: m.exit ? EXIT_LABEL[m.exit.how] : null,
        },
      })),
      endGame: endGame.map(ref),
      fetchedAt: new Date(),
    };
  },

  async fetchSeason(seasonExternalId: string): Promise<TraitorsSeasonFacts> {
    const season = seasonFor(seasonExternalId);
    const url = this.seasonUrl(seasonExternalId);
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' } });
    if (!response.ok) throw new IngestionError(`${url} returned ${response.status}`, SLUG);
    const html = await response.text();

    // Photos are a bonus, never a reason to fail a sync.
    let photosHtml: string | null = null;
    const photosUrl = this.castPhotosUrl(seasonExternalId);
    if (photosUrl) {
      try {
        const photos = await fetch(photosUrl, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' } });
        if (photos.ok) photosHtml = await photos.text();
      } catch {
        photosHtml = null;
      }
    }

    return this.parseSeasonWithPhotos(html, url, photosHtml, season.airHour);
  },
};
