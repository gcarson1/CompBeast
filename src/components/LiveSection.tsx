import Link from 'next/link';
import { LiveTicker, type TickerCastMember } from '@/components/LiveTicker';
import { ShowTheme } from '@/components/ShowTheme';
import { SocialFeed } from '@/components/SocialFeed';
import { Sticker } from '@/components/Sticker';
import type { SocialBuzz } from '@/lib/social-feed';
import type { SeasonHeadline } from '@/server/queries';

export interface FeaturedCast {
  seasonId: string;
  seasonSlug: string;
  seasonName: string;
  status: 'ACTIVE' | 'UPCOMING';
  /** When the season premieres, for a season that has not yet. */
  startsAt: Date | null;
  /** Drives the buzz feed's query, which is why it is show-agnostic. */
  showName: string;
  showSlug: string;
  cast: TickerCastMember[];
}

export interface LiveBlockData {
  featured: FeaturedCast;
  headlines: SeasonHeadline[];
  buzz: SocialBuzz;
  /** The season's community tag (see `hashtagFor`). */
  hashtag: string | null;
}

/**
 * "What is happening right now", one block per show with an open season:
 * the cast as a marquee of faces (with the last scored events once the
 * season is scoring), and that show's community timeline. Each block wears
 * its show's colour, so two shows side by side read as two shows and not as
 * one long list.
 *
 * Shared verbatim between the signed-out landing page and the signed-in home
 * page so the two can't drift. It is a server component throughout: the
 * marquee is CSS, and the buzz feed renders plain links.
 */
export function LiveSection({ blocks }: { blocks: LiveBlockData[] }) {
  if (blocks.length === 0) return null;

  return (
    <div className="space-y-12">
      {blocks.map(({ featured, headlines, buzz, hashtag }) => (
        <ShowTheme key={featured.seasonId} showSlug={featured.showSlug}>
          <section aria-labelledby={`live-${featured.seasonSlug}`} className="space-y-6">
            <div>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
                <h2 id={`live-${featured.seasonSlug}`} className="section-title">
                  <Sticker tone="show" size="sm">
                    {featured.showName}
                  </Sticker>
                  {featured.status === 'ACTIVE' ? (
                    <>
                      Airing now
                      <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-danger" />
                    </>
                  ) : (
                    <>{featured.startsAt ? `Premieres ${premiereLabel(featured.startsAt)}` : 'Coming soon'}</>
                  )}
                </h2>
                <Link href={`/seasons/${featured.seasonSlug}`} className="text-xs text-show-deep">
                  {featured.seasonName} →
                </Link>
              </div>
              <LiveTicker headlines={headlines} cast={featured.cast} seasonSlug={featured.seasonSlug} />
            </div>

            <SocialFeed buzz={buzz} hashtag={hashtag} id={`buzz-${featured.showSlug}`} />
          </section>
        </ShowTheme>
      ))}
    </div>
  );
}

/** "Wed, Sep 23" — the weekday matters more than the year for a premiere this month. */
export function premiereLabel(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}
