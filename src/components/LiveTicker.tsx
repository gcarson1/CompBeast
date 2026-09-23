import Link from 'next/link';
import { Avatar } from '@/components/Avatar';
import { Tag } from '@/components/Tag';
import { formatPoints, relativeTime } from '@/lib/ui';
import type { SeasonHeadline } from '@/server/queries';

export interface TickerCastMember {
  name: string;
  photoUrl: string;
}

/** Roughly 40px/s: an item is 256px, so one every ~6.5s. */
const SECONDS_PER_CARD = 6.5;
/** The faces-only fallback runs at the cast marquee's old pace. */
const SECONDS_PER_FACE = 2.6;

/**
 * The "airing now" marquee: one card per scored event, newest first, each
 * carrying the houseguest's face, what they did, the points it was worth as
 * a tag, and when it happened. It replaces two things that used to sit
 * one above the other — a marquee of faces with nothing to say, and a card
 * that cycled the same events one at a time — with the one rail that says
 * "here is what just happened, in order".
 *
 * Newest first, left to right: the track travels left, so the card at the
 * left edge on load is the latest event and the rail reads backwards in
 * time as it plays. A season with no events yet (pre-premiere) falls back
 * to the faces, so the block never goes empty for a cast worth showing.
 *
 * Still a server component and still pure CSS (see `.marquee-track` in
 * globals.css): no JavaScript, so a busy main thread cannot stall it. The
 * track is two identical copies and travels -50%; each copy carries its
 * own trailing gap so the loop point lands seamlessly.
 */
export function LiveTicker({
  headlines,
  cast,
  seasonSlug,
}: {
  headlines: SeasonHeadline[];
  cast: TickerCastMember[];
  seasonSlug: string;
}) {
  if (headlines.length > 0) {
    return (
      // A crawl, the way a broadcast runs one along the bottom of the
      // screen: one ruled strip, the items divided by slanted rules, rather
      // than a row of boxes.
      <div
        className="marquee-viewport no-scrollbar overflow-hidden border-y border-hairline [mask-image:linear-gradient(90deg,transparent,#000_5%,#000_95%,transparent)]"
        style={{ ['--marquee-duration' as string]: `${headlines.length * SECONDS_PER_CARD}s` }}
      >
        <div className="marquee-track">
          <HeadlineCopy headlines={headlines} seasonSlug={seasonSlug} />
          {/* The duplicate only makes the loop seamless; reading the same
              events twice would be noise. */}
          <HeadlineCopy headlines={headlines} seasonSlug={seasonSlug} aria-hidden />
        </div>
      </div>
    );
  }

  if (cast.length === 0) return null;

  return (
    <div
      className="marquee-viewport no-scrollbar overflow-hidden"
      style={{ ['--marquee-duration' as string]: `${cast.length * SECONDS_PER_FACE}s` }}
    >
      <div className="marquee-track">
        <CastCopy cast={cast} seasonSlug={seasonSlug} />
        <CastCopy cast={cast} seasonSlug={seasonSlug} aria-hidden />
      </div>
    </div>
  );
}

function HeadlineCopy({
  headlines,
  seasonSlug,
  'aria-hidden': ariaHidden,
}: {
  headlines: SeasonHeadline[];
  seasonSlug: string;
  'aria-hidden'?: boolean;
}) {
  return (
    <ol className="marquee-copy flex shrink-0" aria-hidden={ariaHidden}>
      {headlines.map((headline) => (
        <li
          key={headline.id}
          className="relative w-64 shrink-0 after:absolute after:inset-y-3 after:right-0 after:w-px after:-skew-x-[14deg] after:bg-white/[0.12]"
        >
          <Link
            href={`/seasons/${seasonSlug}`}
            tabIndex={ariaHidden ? -1 : undefined}
            className="flex h-full items-start gap-3 px-4 py-3 transition-colors duration-200 ease-soft hover:bg-white/[0.03]"
          >
            <Avatar name={headline.contestantName} photoUrl={headline.contestantPhotoUrl} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{headline.contestantName}</span>
              <span className="block truncate text-2xs text-muted">
                {headline.eventLabel}
                {headline.count > 1 && <span className="tabular-nums"> ×{headline.count}</span>}
              </span>
              <time
                dateTime={headline.occurredAt.toISOString()}
                className="mt-1 block text-2xs font-medium text-show-deep"
              >
                {relativeTime(headline.occurredAt)}
              </time>
            </span>
            {/* The points as a scoreboard value on the slant — gold for a
                gain, red for a loss. */}
            <Tag tone={headline.points > 0 ? 'gold' : headline.points < 0 ? 'red' : 'ink'} size="sm">
              {formatPoints(headline.points)}
            </Tag>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function CastCopy({
  cast,
  seasonSlug,
  'aria-hidden': ariaHidden,
}: {
  cast: TickerCastMember[];
  seasonSlug: string;
  'aria-hidden'?: boolean;
}) {
  return (
    <ul className="marquee-copy flex shrink-0 gap-4 pr-4" aria-hidden={ariaHidden}>
      {cast.map((member, i) => (
        <li key={`${member.name}-${i}`} className="w-16 shrink-0">
          <Link
            href={`/seasons/${seasonSlug}`}
            tabIndex={ariaHidden ? -1 : undefined}
            className="flex flex-col items-center gap-1.5 py-1"
          >
            <Avatar name={member.name} photoUrl={member.photoUrl} size={56} />
            <span className="w-full truncate text-center text-2xs text-muted">
              {member.name.split(' ')[0]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
