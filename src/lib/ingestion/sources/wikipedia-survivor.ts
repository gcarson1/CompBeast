import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import {
  IngestionError,
  type RawCastMember,
  type RawPlacementEntry,
  type RawPlayerRef,
  type SeasonSourceAdapter,
  type SurvivorEpisodeResult,
  type SurvivorExit,
  type SurvivorSeasonFacts,
} from '../types';

const SLUG = 'wikipedia-survivor';
const WIKI_BASE = 'https://en.wikipedia.org/wiki/';
const CAST_PHOTOS_BASE = 'https://www.paramountplus.com/sneak-peak/';

const USER_AGENT = 'CompBeastBot/0.1 (+https://github.com/gcarson1/CompBeast)';

/**
 * The network's cast articles mostly follow one URL shape, but not always;
 * a season whose article is named differently is pinned here.
 */
const CAST_PHOTO_PAGES: Record<string, string> = {
  'survivor-50': `${CAST_PHOTOS_BASE}everything-we-know-about-survivor-50-cast-release-date/`,
};

/**
 * Survivor, from the English Wikipedia season article.
 *
 * Each season's page carries three tables that between them say everything
 * a results grid can: the contestants (with their tribe in each phase of the
 * game and where they finished), the season summary (reward and immunity
 * winners per episode) and the voting history (who went to tribal council,
 * who voted for whom, and how each person left). The community keeps them
 * current within hours of an episode airing, the site's robots policy
 * welcomes a bot that identifies itself, and the markup has been stable for
 * years — which is more than the official site offers, where the cast page
 * is a script with no data in it.
 *
 * Photos are not on Wikipedia. They come from the network's own "Meet the
 * cast" article on Paramount+, one headshot per castaway with the name in
 * the alt text, matched here by name. A season without that article simply
 * has no photos, never a wrong one.
 *
 * Wikipedia tables lean hard on rowspan and colspan, so every table is first
 * expanded into a plain grid where each cell knows its text; nothing below
 * reads a `<td>` directly.
 */

/** The Wikipedia article for a season id like "survivor-51". */
function articleTitle(seasonExternalId: string): string {
  const match = /^survivor-(\d+)$/.exec(seasonExternalId);
  if (!match) throw new IngestionError(`Season id "${seasonExternalId}" is not "survivor-<number>".`, SLUG);
  // Seasons with a subtitle have their own article titles; Wikipedia
  // redirects the bare "Survivor_50" form to them, and fetch follows it.
  return `Survivor_${match[1]}`;
}

interface Cell {
  text: string;
  /** The text before the cell's first line break — a name without what follows it. */
  firstLine: string;
  /** True for the cell's top-left origin; a spanned copy is false. */
  origin: boolean;
}

/**
 * A table as a rectangle. A cell that spans rows or columns is copied into
 * every position it covers, so column N means the same thing on every row
 * whatever the spans above it did.
 */
function expandTable($: cheerio.CheerioAPI, table: Element): Cell[][] {
  const grid: Cell[][] = [];
  $(table)
    .find('tr')
    .each((r, tr) => {
      grid[r] = grid[r] ?? [];
      let c = 0;
      $(tr)
        .children('th,td')
        .each((_, cell) => {
          while (grid[r][c]) c += 1;
          const rowspan = Number.parseInt($(cell).attr('rowspan') ?? '1', 10) || 1;
          const colspan = Number.parseInt($(cell).attr('colspan') ?? '1', 10) || 1;
          // A returnee's cell is their name, a line break, then their past
          // seasons; the first line is the name. Taken from the markup before
          // the breaks are folded into the running text below.
          const firstLine = clean(cheerio.load(($(cell).html() ?? '').split(/<br/i)[0]).text());
          // Line breaks separate names in a list; footnote markers ([a], [1])
          // and the "[Name]" add-on notation for advantages are dropped.
          $(cell).find('br').replaceWith(', ');
          $(cell).find('sup').remove();
          const text = clean($(cell).text());
          for (let i = 0; i < rowspan; i += 1) {
            grid[r + i] = grid[r + i] ?? [];
            for (let j = 0; j < colspan; j += 1) {
              grid[r + i][c + j] = { text, firstLine, origin: i === 0 && j === 0 };
            }
          }
          c += colspan;
        });
    });
  return grid.filter((row) => row.length > 0);
}

function clean(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/(^,\s*|,\s*$)/g, '')
    .trim();
}

function findTable($: cheerio.CheerioAPI, captionPattern: RegExp): Element | null {
  const tables = $('table.wikitable').toArray();
  return tables.find((table) => captionPattern.test($(table).find('caption').first().text())) ?? null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** "Kimberly "Annie" Davis" → { first: "Kimberly", nickname: "Annie", last: "Davis" }. */
function splitName(full: string): { first: string; nickname: string | null; last: string } {
  const nickname = /["“”']([^"“”']+)["“”']/.exec(full)?.[1] ?? null;
  const parts = full
    .replace(/["“”']([^"“”']+)["“”']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ');
  return { first: parts[0] ?? '', nickname, last: parts.slice(1).join(' ') };
}

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/["“”']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

interface Contestant extends RawCastMember {
  /** Tribe per phase, keyed by the normalised phase label ("original", "firstswitch", "merged"). */
  tribes: Record<string, string>;
  /** The short forms the page uses for this person elsewhere: nickname, first name, "First L.". */
  shortNames: string[];
  fullName: string;
  age: number | null;
  hometown: string | null;
  /** The Placement cell verbatim, e.g. "14th voted out, 7th jury member". */
  finishText: string;
  dayLabel: string;
}

/**
 * Resolves the short names the summary and voting tables use ("Annie",
 * "Sophi", "Jake S.") to contestants. Built from the cast, so a season with
 * two Jakes resolves "Jake S." and refuses a bare "Jake".
 */
class NameResolver {
  private readonly byShort = new Map<string, Contestant[]>();

  constructor(cast: Contestant[]) {
    for (const member of cast) {
      for (const short of member.shortNames) {
        const key = norm(short);
        const list = this.byShort.get(key) ?? [];
        list.push(member);
        this.byShort.set(key, list);
      }
    }
  }

  resolve(short: string): Contestant | null {
    const cleaned = short.replace(/\([^)]*\)/g, '').trim();
    if (!cleaned) return null;
    const matches = this.byShort.get(norm(cleaned)) ?? [];
    // One person, or the same person listed under two of their own short
    // names; two different people is an ambiguity the page would not leave.
    const distinct = [...new Set(matches)];
    return distinct.length === 1 ? distinct[0] : null;
  }
}

function ref(member: Contestant): RawPlayerRef {
  return { externalId: member.externalId, name: member.name, photoUrl: member.photoUrl };
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function parseContestants($: cheerio.CheerioAPI): Contestant[] {
  const table = findTable($, /contestants/i);
  if (!table) return [];
  const grid = expandTable($, table);

  // Two header rows: the group ("Tribe", "Finish") and the column under it
  // ("Original", "Merged", "Placement", "Day"). Columns are found by the
  // second row's labels, so a season with two swaps and one with none both
  // read correctly.
  const header = grid[1] ?? grid[0];
  const group = grid[0];
  const columns = header.map((cell, i) => ({ label: norm(cell.text), group: norm(group[i]?.text ?? '') }));
  const col = (label: string) => columns.findIndex((c) => c.label === label);
  const nameCol = col('contestant');
  const ageCol = col('age');
  const fromCol = col('from');
  const placementCol = col('placement');
  const dayCol = col('day');
  const tribeCols = columns
    .map((c, i) => ({ ...c, i }))
    .filter((c) => c.group === 'tribe' || c.group === 'tribes');

  const rows = grid.slice(2).filter((row) => row[nameCol]?.origin && row[nameCol].text);
  const total = rows.length;

  return rows.map((row, index) => {
    const full = row[nameCol].firstLine || row[nameCol].text;
    const { first, nickname, last } = splitName(full);
    const placementText = row[placementCol]?.text ?? '';
    const placed = placementText.length > 0;
    // The table is kept in finishing order — first out at the top, winner at
    // the bottom, the still-playing below the eliminated — so the position
    // from the bottom is the finish, and needs no parsing of "14th voted out".
    const rank = placed ? total - index : null;

    const shortNames = [nickname, first, last ? `${first} ${last[0]}.` : null].filter((s): s is string =>
      Boolean(s),
    );

    return {
      externalId: slugify(full),
      name: nickname ? `${nickname} ${last}`.trim() : full,
      photoUrl: undefined,
      statusLabel: !placed
        ? 'Active'
        : rank === 1
          ? 'Winner'
          : rank === 2
            ? 'Runner-Up'
            : /jury/i.test(placementText)
              ? 'Jury'
              : 'Out',
      placeLabel:
        rank === null ? null : rank === 1 ? 'Winner' : rank === 2 ? 'Runner-up' : `${ordinal(rank)} place`,
      tribes: Object.fromEntries(
        tribeCols.map((c) => [c.label, row[c.i]?.text ?? '']).filter(([, tribe]) => tribe),
      ),
      shortNames,
      fullName: full,
      age: Number.parseInt(row[ageCol]?.text ?? '', 10) || null,
      hometown: row[fromCol]?.text ?? null,
      finishText: placementText,
      dayLabel: row[dayCol]?.text ?? '',
    };
  });
}

/**
 * "September 23, 2026" → that evening's 8 PM Eastern air slot. The page gives
 * only the day; the time is when CBS airs the show. Pinned to Eastern Daylight
 * Time even after the clocks change, which makes a winter episode read an
 * hour early — the roster lock that hangs off it then closes an hour early,
 * the safe side of wrong.
 */
function parseAirDate(text: string): Date | null {
  const parsed = new Date(`${text} 20:00:00 GMT-0400`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

interface SummaryEpisode {
  number: number;
  airsAt: Date | null;
  rewardCells: string[];
  immunityCells: string[];
}

function parseSummary($: cheerio.CheerioAPI): SummaryEpisode[] {
  const table = findTable($, /season summary/i);
  if (!table) return [];
  const grid = expandTable($, table);
  const header = grid[1] ?? grid[0];
  const col = (label: RegExp) => header.findIndex((c) => label.test(c.text));
  const noCol = col(/^no\.?$/i);
  const dateCol = col(/air ?date/i);
  const rewardCol = col(/reward/i);
  const immunityCol = col(/immunity/i);
  if (noCol === -1) return [];

  const byNumber = new Map<number, SummaryEpisode>();
  for (const row of grid.slice(2)) {
    const number = Number.parseInt(row[noCol]?.text ?? '', 10);
    if (!Number.isFinite(number)) continue;
    let episode = byNumber.get(number);
    if (!episode) {
      episode = {
        number,
        airsAt: parseAirDate(row[dateCol]?.text ?? ''),
        rewardCells: [],
        immunityCells: [],
      };
      byNumber.set(number, episode);
    }
    // A three-tribe episode is three rows; each tribe's cells appear once.
    const reward = row[rewardCol]?.text;
    const immunity = row[immunityCol]?.text;
    if (reward && !episode.rewardCells.includes(reward)) episode.rewardCells.push(reward);
    if (immunity && !episode.immunityCells.includes(immunity)) episode.immunityCells.push(immunity);
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

interface TribalColumn {
  episode: number;
  phase: string;
  eliminated: string;
  votesText: string;
  /** "Vote" for a tribal council, "Challenge" for the fire-making round. */
  kind: string;
  /** voter short name → what is written in their cell. */
  ballots: Map<string, string>;
}

function parseVotingHistory($: cheerio.CheerioAPI): TribalColumn[] {
  const table = findTable($, /voting history/i);
  if (!table) return [];
  const grid = expandTable($, table);
  const rowNamed = (label: RegExp) => grid.find((row) => label.test(row[0]?.text ?? ''));
  const episodeRow = rowNamed(/^episode/i);
  const eliminatedRow = rowNamed(/^eliminated/i);
  const votesRow = rowNamed(/^votes?$/i);
  const voterRow = rowNamed(/^voter/i);
  if (!episodeRow || !voterRow) return [];
  const phaseRow = grid[0];
  const voterRows = grid.slice(grid.indexOf(voterRow) + 1).filter((row) => row[0]?.text && row[0].origin);

  const columns: TribalColumn[] = [];
  for (let c = 1; c < episodeRow.length; c += 1) {
    const episode = Number.parseInt(episodeRow[c]?.text ?? '', 10);
    if (!Number.isFinite(episode)) continue;
    const ballots = new Map<string, string>();
    for (const row of voterRows) ballots.set(row[0].text, row[c]?.text ?? '');
    columns.push({
      episode,
      phase: norm(phaseRow[c]?.text ?? ''),
      eliminated: eliminatedRow?.[c]?.text ?? '',
      votesText: votesRow?.[c]?.text ?? '',
      kind: voterRow[c]?.text ?? 'Vote',
      ballots,
    });
  }
  return columns;
}

/**
 * The final tribal council's tally. The table lists the finalists across
 * the top and a single "5–2–1" cell under them, in the same order; the
 * jurors' own rows carry only check marks.
 */
function parseJuryVotes($: cheerio.CheerioAPI): Array<{ name: string; count: number }> {
  const table = $('table.wikitable')
    .toArray()
    .find((t) => /^jury vote/i.test($(t).find('tr').first().text().trim()));
  if (!table) return [];
  const grid = expandTable($, table);
  const finalists = grid.find((row) => /^finalist/i.test(row[0]?.text ?? ''));
  const votes = grid.find((row) => /^votes?$/i.test(row[0]?.text ?? ''));
  if (!finalists || !votes) return [];
  const names = finalists
    .slice(1)
    .filter((cell) => cell.origin)
    .map((cell) => cell.text);
  const tally = (votes[1]?.text ?? '').split(/[–—-]/).map((n) => Number.parseInt(n.trim(), 10));
  return names.map((name, i) => ({ name, count: Number.isFinite(tally[i]) ? tally[i] : 0 }));
}

/** "original tribes" → "original"; "first switch" → "firstswitch"; "merged tribe" → "merged". */
function phaseKey(phase: string): string {
  if (phase.startsWith('merge')) return 'merged';
  if (phase.startsWith('original')) return 'original';
  return phase.replace(/tribes?$/, '');
}

function exitKind(votesText: string, columnKind: string): SurvivorExit['how'] {
  if (/evacuat|medic/i.test(votesText)) return 'evacuated';
  if (/quit|withdr/i.test(votesText)) return 'quit';
  if (/challenge|fire/i.test(columnKind)) return 'fire';
  if (/\d/.test(votesText)) return 'voted';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

/**
 * The network's "Meet the cast" article: one image per castaway, the name
 * in the alt text. Matched on the surname plus either the first name or the
 * nickname, in any order, so 'Angelica “Jelly” Loblack' finds both
 * "Angelica Loblack Survivor 51" and "Jelly Loblack".
 */
export function parseCastPhotos(html: string): Map<string, string> {
  const $ = cheerio.load(html);
  const photos = new Map<string, string>();
  $('article img, main img').each((_, img) => {
    const alt = $(img).attr('alt') ?? '';
    const src = $(img).attr('src') ?? $(img).attr('data-src') ?? '';
    // "Aaliyah Puglia Survivor 51", "Alexis Levine Survivor 51 Castaway",
    // "An “Thien An” Nguyen in Survivor 51" — and not the hero image or the
    // related-article thumbnails, whose alts are headlines.
    if (!alt || !src || !/(castaway|survivor \d+)\s*$/i.test(alt)) return;
    const absolute = src.startsWith('http') ? src : `https://www.paramountplus.com${src}`;
    photos.set(norm(alt.replace(/\b(in|survivor|castaway|season|\d+)\b/gi, ' ')), absolute);
  });
  return photos;
}

function photoFor(photos: Map<string, string>, fullName: string): string | undefined {
  const { first, nickname, last } = splitName(fullName);
  if (!last) return undefined;
  const lastKey = norm(last);
  const firstKeys = [first, nickname].filter(Boolean).map((s) => norm(s as string));
  for (const [key, url] of photos) {
    if (key.includes(lastKey) && firstKeys.some((f) => key.includes(f))) return url;
  }
  // "Joseph Hunter" for Wikipedia's "Joe Hunter": the surname alone will do
  // when it names exactly one person on the page.
  const bySurname = [...photos.entries()].filter(([key]) => key.includes(lastKey));
  return bySurname.length === 1 ? bySurname[0][1] : undefined;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const wikipediaSurvivorAdapter: SeasonSourceAdapter<SurvivorSeasonFacts> & {
  castPhotosUrl(seasonExternalId: string): string;
  /** Pure: the same parse, with an already-fetched photos page attached. */
  parseSeasonWithPhotos(html: string, sourceUrl: string, photosHtml: string | null): SurvivorSeasonFacts;
} = {
  slug: SLUG,
  showSlug: 'survivor',

  seasonUrl(seasonExternalId: string): string {
    return `${WIKI_BASE}${articleTitle(seasonExternalId)}`;
  },

  castPhotosUrl(seasonExternalId: string): string {
    const pinned = CAST_PHOTO_PAGES[seasonExternalId];
    if (pinned) return pinned;
    const number = articleTitle(seasonExternalId).replace('Survivor_', '');
    return `${CAST_PHOTOS_BASE}survivor-season-${number}-cast/`;
  },

  parseSeason(html: string, sourceUrl: string): SurvivorSeasonFacts {
    return this.parseSeasonWithPhotos(html, sourceUrl, null);
  },

  parseSeasonWithPhotos(html: string, sourceUrl: string, photosHtml: string | null): SurvivorSeasonFacts {
    const $ = cheerio.load(html);
    const seasonLabel = $('h1').first().text().trim();

    const cast = parseContestants($);
    if (cast.length === 0) {
      throw new IngestionError(
        `Parsed no contestants from ${sourceUrl} — the page layout has probably changed.`,
        SLUG,
      );
    }
    if (photosHtml) {
      const photos = parseCastPhotos(photosHtml);
      for (const member of cast) member.photoUrl = photoFor(photos, member.fullName);
    }

    const resolver = new NameResolver(cast);
    const tribeNames = new Set(cast.flatMap((m) => Object.values(m.tribes)));
    const summary = parseSummary($);
    const columns = parseVotingHistory($);

    // Which phase each episode was played in, from the voting history's own
    // header; the tribe a person was on then comes from the cast table.
    const phaseByEpisode = new Map<number, string>();
    for (const column of columns) {
      if (column.phase && !phaseByEpisode.has(column.episode)) {
        phaseByEpisode.set(column.episode, phaseKey(column.phase));
      }
    }
    // A season summary can name episodes the voting history has not reached
    // (or the reverse); the union is the schedule.
    const episodeNumbers = [
      ...new Set([...summary.map((e) => e.number), ...columns.map((c) => c.episode)]),
    ].sort((a, b) => a - b);
    const membersOf = (tribe: string, episode: number): Contestant[] => {
      const phase = phaseByEpisode.get(episode) ?? 'original';
      return cast.filter((m) => norm(m.tribes[phase] ?? '') === norm(tribe));
    };
    const winners = (
      cells: string[],
      episode: number,
    ): { individual: Contestant[]; tribal: Contestant[] } => {
      const individual: Contestant[] = [];
      const tribal: Contestant[] = [];
      for (const cell of cells) {
        for (const part of cell.split(/,|&|\band\b/)) {
          const name = part.replace(/\([^)]*\)/g, '').trim();
          if (!name || /^none$/i.test(name)) continue;
          if (tribeNames.has(name)) {
            for (const m of membersOf(name, episode)) if (!tribal.includes(m)) tribal.push(m);
          } else {
            const m = resolver.resolve(name);
            if (m && !individual.includes(m)) individual.push(m);
          }
        }
      }
      return { individual, tribal };
    };

    const mergeEpisode = columns.find((c) => phaseKey(c.phase) === 'merged')?.episode ?? null;

    const weeks: SurvivorEpisodeResult[] = episodeNumbers.map((number) => {
      const fromSummary = summary.find((e) => e.number === number);
      const tribals = columns.filter((c) => c.episode === number);

      const exits: SurvivorExit[] = [];
      const voteCounts = new Map<Contestant, number>();
      const correct = new Set<Contestant>();
      let fireWinner: Contestant | null = null;
      for (const tribal of tribals) {
        // "Chrissy & Coach" is a double boot in one cell; a tied vote is two
        // columns with the same name and one departure.
        const gone = tribal.eliminated
          .split(/,|&|\band\b/)
          .map((part) => resolver.resolve(part))
          .filter((m): m is Contestant => m !== null);
        for (const member of gone) {
          if (!exits.some((e) => e.player.externalId === member.externalId)) {
            exits.push({ player: ref(member), how: exitKind(tribal.votesText, tribal.kind) });
          }
        }
        const isFire = /challenge|fire/i.test(tribal.kind);
        for (const [voter, ballot] of tribal.ballots) {
          if (isFire) {
            // The fire-making column has no votes: each finalist's cell says
            // Won, Lost, Immune or Saved, and the name is on the row.
            if (/^won$/i.test(ballot)) fireWinner = resolver.resolve(voter);
            continue;
          }
          const target = resolver.resolve(ballot);
          if (!target) continue;
          voteCounts.set(target, (voteCounts.get(target) ?? 0) + 1);
          if (gone.includes(target)) {
            const who = resolver.resolve(voter);
            if (who) correct.add(who);
          }
        }
      }

      const reward = winners(fromSummary?.rewardCells ?? [], number);
      const immunity = winners(fromSummary?.immunityCells ?? [], number);

      const aired =
        exits.length > 0 ||
        voteCounts.size > 0 ||
        reward.individual.length +
          reward.tribal.length +
          immunity.individual.length +
          immunity.tribal.length >
          0;

      return {
        weekLabel: `E${number}`,
        weekNumber: number,
        aired,
        airsAt: fromSummary?.airsAt ?? null,
        eliminated: exits.map((e) => e.player),
        exits,
        immunity: immunity.individual.map(ref),
        tribalImmunity: immunity.tribal.map(ref),
        reward: reward.individual.map(ref),
        tribalReward: reward.tribal.map(ref),
        idolsPlayed: [],
        votes: [...voteCounts.entries()].map(([member, count]) => ({ player: ref(member), count })),
        correctVoters: [...correct].map(ref),
        fireMakingWinner: fireWinner ? ref(fireWinner) : null,
      };
    });

    // How each person left, for their status label; "voted" is the show's
    // default word and needs no note.
    const EXIT_LABEL: Record<SurvivorExit['how'], string | null> = {
      voted: null,
      fire: 'Lost fire-making',
      evacuated: 'Evacuated',
      quit: 'Quit',
      unknown: null,
    };
    const exitByPlayer = new Map<string, string>();
    for (const week of weeks) {
      for (const exit of week.exits) {
        const label = EXIT_LABEL[exit.how];
        if (label) exitByPlayer.set(exit.player.externalId, label);
      }
    }

    const placements: RawPlacementEntry[] = cast
      .filter((m) => m.placeLabel)
      .map((m, i) => ({
        order: i + 1,
        player: ref(m),
        dateLabel: '',
        dayLabel: m.dayLabel,
        placeLabel: m.placeLabel as string,
      }));

    const airDates = summary.map((e) => e.airsAt).filter((d): d is Date => d !== null);

    return {
      sourceSlug: SLUG,
      sourceUrl,
      seasonLabel,
      premiereDate: airDates[0] ?? null,
      finaleDate: airDates.length > 1 ? airDates[airDates.length - 1] : null,
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
          tribe: m.tribes.original ?? null,
          finish: m.finishText || null,
          exit: exitByPlayer.get(m.externalId) ?? null,
        },
      })),
      mergeEpisode,
      juryVotes: parseJuryVotes($).flatMap(({ name, count }) => {
        const member = resolver.resolve(name);
        return member ? [{ player: ref(member), count }] : [];
      }),
      fetchedAt: new Date(),
    };
  },

  async fetchSeason(seasonExternalId: string): Promise<SurvivorSeasonFacts> {
    const url = this.seasonUrl(seasonExternalId);
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' } });
    if (!response.ok) throw new IngestionError(`${url} returned ${response.status}`, SLUG);
    const html = await response.text();

    // Photos are a bonus, never a reason to fail a sync.
    let photosHtml: string | null = null;
    try {
      const photos = await fetch(this.castPhotosUrl(seasonExternalId), {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      });
      if (photos.ok) photosHtml = await photos.text();
    } catch {
      photosHtml = null;
    }

    return this.parseSeasonWithPhotos(html, url, photosHtml);
  },
};
