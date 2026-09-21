import Link from 'next/link';
import { LiveTicker, type TickerCastMember } from '@/components/LiveTicker';
import { SocialFeed } from '@/components/SocialFeed';
import type { SocialBuzz } from '@/lib/social-feed';
import type { SeasonHeadline } from '@/server/queries';

export interface FeaturedCast {
  seasonId: string;
  seasonSlug: string;
  seasonName: string;
  /** Drives the buzz feed's query, which is why it is show-agnostic. */
  showName: string;
  showSlug: string;
  cast: TickerCastMember[];
}

// The community hashtag isn't derivable from season data (no guarantee
// "big-brother-29" -> "BB29" is what people actually use), so this is a
// manual knob to update each season rather than an auto-guess that could
// quietly point at the wrong tag.
export const LIVE_HASHTAG = 'BB28';

/**
 * The "what is happening right now" block: the last scored events as a
 * marquee of cards (each with the houseguest's face — this is the cast
 * rail and the headline ticker folded into one), and the community
 * timeline.
 *
 * Shared verbatim between the signed-out landing page and the signed-in home
 * page so the two can't drift. It is a server component throughout: the
 * marquee is CSS, and the buzz feed renders plain links.
 */
export function LiveSection({
  featured,
  headlines,
  buzz,
}: {
  featured: FeaturedCast | null;
  headlines: SeasonHeadline[];
  buzz: SocialBuzz;
}) {
  return (
    // No `text-left` here any more — the page is left-aligned by default now,
    // so it was only ever undoing a `text-center` on the landing page.
    <div className="space-y-6">
      {featured && featured.cast.length > 0 && (
        <div>
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="section-title">
              Airing now
              <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-danger" />
            </h2>
            <Link href={`/seasons/${featured.seasonSlug}`} className="text-xs text-brand-gold-deep">
              {featured.seasonName} →
            </Link>
          </div>
          <LiveTicker headlines={headlines} cast={featured.cast} seasonSlug={featured.seasonSlug} />
        </div>
      )}

      <SocialFeed buzz={buzz} hashtag={LIVE_HASHTAG} />
    </div>
  );
}
