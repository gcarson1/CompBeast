import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';

/**
 * What every Wikipedia season adapter needs: tables as plain grids, names
 * as the short forms the tables use, and air dates in Eastern time. Shared
 * by the Survivor and The Traitors adapters, whose articles are built from
 * the same templates.
 */

export const WIKI_BASE = 'https://en.wikipedia.org/wiki/';

/** Identifies this client honestly; Wikipedia's robots policy welcomes a bot that does. */
export const USER_AGENT = 'CompBeastBot/0.1 (+https://github.com/gcarson1/CompBeast)';

export interface Cell {
  text: string;
  /** The text before the cell's first line break — a name without what follows it. */
  firstLine: string;
  /** True for the cell's top-left origin; a spanned copy is false. */
  origin: boolean;
  /** The cell's inline background, lower-cased with spaces removed — some tables say who was a Traitor only in colour. */
  background: string;
}

/**
 * A table as a rectangle. A cell that spans rows or columns is copied into
 * every position it covers, so column N means the same thing on every row
 * whatever the spans above it did.
 */
export function expandTable($: cheerio.CheerioAPI, table: Element): Cell[][] {
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
          // Line breaks and list items separate names in a list; footnote
          // markers ([a], [1]) and the "[Name]" add-on notation are dropped.
          $(cell).find('br').replaceWith(', ');
          $(cell)
            .find('li')
            .each((__, li) => {
              $(li).append(', ');
            });
          // Footnote markers, and the stylesheets some templates inline into
          // the cell (their CSS would otherwise read as text).
          $(cell).find('sup, style').remove();
          const text = clean($(cell).text());
          const background = (
            /background(?:-color)?\s*:\s*([^;]+)/i.exec($(cell).attr('style') ?? '')?.[1] ?? ''
          )
            .replace(/\s/g, '')
            .toLowerCase();
          for (let i = 0; i < rowspan; i += 1) {
            grid[r + i] = grid[r + i] ?? [];
            for (let j = 0; j < colspan; j += 1) {
              grid[r + i][c + j] = { text, firstLine, origin: i === 0 && j === 0, background };
            }
          }
          c += colspan;
        });
    });
  return grid.filter((row) => row.length > 0);
}

export function clean(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/(,\s*)+/g, ', ')
    .replace(/(^,\s*|,\s*$)/g, '')
    .trim();
}

export function findTable($: cheerio.CheerioAPI, captionPattern: RegExp): Element | null {
  const tables = $('table.wikitable').toArray();
  return tables.find((table) => captionPattern.test($(table).find('caption').first().text())) ?? null;
}

export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** "Kimberly "Annie" Davis" → { first: "Kimberly", nickname: "Annie", last: "Davis" }. */
export function splitName(full: string): { first: string; nickname: string | null; last: string } {
  const nickname = /["“”']([^"“”']+)["“”']/.exec(full)?.[1] ?? null;
  const parts = full
    .replace(/["“”']([^"“”']+)["“”']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ');
  return { first: parts[0] ?? '', nickname, last: parts.slice(1).join(' ') };
}

export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/["“”']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

/**
 * Resolves the short names a season's tables use ("Annie", "Rob R.", "Bob
 * TDQ") to people. Built from each person's own short forms, so a season
 * with two Robs resolves "Rob R." and refuses a bare "Rob".
 */
export class NameResolver<T extends { shortNames: string[] }> {
  private readonly byShort = new Map<string, T[]>();

  constructor(people: T[]) {
    for (const person of people) {
      for (const short of person.shortNames) {
        const key = norm(short);
        if (!key) continue;
        const list = this.byShort.get(key) ?? [];
        list.push(person);
        this.byShort.set(key, list);
      }
    }
  }

  resolve(short: string): T | null {
    const cleaned = short.replace(/\([^)]*\)/g, '').trim();
    if (!cleaned) return null;
    const matches = this.byShort.get(norm(cleaned)) ?? [];
    // One person, or the same person listed under two of their own short
    // names; two different people is an ambiguity the page would not leave.
    const distinct = [...new Set(matches)];
    return distinct.length === 1 ? distinct[0] : null;
  }
}

/**
 * "January 8, 2026" at `hour` o'clock Eastern — the page gives only the day;
 * the hour is when the network airs the show. The offset is worked out for
 * that date, so an episode in November reads as Eastern Standard Time and one
 * in September as Daylight Time.
 */
export function easternAirTime(dateText: string, hour: number): Date | null {
  const day = new Date(`${dateText} 12:00:00 UTC`);
  if (Number.isNaN(day.getTime())) return null;
  const offset =
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
      .formatToParts(day)
      .find((part) => part.type === 'timeZoneName')
      ?.value.replace('GMT', '') || '-5';
  const [h, m = '0'] = offset.split(':');
  const sign = h.startsWith('-') ? '-' : '+';
  const hours = String(Math.abs(Number.parseInt(h, 10))).padStart(2, '0');
  const iso = `${day.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:00:00${sign}${hours}:${m.padStart(2, '0')}`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
