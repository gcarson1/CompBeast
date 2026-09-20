import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';
import { HOME_PATH, isSyntheticSeason } from '@/lib/seo';
import { appBaseUrl } from '@/lib/site';

/**
 * Regenerated hourly rather than per request: a sitemap is fetched by every
 * crawler that finds it, and a season's slug list changes a few times a year.
 */
export const revalidate = 3600;

/**
 * Every public URL, and nothing else. League and team pages are deliberately
 * absent — see robots.ts — as are the redirect-only routes (`/`, `/players`).
 *
 * `lastModified` is left off: nothing here carries a reliable modified-at, and
 * a date that is wrong is worse to a crawler than no date at all.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appBaseUrl();

  const fixed: MetadataRoute.Sitemap = [
    { url: `${base}${HOME_PATH}`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/seasons`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/rules`, changeFrequency: 'monthly', priority: 0.7 },
  ];

  let seasons: Array<{ slug: string; status: string; contestants: Array<{ id: string }> }>;
  try {
    seasons = await prisma.season.findMany({
      orderBy: [{ year: 'desc' }, { name: 'desc' }],
      select: { slug: true, status: true, contestants: { select: { id: true } } },
    });
  } catch (error) {
    // The fixed pages are still a valid sitemap. A database hiccup at build or
    // revalidate time should shrink the list for an hour, not fail the build.
    console.error('[sitemap] could not list seasons', error);
    return fixed;
  }

  const seasonEntries: MetadataRoute.Sitemap = seasons.flatMap((season) => {
    if (isSyntheticSeason(season.slug)) return [];
    // An airing season's scoreboard moves every week; an archive does not.
    const live = season.status !== 'COMPLETED';
    return [
      {
        url: `${base}/seasons/${season.slug}`,
        changeFrequency: live ? ('daily' as const) : ('yearly' as const),
        priority: live ? 0.9 : 0.5,
      },
      ...season.contestants.map((c) => ({
        url: `${base}/players/${c.id}`,
        changeFrequency: live ? ('weekly' as const) : ('yearly' as const),
        priority: live ? 0.6 : 0.3,
      })),
    ];
  });

  return [...fixed, ...seasonEntries];
}
