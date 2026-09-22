import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { Collapsible } from '@/components/Collapsible';
import { LockIcon } from '@/components/icons';
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

export default async function SeasonsPage() {
  const { open, archived } = await loadSeasons();

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
            <p className="card p-4 text-xs text-muted">
              Nothing is airing right now. Check back when the next season starts.
            </p>
          ) : (
            // Two-up from `sm`, so a pair of open seasons sits side by side
            // rather than as two full-width bars with nothing to their right.
            <RevealGroup as="ul" className="grid grid-cols-1 gap-3 sm:grid-cols-2" step={60}>
              {open.map((season) => {
                const status = STATUS[season.status] ?? STATUS.UPCOMING;
                const lexicon = lexiconFor(season.show.slug, season.show.lexicon);
                return (
                  <ShowTheme key={season.id} showSlug={season.show.slug}>
                    <Reveal as="li" className="card card-lift relative">
                      <span
                        aria-hidden
                        className="absolute inset-x-6 top-0 h-[2px] rounded-b-pill bg-show-accent"
                      />
                      <Link
                        href={`/seasons/${season.slug}`}
                        className="flex h-full flex-col rounded-card p-4"
                      >
                        <span className="flex items-start justify-between gap-3">
                          <SeasonPlate showSlug={season.show.slug} seasonSlug={season.slug} />
                          <Tag tone={status.tone} live={status.live} size="sm">
                            {status.label}
                          </Tag>
                        </span>
                        <span className="mt-3 block truncate text-lg font-semibold">{season.name}</span>
                        <span className="mb-4 mt-0.5 block truncate text-2xs text-muted">
                          {season.show.name} · {season._count.contestants} {lower(lexicon.contestantPlural)}
                        </span>
                        <span className="mt-auto flex items-center justify-between border-t border-hairline pt-3">
                          <span className="text-2xs text-muted">
                            {season._count.leagues} {season._count.leagues === 1 ? 'league' : 'leagues'}
                          </span>
                          <span className="text-2xs font-medium text-show-deep">View season →</span>
                        </span>
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
            <p className="card p-4 text-xs text-muted">No finished seasons yet.</p>
          ) : (
            <ul className="card divide-y divide-hairline">
              {archived.map((season) => (
                <li key={season.id}>
                  <ShowTheme showSlug={season.show.slug}>
                    <Link
                      href={`/seasons/${season.slug}`}
                      className="flex items-center gap-3 p-4 transition duration-200 ease-soft hover:bg-surface-raised"
                    >
                      <SeasonPlate showSlug={season.show.slug} seasonSlug={season.slug} archived size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold">{season.name}</span>
                        <span className="mt-0.5 block truncate text-2xs text-muted">
                          {season.show.name} · {season._count.contestants}{' '}
                          {lower(lexiconFor(season.show.slug, season.show.lexicon).contestantPlural)}
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
