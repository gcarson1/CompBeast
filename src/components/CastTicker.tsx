import Link from 'next/link';
import { Avatar } from '@/components/Avatar';

export interface TickerCastMember {
  name: string;
  photoUrl: string;
}

/** Roughly 30px/sec regardless of how many faces there are, so a 5-person
 *  cast and a 17-person cast read at the same speed. */
const SECONDS_PER_FACE = 2.6;

/**
 * The "Airing now" cast marquee.
 *
 * A server component: the scroll is pure CSS (see `.marquee-track` in
 * globals.css), so this ships no JavaScript at all. That is the point — the
 * previous Framer Motion version animated on the main thread and froze
 * whenever hydration or the X widget was busy.
 *
 * The track is two identical halves. Each half carries its own trailing gap
 * (`pr-4` rather than a gap between the halves) so that half the track is
 * exactly one copy wide and the -50% loop lands seamlessly.
 */
export function CastTicker({
  cast,
  seasonSlug,
}: {
  cast: TickerCastMember[];
  seasonSlug: string;
}) {
  if (cast.length === 0) return null;

  return (
    <div
      className="marquee-viewport no-scrollbar overflow-hidden"
      style={{ ['--marquee-duration' as string]: `${cast.length * SECONDS_PER_FACE}s` }}
    >
      <div className="marquee-track">
        <CastCopy cast={cast} seasonSlug={seasonSlug} />
        {/* The duplicate exists only to make the loop seamless; a screen
            reader reading the cast list twice is noise. */}
        <CastCopy cast={cast} seasonSlug={seasonSlug} aria-hidden />
      </div>
    </div>
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
            className="flex flex-col items-center gap-1.5 rounded-card py-1"
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
