import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Avatar } from '@/components/Avatar';
import { ArrowRightIcon, PlusIcon, TallyMark } from '@/components/icons';
import { JsonLd } from '@/components/JsonLd';
import { MotionCard } from '@/components/motion/MotionCard';
import { Collapsible } from '@/components/Collapsible';
import { SeasonPlate } from '@/components/SeasonPlate';
import { ShowTheme } from '@/components/ShowTheme';
import { RankPlate, Tag } from '@/components/Tag';
import { absoluteUrl, breadcrumbList, tvSeriesNode } from '@/lib/seo';
import { eliminationLabel, lower, type ShowLexicon } from '@/lib/shows/lexicon';
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
    description: `Every ${season.name} ${lower(season.showLexicon.contestantSingular)} ranked by Comp Beast fantasy points${
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
  const lexicon = season.showLexicon;

  return (
    <ShowTheme showSlug={season.showSlug}>
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
        {/* Screen 1: which season this is, and whether you can play it. Starts
            at the top of the page so the back link is inside it. */}
        <div className="stage">
          <Link href="/seasons" className="text-xs text-muted">
            ← Seasons
          </Link>

          <header className="mt-5 flex items-start gap-4">
            <SeasonPlate
              showSlug={season.showSlug}
              seasonSlug={season.slug}
              archived={isArchived}
              size="lg"
              className="mt-1"
            />
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Tag
                  tone={isArchived ? 'ink' : season.status === 'ACTIVE' ? 'red' : 'show'}
                  live={season.status === 'ACTIVE'}
                >
                  {isArchived ? 'Finished' : season.status === 'ACTIVE' ? 'Airing now' : 'Upcoming'}
                </Tag>
                <span className="text-xs font-medium text-muted">{season.showName}</span>
              </p>
              <h1 className="headline mt-2.5 text-5xl sm:text-6xl">{season.name}</h1>
              <p className="mt-2 text-xs text-muted">
                {season.year} · scored with {rulesetName} rules
              </p>
            </div>
          </header>

          {isArchived ? (
            <p className="card mt-6 max-w-measure p-4 text-2xs leading-relaxed text-muted">
              This season has wrapped, so it is view-only. Leagues can only be created for seasons that are
              still airing or yet to start.
            </p>
          ) : (
            <MotionCard tilt className="card-feature mt-8">
              <TallyMark className="absolute -bottom-5 -right-3 h-28 w-28 text-show-accent opacity-[0.12]" />
              <Link
                href="/leagues/new"
                prefetch={false}
                className="relative flex items-center gap-4 rounded-card p-5"
              >
                <span className="icon-well">
                  <PlusIcon size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="headline block text-2xl">Start a league</span>
                  <span className="mt-1 block text-xs text-muted">This season is still in play</span>
                </span>
                <span className="btn btn-sm shrink-0 bg-show-accent text-on-gold shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] hover:brightness-110">
                  Create
                  <ArrowRightIcon size={16} />
                </span>
              </Link>
            </MotionCard>
          )}
        </div>

        <div>
          <Collapsible title="Player scores" className="mt-10" aside={`${players.length} ranked`}>
            <p className="mb-3 text-2xs text-muted">
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
                      <RankPlate rank={index + 1} />
                      <Avatar
                        name={player.name}
                        photoUrl={player.photoUrl}
                        size={42}
                        dimmed={isArchived ? false : !player.isActive}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold">{player.name}</span>
                        <span className="mt-0.5 block truncate text-2xs text-muted">
                          {describe(player, isArchived, lexicon)}
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
          </Collapsible>
        </div>
      </div>
    </ShowTheme>
  );
}

function describe(
  player: { isActive: boolean; eliminatedLabel: string | null; metadata: unknown },
  isArchived: boolean,
  lexicon: ShowLexicon,
): string {
  const meta = player.metadata as { occupation?: string; sourcePlace?: string } | null;

  if (isArchived) {
    return (
      meta?.sourcePlace ??
      (player.eliminatedLabel ? `Out · ${player.eliminatedLabel}` : lexicon.contestantSingular)
    );
  }
  if (player.isActive) return meta?.occupation ?? lexicon.activeLabel;
  return `${eliminationLabel(lexicon, player.metadata)} · ${player.eliminatedLabel ?? '—'}`;
}
