import Link from 'next/link';
import { CastTicker, type TickerCastMember } from '@/components/CastTicker';
import { HeadlineTicker } from '@/components/HeadlineTicker';
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
 * The "what is happening right now" block: the airing cast, the last scored
 * events, and the community timeline.
 *
 * Shared verbatim between the signed-out landing page and the signed-in home
 * page so the two can't drift. It is a server component; the headline
 * crossfade is now the only piece here that needs the client at all, since
 * the buzz feed replaced an embedded widget with server-rendered links.
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
          <div className="mb-3 flex items-center justify-between">
            <span className="pill flex items-center gap-1.5 bg-brand-gold-soft text-2xs text-brand-gold-deep">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
              Airing now
            </span>
            <Link
              href={`/seasons/${featured.seasonSlug}`}
              className="text-2xs text-brand-gold-deep"
            >
              {featured.seasonName} →
            </Link>
          </div>
          <CastTicker cast={featured.cast} seasonSlug={featured.seasonSlug} />
        </div>
      )}

      {headlines.length > 0 && <HeadlineTicker headlines={headlines} />}

      <SocialFeed buzz={buzz} hashtag={LIVE_HASHTAG} />
    </div>
  );
}
