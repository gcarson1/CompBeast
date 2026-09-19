import { parseFeed } from './parse';
import type { SocialBuzz, SocialPost } from './types';

/**
 * "What people are saying about the show right now."
 *
 * This replaces an embedded X timeline that did not work. X retired embedded
 * **search/hashtag** timelines: widgets.js parses `twitter.com/search?q=…` as
 * a *profile* for a user literally named "search", and the resulting iframe
 * renders at zero height. Profile timelines fared no better — X's own embed
 * generator at publish.x.com renders `@BigBrother` at zero height too, so this
 * was never something a code change on our side could fix.
 *
 * Server-side scraping of X is not an option either: syndication.twitter.com
 * answers unauthenticated requests from anything but a real browser with 429.
 * The only route to genuine X content is the paid API, which is why the `x`
 * source below exists and stays dormant until someone supplies a token.
 *
 * So the panel now reads RSS, on the server, cached. That is strictly better
 * than the embed even when the embed worked: no third-party script on the
 * main thread (widgets.js was the thing stalling the cast marquee), no iframe,
 * no client JavaScript at all, and it renders the same for signed-out
 * visitors as for everyone else.
 */

const FETCH_TIMEOUT_MS = 6_000;
/** Cached in Next's data cache. Long enough to be polite, short enough to feel live. */
const REVALIDATE_SECONDS = 900;

/**
 * Feeds that only make sense for one show, keyed by `Show.slug`.
 *
 * The platform core is show-agnostic and this keeps it that way: a show with
 * no entry here still gets the news source below, which is built from the
 * show's own name. Adding a show never requires touching this map.
 */
const SHOW_FEEDS: Record<string, { url: string; label: string; home: string }> = {
  'big-brother': {
    url: 'https://bigbrotherjunkies.com/feed/',
    label: 'Big Brother Junkies',
    home: 'https://bigbrotherjunkies.com',
  },
};

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        // Identify honestly, the same way the ingestion client does.
        'User-Agent': 'CompBeast/1.0 (+https://compbeast.vercel.app)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    // A slow or unreachable third party must not take the page down with it.
    return null;
  }
}

/**
 * Real X content, via the v2 recent-search endpoint.
 *
 * Dormant unless `X_BEARER_TOKEN` is set, because that endpoint is behind a
 * paid plan — there is no free tier that returns search results. Set the
 * variable and this becomes the primary source with no code change.
 */
async function fromX(hashtag: string): Promise<SocialBuzz | null> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return null;

  const url = new URL('https://api.x.com/2/tweets/search/recent');
  url.searchParams.set('query', `#${hashtag} -is:retweet lang:en`);
  url.searchParams.set('max_results', '12');
  url.searchParams.set('tweet.fields', 'created_at');
  url.searchParams.set('expansions', 'author_id');
  url.searchParams.set('user.fields', 'username');

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!response.ok) {
      console.error(`[social-feed] X API responded ${response.status}`);
      return null;
    }

    const body = (await response.json()) as {
      data?: Array<{ id: string; text: string; created_at?: string; author_id?: string }>;
      includes?: { users?: Array<{ id: string; username: string }> };
    };
    if (!body.data?.length) return null;

    const usernameById = new Map((body.includes?.users ?? []).map((u) => [u.id, u.username]));
    const posts: SocialPost[] = body.data.map((tweet) => ({
      id: tweet.id,
      title: tweet.text,
      url: `https://x.com/i/web/status/${tweet.id}`,
      author: tweet.author_id ? `@${usernameById.get(tweet.author_id) ?? 'someone'}` : null,
      publishedAt: tweet.created_at ? new Date(tweet.created_at) : new Date(),
      source: 'x' as const,
    }));

    return {
      posts,
      source: 'x',
      sourceLabel: `#${hashtag} on X`,
      sourceUrl: `https://x.com/search?q=%23${encodeURIComponent(hashtag)}&f=live`,
    };
  } catch (error) {
    console.error('[social-feed] X API unreachable', error);
    return null;
  }
}

async function fromShowFeed(showSlug: string): Promise<SocialBuzz | null> {
  const feed = SHOW_FEEDS[showSlug];
  if (!feed) return null;

  const xml = await fetchText(feed.url);
  if (!xml) return null;

  const posts = parseFeed(xml, 'show-feed');
  if (posts.length === 0) return null;
  return { posts, source: 'show-feed', sourceLabel: feed.label, sourceUrl: feed.home };
}

/**
 * The universal fallback: Google News, queried by the show's own name.
 *
 * Works for any show in the database without configuration, which is what
 * keeps this module from becoming a Big Brother special case.
 */
async function fromNews(showName: string): Promise<SocialBuzz | null> {
  const query = `"${showName}"`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

  const xml = await fetchText(url);
  if (!xml) return null;

  const posts = parseFeed(xml, 'news');
  if (posts.length === 0) return null;
  return {
    posts,
    source: 'news',
    sourceLabel: `${showName} headlines`,
    sourceUrl: `https://news.google.com/search?q=${encodeURIComponent(query)}`,
  };
}

const EMPTY: SocialBuzz = { posts: [], source: null, sourceLabel: null, sourceUrl: null };

/**
 * Tries each source in turn and returns the first that has anything.
 *
 * Ordered by how close it is to what was asked for: real X when there is a
 * token, then the show's own community site, then news. Falling through is
 * normal rather than exceptional — a third-party feed being briefly down
 * should downgrade the panel, never break the page.
 */
export async function getSocialBuzz(input: {
  showName: string;
  showSlug: string;
  hashtag: string;
}): Promise<SocialBuzz> {
  const attempts = [
    () => fromX(input.hashtag),
    () => fromShowFeed(input.showSlug),
    () => fromNews(input.showName),
  ];

  for (const attempt of attempts) {
    const result = await attempt();
    if (result && result.posts.length > 0) return result;
  }
  return EMPTY;
}

export type { SocialBuzz, SocialPost } from './types';
