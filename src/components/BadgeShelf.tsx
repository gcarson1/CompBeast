import { BADGES, type Badge, earnedBadges, nextBadge } from '@/lib/badges';
import { Doodle } from '@/components/doodles/Doodle';
import { cn } from '@/lib/ui';

/**
 * The badge ladder on the account page: every tier, earned ones lit, the
 * rest dimmed with their threshold showing, and one line under the shelf
 * saying how far the next one is.
 *
 * A server component with hand-drawn icons, like every other icon in the
 * app. Locked tiers are rendered rather than hidden on purpose — a ladder
 * you can see the top of is what makes the next rung worth climbing, and a
 * shelf that only ever shows what you already have is a receipt.
 */
export function BadgeShelf({ points }: { points: number }) {
  const earned = new Set(earnedBadges(points).map((badge) => badge.slug));
  const next = nextBadge(points);

  return (
    <div>
      <ol className="grid grid-cols-3 gap-3 pt-2 sm:grid-cols-6">
        {BADGES.map((badge) => {
          const has = earned.has(badge.slug);
          return (
            <li
              key={badge.slug}
              // An earned tier is a moulded gold chip with a star stuck on its
              // corner; a locked one is the same shape in slate, threshold
              // showing. Same layout either way so the ladder reads as one.
              // The chip carries the locked/earned difference on its own — a
              // dimmed tile put the threshold text under 3:1. The star is
              // decoration: the word "Earned" is below.
              className={cn(
                'card relative flex flex-col items-center p-3 text-center',
                has && 'border-brand-gold/40',
              )}
              aria-label={`${badge.name}: ${has ? 'earned' : `locked, ${badge.threshold} points`}`}
            >
              {has && <Doodle kind="star" className="absolute -right-2 -top-2.5 h-6 w-6 rotate-12" />}
              <span aria-hidden className={cn('clay h-12 w-12', has ? 'clay-gold' : 'clay-slate text-muted')}>
                <BadgeIcon slug={badge.slug} />
              </span>
              <span className="mt-2.5 text-2xs font-semibold leading-tight">{badge.name}</span>
              <span className="mt-0.5 text-2xs tabular-nums text-muted">
                {has ? 'Earned' : `${badge.threshold.toLocaleString('en-US')} pts`}
              </span>
            </li>
          );
        })}
      </ol>

      {next ? (
        <div className="mt-3 px-1">
          <div className="flex items-baseline justify-between gap-3 text-2xs text-muted">
            <span>
              <span className="font-semibold text-ink">{next.remaining.toLocaleString('en-US')}</span>{' '}
              {next.remaining === 1 ? 'point' : 'points'} to{' '}
              <span className="text-ink">{next.badge.name}</span>
            </span>
            <span className="tabular-nums">
              {Math.round(points).toLocaleString('en-US')} / {next.badge.threshold.toLocaleString('en-US')}
            </span>
          </div>
          {/* The bar measures from the previous tier, not from zero — otherwise
              the last stretch of every ladder would look nearly full for years. */}
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-surface"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(next.fraction * 100)}
            aria-label={`Progress to ${next.badge.name}`}
          >
            <div
              className="h-full rounded-pill bg-brand-gold shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] transition-[width] duration-700 ease-soft"
              style={{ width: `${Math.max(2, next.fraction * 100)}%` }}
            />
          </div>
          <p className="mt-2 max-w-measure text-2xs leading-relaxed text-muted">{next.badge.blurb}</p>
        </div>
      ) : (
        <p className="mt-3 px-1 text-2xs text-muted">Every badge earned. {BADGES.at(-1)?.blurb}</p>
      )}
    </div>
  );
}

/**
 * One glyph per tier, in the app's stroke style: a door for making the
 * cast, a flag for a comp win, a bolt for running the game, a gavel for the
 * jury, a podium for the finale, and the wordmark's climbing bars for the top.
 */
function BadgeIcon({ slug }: { slug: Badge['slug'] }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (slug) {
    case 'castmate':
      return (
        <svg {...common}>
          <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5V21" />
          <path d="M2.5 21h19M16 9h4v12" />
          <circle cx="12" cy="12.5" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'comp-winner':
      return (
        <svg {...common}>
          <path d="M6 21V4" />
          <path d="M6 4h11l-2 4 2 4H6" />
        </svg>
      );
    case 'power-player':
      return (
        <svg {...common}>
          <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12.5L13 2Z" />
        </svg>
      );
    case 'jury-member':
      return (
        <svg {...common}>
          <path d="m5 14 6-6M8 5l6 6M3 20h9M12.5 9.5 19 16a1.4 1.4 0 0 1-2 2l-6.5-6.5" />
        </svg>
      );
    case 'finalist':
      return (
        <svg {...common}>
          <path d="M3 21h18M9 21V11h6v10M3 21v-6h6M15 15h6v6" />
          <path d="M12 3v4M10.5 5.5 12 7l1.5-1.5" />
        </svg>
      );
    default:
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <polygon points="4,20 7,20 8.5,13 5.5,13" />
          <polygon points="9.5,20 12.5,20 14,9 11,9" />
          <polygon points="15,20 18,20 19.5,5 16.5,5" />
          <circle cx="20.5" cy="3.5" r="1.4" />
        </svg>
      );
  }
}
