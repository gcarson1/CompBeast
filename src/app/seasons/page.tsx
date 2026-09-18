import Link from 'next/link';
import { getSeasonsByStatus } from '@/server/queries';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'bg-lime-soft text-lime-deep',
  UPCOMING: 'bg-[#e8eefd] text-[#3d6be8]',
  COMPLETED: 'bg-canvas text-muted',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Airing now',
  UPCOMING: 'Upcoming',
  COMPLETED: 'Finished',
};

export default async function SeasonsPage() {
  const { open, archived } = await getSeasonsByStatus();

  return (
    <div className="pt-2">
      <h1 className="text-[28px] font-semibold tracking-tight">Seasons</h1>
      <p className="mb-5 text-[13px] text-muted">
        Play along with a season that is still running, or look back at one that has wrapped.
      </p>

      <section>
        <h2 className="mb-2 text-[17px] font-semibold">Open for leagues</h2>
        {open.length === 0 ? (
          <p className="card p-4 text-[13px] text-muted">
            Nothing is airing right now. Check back when the next season starts.
          </p>
        ) : (
          <ul className="space-y-3">
            {open.map((season) => (
              <li key={season.id}>
                <Link href={`/seasons/${season.slug}`} className="card block p-4 transition active:scale-[0.99]">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[16px] font-semibold">{season.name}</span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted">
                        {season.show.name} · {season._count.contestants} players
                      </span>
                    </span>
                    <span className={`pill shrink-0 text-[11px] ${STATUS_TONE[season.status]}`}>
                      {STATUS_LABEL[season.status]}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-hairline pt-3">
                    <span className="text-[12px] text-muted">
                      {season._count.leagues} {season._count.leagues === 1 ? 'league' : 'leagues'}
                    </span>
                    <span className="text-[12px] font-medium text-lime-deep">View season →</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-7">
        <h2 className="mb-1 text-[17px] font-semibold">Archive</h2>
        <p className="mb-2 text-[12px] text-muted">
          Finished seasons are read-only — the whole cast is already known, so there is no game
          left to draft.
        </p>
        {archived.length === 0 ? (
          <p className="card p-4 text-[13px] text-muted">No finished seasons yet.</p>
        ) : (
          <ul className="card divide-y divide-hairline">
            {archived.map((season) => (
              <li key={season.id}>
                <Link href={`/seasons/${season.slug}`} className="flex items-center gap-3 p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-canvas text-[12px] font-semibold tabular-nums text-muted">
                    {String(season.year).slice(-2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{season.name}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted">
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8a8a94" strokeWidth="2">
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
