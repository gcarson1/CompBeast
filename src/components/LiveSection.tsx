import Link from 'next/link';
import { CastTicker, type TickerCastMember } from '@/components/CastTicker';
import { HeadlineTicker } from '@/components/HeadlineTicker';
import { TwitterFeed } from '@/components/TwitterFeed';
import type { SeasonHeadline } from '@/server/queries';

export interface FeaturedCast {
  seasonId: string;
  seasonSlug: string;
  seasonName: string;
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
 * page so the two can't drift. It is a server component; only the pieces that
 * genuinely need the client (the headline crossfade, the X embed) are.
 */
export function LiveSection({
  featured,
  headlines,
}: {
  featured: FeaturedCast | null;
  headlines: SeasonHeadline[];
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

      <div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Live: #{LIVE_HASHTAG} on X
          </h2>
        </div>
        <div className="card mt-3 overflow-hidden p-1">
          <TwitterFeed hashtag={LIVE_HASHTAG} />
        </div>
      </div>
    </div>
  );
}
