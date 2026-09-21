import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { JsonLd } from '@/components/JsonLd';
import { absoluteUrl, breadcrumbList } from '@/lib/seo';
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
    } with every houseguest ranked by fantasy points.`,
    alternates: { canonical: absoluteUrl('/seasons') },
  };
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'bg-brand-gold-soft text-brand-gold-deep',
  UPCOMING: 'bg-brand-velvet/20 text-violet-300',
  COMPLETED: 'bg-canvas text-muted',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Airing now',
  UPCOMING: 'Upcoming',
  COMPLETED: 'Finished',
};

export default async function SeasonsPage() {
  const { open, archived } = await loadSeasons();

  return (
    <div className="pt-2">
      <JsonLd data={breadcrumbList([{ name: 'Seasons', path: '/seasons' }])} />
      <h1 className="text-4xl font-semibold tracking-tight">Seasons</h1>
      <p className="mb-5 text-xs text-muted">
        Play along with a season that is still running, or look back at one that has wrapped.
      </p>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Open for leagues</h2>
        {open.length === 0 ? (
          <p className="card p-4 text-xs text-muted">
            Nothing is airing right now. Check back when the next season starts.
          </p>
        ) : (
          <ul className="space-y-3">
            {open.map((season) => (
              <li key={season.id}>
                <Link
                  href={`/seasons/${season.slug}`}
                  className="card block p-4 transition active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-md font-semibold">{season.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {season.show.name} · {season._count.contestants} players
                      </span>
                    </span>
                    <span className={`pill shrink-0 text-2xs ${STATUS_TONE[season.status]}`}>
                      {STATUS_LABEL[season.status]}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-hairline pt-3">
                    <span className="text-2xs text-muted">
                      {season._count.leagues} {season._count.leagues === 1 ? 'league' : 'leagues'}
                    </span>
                    <span className="text-2xs font-medium text-brand-gold-deep">View season →</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-7">
        <h2 className="mb-1 text-lg font-semibold">Archive</h2>
        <p className="mb-2 text-2xs text-muted">
          Finished seasons are read-only — the whole cast is already known, so there is no game left to draft.
        </p>
        {archived.length === 0 ? (
          <p className="card p-4 text-xs text-muted">No finished seasons yet.</p>
        ) : (
          <ul className="card divide-y divide-hairline">
            {archived.map((season) => (
              <li key={season.id}>
                <Link href={`/seasons/${season.slug}`} className="flex items-center gap-3 p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-canvas text-2xs font-semibold tabular-nums text-muted">
                    {String(season.year).slice(-2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{season.name}</span>
                    <span className="mt-0.5 block truncate text-2xs text-muted">
                      {season.show.name} · {season._count.contestants} players
                    </span>
                  </span>
                  <ChevronIcon />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2">
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
