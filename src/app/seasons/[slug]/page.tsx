import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Avatar } from '@/components/Avatar';
import { ArrowRightIcon } from '@/components/icons';
import { JsonLd } from '@/components/JsonLd';
import { Collapsible } from '@/components/Collapsible';
import { SeasonPlate } from '@/components/SeasonPlate';
import { ShowTheme } from '@/components/ShowTheme';
import { RankPlate, Tag } from '@/components/Tag';
import { absoluteUrl, breadcrumbList, tvSeriesNode } from '@/lib/seo';
import { isTraitor } from '@/lib/shows/affiliation';
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
            <p className="mt-6 max-w-measure border-l-2 border-show-accent/60 pl-3 text-2xs leading-relaxed text-muted">
              This season has wrapped, so it is view-only. Leagues can only be created for seasons that are
              still airing or yet to start.
            </p>
          ) : (
            // The one thing to do here, as a callout: the whole section is the link.
            <Link
              href={`/leagues/new?season=${season.slug}`}
              prefetch={false}
              className="callout group mt-8 flex items-center gap-4"
            >
              <span className="min-w-0 flex-1">
                <span className="headline block text-2xl">Start a league</span>
                <span className="mt-1 block text-xs text-muted">This season is still in play</span>
              </span>
              <span className="btn btn-sm shrink-0 bg-show-accent text-on-gold shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] group-hover:brightness-110">
                Create
                <ArrowRightIcon size={16} />
              </span>
            </Link>
          )}
        </div>

        <div>
          <Collapsible title="Player scores" className="mt-10" aside={`${players.length} ranked`}>
            <p className="mb-3 text-2xs text-muted">
              Ranked by fantasy points, which is not the same as how they placed on the show.
            </p>

            {players.length === 0 ? (
              <p className="list-empty">No players loaded for this season yet.</p>
            ) : (
              <ul className="list">
                {players.map((player, index) => (
                  <li key={player.contestantId}>
                    <Link
                      href={`/players/${player.contestantId}`}
                      className="row-link flex items-center gap-3 py-3"
                    >
                      <RankPlate rank={index + 1} />
                      <Avatar
                        name={player.name}
                        photoUrl={player.photoUrl}
                        size={42}
                        dimmed={isArchived ? false : !player.isActive}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-base font-semibold">{player.name}</span>
                          {isTraitor(player.metadata) && (
                            <Tag tone="red" size="sm">
                              Traitor
                            </Tag>
                          )}
                        </span>
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
    const place = meta?.sourcePlace;
    // How they went, ahead of where they finished — murdered or banished is
    // the whole story of a Traitors exit, and evicted, voted out or
    // evacuated is most of one anywhere else. The winner and the runner-up
    // did not go out, so they get their title alone.
    if (place && /^\d/.test(place) && player.eliminatedLabel) {
      return `${eliminationLabel(lexicon, player.metadata)} · ${place}`;
    }
    return place ?? (player.eliminatedLabel ? `Out · ${player.eliminatedLabel}` : lexicon.contestantSingular);
  }
  if (player.isActive) return meta?.occupation ?? lexicon.activeLabel;
  return `${eliminationLabel(lexicon, player.metadata)} · ${player.eliminatedLabel ?? '—'}`;
}
