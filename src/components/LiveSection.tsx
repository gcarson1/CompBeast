import Link from 'next/link';
import { LiveTicker, type TickerCastMember } from '@/components/LiveTicker';
import { ShowTheme } from '@/components/ShowTheme';
import { SocialFeed } from '@/components/SocialFeed';
import { Tag } from '@/components/Tag';
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
    // One panel for the whole block, not one per show: with each show's buzz
    // folded a show is a couple of hundred pixels tall, and two snap targets
    // that close make the page catch instead of guiding it.
    <div className="panel">
      {blocks.map(({ featured, headlines, buzz, hashtag }, index) => (
        <ShowTheme key={featured.seasonId} showSlug={featured.showSlug}>
          {/* The gap between shows is on the section, not a `space-y` on the
              panel: <ShowTheme> is `display: contents`, and a margin on a box
              that is not rendered does nothing — the second show used to sit
              flush against the first one's feed. */}
          <section
            aria-labelledby={`live-${featured.seasonSlug}`}
            className={index > 0 ? 'mt-12 space-y-5' : 'space-y-5'}
          >
            <div>
              {/* The show's name in its colour, and a broadcast bug saying
                  whether it is on air: red and breathing while it airs, an
                  outlined date before it premieres. */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div className="flex min-w-0 items-center gap-3">
                  <h2 id={`live-${featured.seasonSlug}`} className="section-title">
                    {featured.showName}
                  </h2>
                  {featured.status === 'ACTIVE' ? (
                    <Tag tone="red" live size="sm">
                      Airing now
                    </Tag>
                  ) : (
                    <Tag tone="outline" size="sm">
                      {featured.startsAt ? `Premieres ${premiereLabel(featured.startsAt)}` : 'Coming soon'}
                    </Tag>
                  )}
                </div>
                <Link href={`/seasons/${featured.seasonSlug}`} className="text-xs font-medium text-show-deep">
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
