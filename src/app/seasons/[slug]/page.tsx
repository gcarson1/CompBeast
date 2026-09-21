import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Avatar } from '@/components/Avatar';
import { BeastDoodle } from '@/components/doodles/BeastDoodle';
import { Doodle } from '@/components/doodles/Doodle';
import { JsonLd } from '@/components/JsonLd';
import { MotionCard } from '@/components/motion/MotionCard';
import { Reveal } from '@/components/motion/Reveal';
import { Sticker } from '@/components/Sticker';
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

      <header className="relative mt-4 pr-20 sm:pr-28">
        <BeastDoodle
          mood={isArchived ? 'grin' : 'shock'}
          className="absolute -right-2 -top-3 h-20 w-20 rotate-6 sm:-right-3 sm:-top-5 sm:h-24 sm:w-24"
        />
        <Sticker tone={isArchived ? 'ink' : 'gold'} size="lg" tilt="l">
          {isArchived ? 'Finished' : season.status === 'ACTIVE' ? 'Airing now' : 'Upcoming'}
        </Sticker>
        <h1 className="headline mt-4 text-5xl sm:text-6xl">{season.name}</h1>
        <p className="mt-3 text-xs text-muted">
          {season.showName} · {season.year} · scored with {rulesetName} rules
        </p>
      </header>

      {isArchived ? (
        <p className="card mt-6 max-w-measure p-4 text-2xs leading-relaxed text-muted">
          This season has wrapped, so it is view-only. Leagues can only be created for seasons that are still
          airing or yet to start.
        </p>
      ) : (
        <MotionCard tilt className="card-pop-gold relative mt-8">
          <Doodle kind="door" tone="paper" className="absolute -right-2 -top-3 h-9 w-9 rotate-6" />
          <Link
            href="/leagues/new"
            prefetch={false}
            className="flex items-center justify-between gap-4 rounded-card p-5"
          >
            <span className="min-w-0">
              <span className="headline block text-2xl">Start a league</span>
              <span className="mt-1 block text-xs text-tile-muted">This season is still in play</span>
            </span>
            <span className="btn btn-sm shrink-0 bg-pop-gold-ink text-brand-gold-deep">Create →</span>
          </Link>
        </MotionCard>
      )}

      <Reveal as="section" className="mt-10" aria-labelledby="scores-heading">
        <h2 id="scores-heading" className="section-title">
          Player scores
        </h2>
        <p className="mb-3 mt-2 text-2xs text-muted">
          Ranked by fantasy points, which is not the same as how they placed on the show.
        </p>

        {players.length === 0 ? (
          <p className="card p-4 text-xs text-muted">No players loaded for this season yet.</p>
        ) : (
          <ul className="card divide-y divide-hairline">
            {players.map((player, index) => (
              <li key={player.contestantId}>
                <Link
                  href={`/players/${player.contestantId}`}
                  className="flex items-center gap-3 p-4 transition duration-200 ease-soft hover:bg-surface-raised"
                >
                  <span className="w-6 shrink-0 text-center font-display text-md tabular-nums text-muted">
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
      </Reveal>
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
