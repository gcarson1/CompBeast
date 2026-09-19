import * as cheerio from 'cheerio';
import type { SocialPost, SocialSourceId } from './types';

/**
 * One parser for both RSS 2.0 (`<item>`) and Atom (`<entry>`).
 *
 * Pure: XML string in, posts out, no fetching. That is what lets the tests run
 * against saved fixtures and never touch the network — the same split the
 * ingestion adapters use.
 *
 * Deliberately tolerant. These are third-party feeds that change shape without
 * warning, so a missing field drops one item rather than throwing and taking
 * the whole panel down with it.
 */
export function parseFeed(xml: string, source: SocialSourceId, limit = 12): SocialPost[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const nodes = $('item').length > 0 ? $('item') : $('entry');

  const posts: SocialPost[] = [];
  nodes.each((_, node) => {
    if (posts.length >= limit) return;
    const el = $(node);

    // Atom puts the URL in link/@href; RSS puts it in the element's text.
    const url = el.find('link').first().attr('href') ?? el.find('link').first().text().trim();
    const rawTitle = el.find('title').first().text().trim();
    if (!url || !rawTitle) return;

    const published =
      el.find('pubDate').first().text().trim() ||
      el.find('published').first().text().trim() ||
      el.find('updated').first().text().trim();
    const publishedAt = published ? new Date(published) : null;
    // An unparseable date would sort to the top of the list as Invalid Date.
    if (!publishedAt || Number.isNaN(publishedAt.getTime())) return;

    // Google News appends " - Outlet" to every headline and repeats it in
    // <source>. Showing both reads as a stutter, so the suffix comes off and
    // the outlet becomes the byline.
    const outlet = el.find('source').first().text().trim();
    const author =
      el.find('author name').first().text().trim() ||
      el.find('author').first().text().trim() ||
      el.find('creator').first().text().trim() ||
      outlet ||
      null;

    let title = rawTitle;
    if (outlet && title.endsWith(` - ${outlet}`)) {
      title = title.slice(0, -(outlet.length + 3)).trim();
    }

    posts.push({
      id: el.find('guid').first().text().trim() || el.find('id').first().text().trim() || url,
      title,
      url,
      author: author || null,
      publishedAt,
      source,
    });
  });

  return posts.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}
