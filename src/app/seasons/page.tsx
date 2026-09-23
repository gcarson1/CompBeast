import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { Collapsible } from '@/components/Collapsible';
import { ChevronRightIcon, LockIcon } from '@/components/icons';
import { JsonLd } from '@/components/JsonLd';
import { Reveal, RevealGroup } from '@/components/motion/Reveal';
import { SeasonPlate } from '@/components/SeasonPlate';
import { ShowTheme } from '@/components/ShowTheme';
import { Tag, type TagTone } from '@/components/Tag';
import { absoluteUrl, breadcrumbList } from '@/lib/seo';
import { lexiconFor, lower } from '@/lib/shows/lexicon';
import { getSeasonsByStatus } from '@/server/queries';

export const dynamic = 'force-dynamic';

// One query for both the metadata and the page: React's per-request cache
// is what lets `generateMetadata` read the same rows the render does.
const loadSeasons = cache(getSeasonsByStatus);

export async function generateMetadata(): Promise<Metadata> {
  const { open, archived } = await loadSeasons();
  const shows = [...new Set([...open, ...archived].map((s) => s.show.name))];
  const showList = shows.length > 0 ? shows.join(', ') : 'reality TV';
  return {
    title: `${showList} seasons`,
    description: `${showList} seasons you can start a Comp Beast fantasy league for right now — ${open.length} open — plus a read-only archive of ${archived.length} finished ${
      archived.length === 1 ? 'season' : 'seasons'
    } with every contestant ranked by fantasy points.`,
    alternates: { canonical: absoluteUrl('/seasons') },
  };
}

// A season on air wears the broadcast's red "live" bug; the rest are quiet.
const STATUS: Record<string, { label: string; tone: TagTone; live?: boolean }> = {
  ACTIVE: { label: 'Airing now', tone: 'red', live: true },
  UPCOMING: { label: 'Upcoming', tone: 'outline' },
  COMPLETED: { label: 'Finished', tone: 'ink' },
};

type SeasonRow = Awaited<ReturnType<typeof getSeasonsByStatus>>['open'][number];

/**
 * "22 players · 3 leagues", with the show's name in front only when the
 * season's own name does not already say it ("Survivor 51" does; a demo
 * season does not). The league count only once there is one to count.
 */
function seasonMeta(season: SeasonRow, contestants: string): string {
  const parts = [`${season._count.contestants} ${contestants}`];
  if (!season.name.toLowerCase().includes(season.show.name.toLowerCase())) parts.unshift(season.show.name);
  const leagues = season._count.leagues;
  if (leagues > 0) parts.push(`${leagues} ${leagues === 1 ? 'league' : 'leagues'}`);
  return parts.join(' · ');
}

// On air first, then what is coming; the demo seasons a local or preview
// database carries go to the bottom of each group.
const STATUS_ORDER: Record<string, number> = { ACTIVE: 0, UPCOMING: 1 };
const isDemo = (season: SeasonRow) => season.slug.startsWith('demo-');

export default async function SeasonsPage() {
  const seasons = await loadSeasons();
  const archived = seasons.archived;
  const open = [...seasons.open].sort(
    (a, b) =>
      (STATUS_ORDER[a.status] ?? 2) - (STATUS_ORDER[b.status] ?? 2) || Number(isDemo(a)) - Number(isDemo(b)),
  );

  return (
    <div className="pt-2">
      <JsonLd data={breadcrumbList([{ name: 'Seasons', path: '/seasons' }])} />
      {/* The seasons you can actually play. Not a panel: the top of the page
          is already where a scroll comes to rest. */}
      <div className="stage">
        <h1 className="headline text-4xl">Seasons</h1>
        <p className="mt-2 max-w-measure text-xs text-muted">
          Play along with a season that is still running, or look back at one that has wrapped.
        </p>

        <Collapsible title="Open for leagues" className="mt-6" panel={false} aside={`${open.length} open`}>
          {open.length === 0 ? (
            <p className="list-empty">Nothing is airing right now. Check back when the next season starts.</p>
          ) : (
            <RevealGroup as="ul" className="list" step={40}>
              {open.map((season) => {
                const status = STATUS[season.status] ?? STATUS.UPCOMING;
                const lexicon = lexiconFor(season.show.slug, season.show.lexicon);
                return (
                  <ShowTheme key={season.id} showSlug={season.show.slug}>
                    <Reveal as="li">
                      <Link
                        href={`/seasons/${season.slug}`}
                        className="row-link group flex items-center gap-3.5 py-3.5"
                      >
                        <SeasonPlate showSlug={season.show.slug} seasonSlug={season.slug} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-md font-semibold">{season.name}</span>
                          <span className="mt-1.5 flex items-center gap-2.5 text-2xs text-muted">
                            <Tag tone={status.tone} live={status.live} size="sm">
                              {status.label}
                            </Tag>
                            <span className="truncate">{seasonMeta(season, lower(lexicon.contestantPlural))}</span>
                          </span>
                        </span>
                        <ChevronRightIcon
                          size={16}
                          className="-mr-1 shrink-0 text-muted transition-transform duration-200 ease-soft group-hover:translate-x-0.5 group-hover:text-show-deep"
                        />
                      </Link>
                    </Reveal>
                  </ShowTheme>
                );
              })}
            </RevealGroup>
          )}
        </Collapsible>
      </div>

      {/* The read-only past. Open: it is short, and it is the rest of the page. */}
      <div>
        <Collapsible title="Archive" className="mt-10" aside={`${archived.length} finished`}>
          <p className="mb-3 max-w-measure text-2xs leading-relaxed text-muted">
            Finished seasons are read-only — the whole cast is already known, so there is no game left to
            draft.
          </p>
          {archived.length === 0 ? (
            <p className="list-empty">No finished seasons yet.</p>
          ) : (
            <ul className="list">
              {archived.map((season) => (
                <li key={season.id}>
                  <ShowTheme showSlug={season.show.slug}>
                    <Link
                      href={`/seasons/${season.slug}`}
                      className="row-link flex items-center gap-3.5 py-3.5"
                    >
                      <SeasonPlate showSlug={season.show.slug} seasonSlug={season.slug} archived />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-md font-semibold">{season.name}</span>
                        <span className="mt-0.5 block truncate text-2xs text-muted">
                          {seasonMeta(
                            season,
                            lower(lexiconFor(season.show.slug, season.show.lexicon).contestantPlural),
                          )}
                        </span>
                      </span>
                      <LockIcon size={18} className="text-muted" />
                    </Link>
                  </ShowTheme>
                </li>
              ))}
            </ul>
          )}
        </Collapsible>
      </div>
    </div>
  );
}
