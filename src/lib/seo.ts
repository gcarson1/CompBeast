import { appBaseUrl } from './site';

/**
 * Everything a crawler is told about the site, defined once.
 *
 * Search engines and answer engines resolve a brand against a knowledge
 * graph by matching *identifiers* — the same name, the same URL, the same
 * `@id` — across every page and every source. The constants here are those
 * identifiers; `<head>` metadata, the JSON-LD graph, `robots.txt`, the
 * sitemap and `llms.txt` all read from this module so they can never say
 * three different things about the same thing.
 */

export const SITE_NAME = 'Comp Beast';

/**
 * The home page. `/` permanently redirects here (see next.config.js), so this
 * is the URL every canonical link, breadcrumb root and schema node points at.
 */
export const HOME_PATH = '/leagues';

export const SITE_DESCRIPTION =
  'Comp Beast is a free fantasy league app for reality competition TV — Big Brother, Survivor and The Traitors. Snake-draft the real cast with friends, score every competition win, blindside, murder and elimination as episodes air, and chase a live leaderboard all season.';

/**
 * The seed's demo season lives under the `demo-` slug namespace, which the
 * seed reserves so ingestion can never collide with it. It is browsable, but
 * it is not something to hand a search engine as a page worth indexing: the
 * sitemap and llms.txt skip it, and its sixteen synthetic houseguests with it.
 */
export function isSyntheticSeason(slug: string): boolean {
  return slug.startsWith('demo-');
}

export function absoluteUrl(path: string): string {
  return `${appBaseUrl()}${path}`;
}

/** Stable node ids so page-level schema can reference the site-wide nodes. */
export function organizationId(): string {
  return `${appBaseUrl()}/#organization`;
}

export function websiteId(): string {
  return `${appBaseUrl()}/#website`;
}

/**
 * Knowledge-graph anchors for the shows the app covers, keyed by `Show.slug`.
 *
 * `sameAs` is how a model disambiguates "Big Brother" the CBS series from the
 * novel, the UK edition or a dozen other things carrying the name. Shows are
 * rows in the database; this map is presentation metadata about them, which
 * is why it lives here rather than in the rule catalogue the seed consumes.
 */
const SHOW_ENTITIES: Record<string, { name: string; sameAs: string[] }> = {
  'big-brother': {
    name: 'Big Brother',
    sameAs: [
      'https://en.wikipedia.org/wiki/Big_Brother_(American_TV_series)',
      'https://www.cbs.com/shows/big_brother/',
    ],
  },
  survivor: {
    name: 'Survivor',
    sameAs: [
      'https://en.wikipedia.org/wiki/Survivor_(American_TV_series)',
      'https://www.cbs.com/shows/survivor/',
    ],
  },
  traitors: {
    name: 'The Traitors',
    sameAs: [
      'https://en.wikipedia.org/wiki/The_Traitors_(American_TV_series)',
      'https://www.peacocktv.com/stream-tv/the-traitors',
    ],
  },
};

export function tvSeriesNode(showSlug: string, showName: string) {
  const known = SHOW_ENTITIES[showSlug];
  return {
    '@type': 'TVSeries',
    name: known?.name ?? showName,
    ...(known ? { sameAs: known.sameAs } : {}),
  };
}

/**
 * The two nodes every page carries. Emitted from the root layout's `<head>`
 * so a crawler finds them before it reads a byte of body.
 */
export function siteGraph() {
  const base = appBaseUrl();
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId(),
        name: SITE_NAME,
        url: `${base}/`,
        logo: {
          '@type': 'ImageObject',
          url: `${base}/icon.svg`,
        },
        description: SITE_DESCRIPTION,
      },
      {
        '@type': 'WebSite',
        '@id': websiteId(),
        name: SITE_NAME,
        url: `${base}/`,
        inLanguage: 'en',
        publisher: { '@id': organizationId() },
      },
    ],
  };
}

export interface Crumb {
  name: string;
  path: string;
}

/** Home is always the first crumb, so callers pass only what comes after it. */
export function breadcrumbList(crumbs: Crumb[]) {
  const all: Crumb[] = [{ name: SITE_NAME, path: HOME_PATH }, ...crumbs];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: all.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/**
 * Serialises a node for a `<script type="application/ld+json">` body.
 *
 * `<` is escaped so a name that came out of the database — a league called
 * `</script><script>…` — can never close the tag early. JSON parsers read
 * `<` back as `<`, so the data is unchanged.
 */
export function serializeJsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
