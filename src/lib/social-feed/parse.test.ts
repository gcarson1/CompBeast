import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFeed } from './parse';

/**
 * Parsed against saved fixtures, never the network — the same rule the
 * ingestion parser tests follow. A test that depends on a third party being
 * up and unchanged is a test that fails for reasons that are not your bug.
 */
const fixture = (name: string) =>
  readFileSync(join(__dirname, '__fixtures__', name), 'utf8');

describe('RSS 2.0 (the show feed)', () => {
  const posts = parseFeed(fixture('bbjunkies-feed.xml'), 'show-feed');

  it('reads every item', () => {
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((p) => p.title && p.url)).toBe(true);
  });

  it('keeps the direct article link rather than a redirect', () => {
    expect(posts[0].url).toMatch(/^https:\/\/bigbrotherjunkies\.com\//);
  });

  it('pulls the byline out of <author>', () => {
    expect(posts.some((p) => p.author && p.author.length > 0)).toBe(true);
  });

  it('parses every date, so nothing sorts as Invalid Date', () => {
    expect(posts.every((p) => !Number.isNaN(p.publishedAt.getTime()))).toBe(true);
  });

  it('returns newest first', () => {
    const times = posts.map((p) => p.publishedAt.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });
});

describe('Google News', () => {
  const posts = parseFeed(fixture('google-news.xml'), 'news');

  it('reads the headlines', () => {
    expect(posts.length).toBeGreaterThan(0);
  });

  it('strips the " - Outlet" suffix and uses it as the byline instead', () => {
    // Google repeats the outlet in <source>, so leaving it on the headline
    // renders it twice in the same row.
    const withOutlet = posts.find((p) => p.author);
    expect(withOutlet).toBeDefined();
    expect(withOutlet!.title.endsWith(` - ${withOutlet!.author}`)).toBe(false);
  });

  it('tags the source it came from', () => {
    expect(posts.every((p) => p.source === 'news')).toBe(true);
  });
});

describe('resilience', () => {
  it('returns nothing for junk rather than throwing', () => {
    // These feeds change shape without warning; the panel degrading is fine,
    // the page crashing is not.
    expect(parseFeed('', 'news')).toEqual([]);
    expect(parseFeed('<html><body>nope</body></html>', 'news')).toEqual([]);
    expect(parseFeed('<rss><channel></channel></rss>', 'news')).toEqual([]);
  });

  it('drops an item missing a link or title instead of emitting a broken row', () => {
    const xml = `<rss><channel>
      <item><title>No link here</title><pubDate>Sat, 19 Sep 2026 12:00:00 GMT</pubDate></item>
      <item><link>https://example.invalid/a</link><pubDate>Sat, 19 Sep 2026 12:00:00 GMT</pubDate></item>
      <item><title>Good</title><link>https://example.invalid/b</link><pubDate>Sat, 19 Sep 2026 12:00:00 GMT</pubDate></item>
    </channel></rss>`;
    const posts = parseFeed(xml, 'news');
    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe('Good');
  });

  it('drops an item whose date will not parse', () => {
    const xml = `<rss><channel>
      <item><title>Bad date</title><link>https://example.invalid/a</link><pubDate>whenever</pubDate></item>
    </channel></rss>`;
    expect(parseFeed(xml, 'news')).toEqual([]);
  });

  it('honours the limit', () => {
    expect(parseFeed(fixture('bbjunkies-feed.xml'), 'show-feed', 3)).toHaveLength(3);
  });
});
