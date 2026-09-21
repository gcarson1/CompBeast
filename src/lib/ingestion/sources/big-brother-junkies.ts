import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import {
  IngestionError,
  type BigBrotherSeasonFacts,
  type BigBrotherWeekResult,
  type RawCastMember,
  type RawPlacementEntry,
  type RawPlayerRef,
  type SeasonSourceAdapter,
} from '../types';

const SLUG = 'big-brother-junkies';
const BASE_URL = 'https://bigbrotherjunkies.com';
const PLAYER_PATH = '/bigbrother-players/';

/**
 * Identifies this client honestly rather than impersonating a browser. The
 * site's robots.txt permits these pages; a real UA string means they can
 * contact us or block us deliberately instead of guessing at the traffic.
 */
const USER_AGENT = 'CompBeastBot/0.1 (+https://github.com/gcarson1/CompBeast)';

/**
 * The weekly grid renders four cells per row in a fixed column order. There is
 * no per-cell class to key off, so position is the only signal available.
 */
const WEEK_COLUMNS = ['hoh', 'veto', 'nominees', 'eliminated'] as const;

/** Extracts the source's player slug from an href. */
function playerIdFromHref(href: string | undefined): string | null {
  if (!href) return null;
  const index = href.indexOf(PLAYER_PATH);
  if (index === -1) return null;
  return href.slice(index + PLAYER_PATH.length).split(/[?#/]/)[0] || null;
}

/**
 * Cast photos are served through Next.js's image optimizer
 * (`/_next/image?url=<encoded-original>&w=...&q=75`), so the attribute value
 * itself is a relative path scoped to their proxy, not a portable URL. The
 * original file the `url` param points at is what's stable to store.
 */
function photoUrlFromCard($: cheerio.CheerioAPI, card: Element): string | undefined {
  const img = $(card).find('img').first();
  const raw = img.attr('src') || img.attr('srcset');
  if (!raw) return undefined;

  const proxied = /[?&]url=([^&\s]+)/.exec(raw);
  if (proxied) {
    try {
      const decoded = decodeURIComponent(proxied[1]);
      return decoded.startsWith('http') ? decoded : undefined;
    } catch {
      return undefined;
    }
  }

  return raw.startsWith('http') ? raw : undefined;
}

function playersInCell($: cheerio.CheerioAPI, cell: Element): RawPlayerRef[] {
  const players: RawPlayerRef[] = [];
  $(cell)
    .find(`a[href*="${PLAYER_PATH}"]`)
    .each((_, anchor) => {
      const externalId = playerIdFromHref($(anchor).attr('href'));
      // `title` carries the full legal name even where the visible label is a
      // nickname, so it is the better source for matching.
      const name = ($(anchor).attr('title') ?? $(anchor).find('img').attr('alt') ?? '').trim();
      if (externalId && name) players.push({ externalId, name });
    });
  return players;
}

export const bigBrotherJunkiesAdapter: SeasonSourceAdapter<BigBrotherSeasonFacts> = {
  slug: SLUG,
  showSlug: 'big-brother',

  seasonUrl(seasonExternalId: string): string {
    return `${BASE_URL}/bigbrother-seasons/${seasonExternalId}`;
  },

  parseSeason(html: string, sourceUrl: string): BigBrotherSeasonFacts {
    const $ = cheerio.load(html);

    const seasonLabel = $('h1').first().text().trim();

    // Premiere/finale live in a <dl> of season facts. Used to schedule cycles,
    // since the results grid carries no dates of its own.
    const facts = new Map<string, string>();
    $('section#overview dl dt').each((_, term) => {
      const key = $(term).text().trim().toLowerCase();
      const value = $(term).next('dd').text().trim();
      if (key && value) facts.set(key, value);
    });

    const parseDate = (value: string | undefined): Date | null => {
      if (!value) return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    // --- Weekly results ----------------------------------------------------
    // The first grid row is the header; data rows follow. Each row is
    // [week label, HoH cell, Veto cell, Noms cell, Evicted cell].
    const weeks: BigBrotherWeekResult[] = [];
    const weeklySection = $('section#weekly-results');

    weeklySection.find('div.grid').each((_, row) => {
      const weekLabel = $(row).children('span').first().text().trim();
      const match = /^W\s*(\d+)$/i.exec(weekLabel);
      if (!match) return; // header row, or not a week row

      const cells = $(row).children('div').toArray();
      const week: BigBrotherWeekResult = {
        weekLabel,
        weekNumber: Number(match[1]),
        aired: false,
        hoh: [],
        veto: [],
        nominees: [],
        eliminated: [],
      };

      WEEK_COLUMNS.forEach((column, index) => {
        const cell = cells[index];
        if (cell) week[column] = playersInCell($, cell);
      });

      // A live season's grid includes scheduled weeks that have not aired;
      // they parse as an entirely empty row.
      week.aired = WEEK_COLUMNS.some((column) => week[column].length > 0);

      weeks.push(week);
    });

    weeks.sort((a, b) => a.weekNumber - b.weekNumber);

    // --- Eviction order ----------------------------------------------------
    const placements: RawPlacementEntry[] = [];
    $('section#evictions tbody tr').each((_, row) => {
      const cells = $(row).find('td');
      const anchor = $(cells[1]).find(`a[href*="${PLAYER_PATH}"]`).first();
      const externalId = playerIdFromHref(anchor.attr('href'));
      if (!externalId) return;

      // Houseguests still in the house occupy rows with no number.
      const rawOrder = Number($(cells[0]).text().trim());

      placements.push({
        order: Number.isFinite(rawOrder) ? rawOrder : null,
        player: { externalId, name: anchor.text().trim() },
        dateLabel: $(cells[2]).text().trim(),
        dayLabel: $(cells[3]).text().trim(),
        placeLabel: $(cells[4]).text().trim(),
      });
    });

    // --- Cast --------------------------------------------------------------
    const cast: RawCastMember[] = [];
    $('section#cast a.c').each((_, card) => {
      const externalId = playerIdFromHref($(card).attr('href'));
      const name = ($(card).attr('title') ?? '').trim();
      if (!externalId || !name) return;

      cast.push({
        externalId,
        name,
        photoUrl: photoUrlFromCard($, card),
        statusLabel: $(card).find('.tag').first().text().trim() || null,
        placeLabel: $(card).find('.s').first().text().trim() || null,
      });
    });

    if (weeks.length === 0 && cast.length === 0) {
      throw new IngestionError(
        `Parsed no weeks and no cast from ${sourceUrl} — the page layout has probably changed.`,
        SLUG,
      );
    }

    return {
      sourceSlug: SLUG,
      sourceUrl,
      seasonLabel,
      premiereDate: parseDate(facts.get('premiere')),
      finaleDate: parseDate(facts.get('finale')),
      weeks,
      placements,
      cast,
      fetchedAt: new Date(),
    };
  },

  async fetchSeason(seasonExternalId: string): Promise<BigBrotherSeasonFacts> {
    const url = this.seasonUrl(seasonExternalId);
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    });

    if (!response.ok) {
      throw new IngestionError(`${url} returned ${response.status}`, SLUG);
    }

    return this.parseSeason(await response.text(), url);
  },
};
