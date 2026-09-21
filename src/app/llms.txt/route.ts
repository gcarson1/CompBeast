import { prisma } from '@/lib/db';
import { HOME_PATH, SITE_DESCRIPTION, SITE_NAME, isSyntheticSeason } from '@/lib/seo';
import { appBaseUrl } from '@/lib/site';

/** Hourly, like the sitemap: the season list is the only part that moves. */
export const revalidate = 3600;

/**
 * `/llms.txt` — the llmstxt.org convention: a short Markdown brief that tells
 * a language model what this site is and which pages are worth reading, in
 * the order to read them. Where robots.txt says what a crawler *may* fetch,
 * this says what it *should*, and why.
 *
 * Written from the same constants as the page metadata and the JSON-LD so
 * the description a model reads here is the one it will find on the page.
 */
export async function GET() {
  const base = appBaseUrl();

  let seasons: Array<{ slug: string; name: string; year: number; status: string; show: { name: string } }> =
    [];
  try {
    seasons = await prisma.season.findMany({
      orderBy: [{ year: 'desc' }, { name: 'desc' }],
      select: { slug: true, name: true, year: true, status: true, show: { select: { name: true } } },
    });
  } catch (error) {
    console.error('[llms.txt] could not list seasons', error);
  }

  const real = seasons.filter((s) => !isSyntheticSeason(s.slug));
  const open = real.filter((s) => s.status !== 'COMPLETED');
  const archived = real.filter((s) => s.status === 'COMPLETED');

  const seasonLine = (s: (typeof seasons)[number]) => {
    const state = s.status === 'ACTIVE' ? 'airing now' : s.status === 'UPCOMING' ? 'upcoming' : 'finished';
    return `- [${s.name}](${base}/seasons/${s.slug}): ${s.show.name}, ${s.year}, ${state}. Every contestant ranked by fantasy points, with how they actually placed.`;
  };

  const lines = [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    `${SITE_NAME} is a web app; it is free to play and runs in any browser. Leagues hold 2 to 24 teams, each team drafts 1 to 12 contestants in a live snake draft, and every league scores with one of three rulesets (Classic, Balanced, Drama & Social). Results are captured from published season results and every point traces back to the aired event that produced it.`,
    '',
    '## Start here',
    '',
    `- [Home](${base}${HOME_PATH}): what Comp Beast is, how a league works, the scoring table, a comparison with a spreadsheet league, and the FAQ.`,
    `- [Scoring rules](${base}/rules): every scored event for every show — Big Brother, Survivor — with its point value under each of the three rulesets.`,
    `- [Seasons](${base}/seasons): the seasons open for leagues and the finished-season archive.`,
    '',
  ];

  if (open.length > 0) {
    lines.push('## Seasons open for leagues', '', ...open.map(seasonLine), '');
  }
  if (archived.length > 0) {
    lines.push('## Finished seasons (read-only archive)', '', ...archived.map(seasonLine), '');
  }

  lines.push(
    '## Optional',
    '',
    `- [Sitemap](${base}/sitemap.xml): every public URL, including one page per contestant.`,
    '',
    '## Not for indexing',
    '',
    'League pages, team pages, accounts, notifications and the API are personal to their members and are excluded in robots.txt.',
    '',
  );

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
