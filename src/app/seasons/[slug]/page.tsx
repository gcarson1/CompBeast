import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Avatar } from '@/components/Avatar';
import { JsonLd } from '@/components/JsonLd';
import { absoluteUrl, breadcrumbList, tvSeriesNode } from '@/lib/seo';
import { formatPoints, pointsTone } from '@/lib/ui';
import { getSeasonScoreboard } from '@/server/queries';

export const dynamic = 'force-dynamic';

// Deduplicated across `generateMetadata` and the render by React's
// per-request cache, so the scoreboard is computed once per request.
const loadSeason = cache((slug: string) => getSeasonScoreboard(slug));

/**
 * `notFound()` here as well as in the page, so the metadata step and the
 * render agree about an unknown slug. This route has no loading boundary
 * above it (see PageSkeleton.tsx), so nothing has streamed when either one
 * throws and the response is a real 404 — not a page that says "not found"
 * under a 200, which is the soft-404 that gets indexed as a page.
 */
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const data = await loadSeason(params.slug);
  if (!data) notFound();

  const { season, players, rulesetName } = data;
  const live = season.status !== 'COMPLETED';
  return {
    title: `${season.name} fantasy scores`,
    description: `Every ${season.name} houseguest ranked by Comp Beast fantasy points${
      live ? ' as the season airs' : ', beside where they actually placed'
    } — ${players.length} players, scored with the ${rulesetName} ruleset. ${season.showName}, ${season.year}.`,
    alternates: { canonical: absoluteUrl(`/seasons/${season.slug}`) },
  };
}

export default async function SeasonPage({ params }: { params: { slug: string } }) {
  const data = await loadSeason(params.slug);
  if (!data) notFound();

  const { season, rulesetName, players } = data;
  const isArchived = season.status === 'COMPLETED';

  return (
    <div className="pt-2">
      <JsonLd
        data={breadcrumbList([
          { name: 'Seasons', path: '/seasons' },
          { name: season.name, path: `/seasons/${season.slug}` },
        ])}
      />
      {/* What the page is *about*, as an entity: this season of that series.
          `partOfSeries` carries the sameAs links that pin "Big Brother" to
          the CBS show rather than any of the other things called that. */}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          url: absoluteUrl(`/seasons/${season.slug}`),
          name: `${season.name} fantasy scores`,
          about: {
            '@type': 'TVSeason',
            name: season.name,
            partOfSeries: tvSeriesNode(season.showSlug, season.showName),
          },
        }}
      />
      <Link href="/seasons" className="text-xs text-muted">
        ← Seasons
      </Link>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-semibold tracking-tight">{season.name}</h1>
          <p className="mt-0.5 text-xs text-muted">
            {season.showName} · {season.year} · scored with {rulesetName} rules
          </p>
        </div>
        {isArchived && <span className="pill shrink-0 bg-canvas text-2xs text-muted">Finished</span>}
      </div>

      {isArchived ? (
        <p className="mt-4 rounded-card border border-hairline bg-surface/60 p-3 text-2xs leading-relaxed text-muted">
          This season has wrapped, so it is view-only. Leagues can only be created for seasons that
          are still airing or yet to start.
        </p>
      ) : (
        <Link
          href="/leagues/new"
          prefetch={false}
          className="mt-4 flex items-center justify-between rounded-card border border-brand-gold/30 bg-surface p-4 text-ink transition active:scale-[0.99]"
        >
          <span>
            <span className="block text-base font-semibold">Start a league</span>
            <span className="mt-0.5 block text-xs text-muted">This season is still in play</span>
          </span>
          <span className="pill bg-brand-gold text-on-gold">Create</span>
        </Link>
      )}

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Player scores</h2>
        <p className="mb-2 text-2xs text-muted">
          Ranked by fantasy points, which is not the same as how they placed on the show.
        </p>

        {players.length === 0 ? (
          <p className="card p-4 text-xs text-muted">No players loaded for this season yet.</p>
        ) : (
          <ul className="card divide-y divide-hairline">
            {players.map((player, index) => (
              <li key={player.contestantId}>
                <Link href={`/players/${player.contestantId}`} className="flex items-center gap-3 p-4">
                  <span className="w-6 shrink-0 text-center text-xs font-semibold tabular-nums text-muted">
                    {index + 1}
                  </span>
                  <Avatar
                    name={player.name}
                    photoUrl={player.photoUrl}
                    size={42}
                    dimmed={isArchived ? false : !player.isActive}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{player.name}</span>
                    <span className="mt-0.5 block truncate text-2xs text-muted">
                      {describe(player, isArchived)}
                    </span>
                  </span>
                  <span className={`text-md font-semibold tabular-nums ${pointsTone(player.points)}`}>
                    {formatPoints(player.points)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function describe(
  player: { isActive: boolean; eliminatedLabel: string | null; metadata: unknown },
  isArchived: boolean,
): string {
  const meta = player.metadata as { occupation?: string; sourcePlace?: string } | null;

  if (isArchived) {
    return meta?.sourcePlace ?? (player.eliminatedLabel ? `Out · ${player.eliminatedLabel}` : 'Houseguest');
  }
  if (player.isActive) return meta?.occupation ?? 'In the house';
  return `Evicted · ${player.eliminatedLabel ?? '—'}`;
}
