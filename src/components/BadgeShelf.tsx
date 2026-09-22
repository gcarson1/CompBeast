import { BADGES, type Badge, earnedBadges, nextBadge } from '@/lib/badges';
import { cn } from '@/lib/ui';

/**
 * The badge ladder on the account page: every tier as a medal, earned ones
 * struck in their metal, the rest as empty slots with their threshold, and
 * one line under the shelf saying how far the next one is.
 *
 * Locked tiers are rendered rather than hidden on purpose — a ladder you can
 * see the top of is what makes the next rung worth climbing, and a shelf
 * that only ever shows what you already have is a receipt.
 */
export function BadgeShelf({ points }: { points: number }) {
  const earned = new Set(earnedBadges(points).map((badge) => badge.slug));
  const next = nextBadge(points);

  return (
    <div>
      <ol className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {BADGES.map((badge) => {
          const has = earned.has(badge.slug);
          return (
            <li
              key={badge.slug}
              // Same layout earned or not, so the ladder reads as one set of
              // slots. The medal carries the difference on its own; the words
              // under it say it again for anyone who cannot see the metal.
              className={cn(
                'card flex flex-col items-center px-2 pb-3 pt-4 text-center',
                has && 'medal-earned border-white/10',
              )}
              aria-label={`${badge.name}: ${has ? 'earned' : `locked, ${badge.threshold} points`}`}
            >
              <Medal badge={badge} earned={has} />
              <span className={cn('mt-3 text-2xs font-semibold leading-tight', !has && 'text-muted')}>
                {badge.name}
              </span>
              <span
                className={cn(
                  'mt-0.5 text-2xs tabular-nums',
                  has ? 'font-semibold text-brand-gold-deep' : 'text-muted',
                )}
              >
                {has ? 'Earned' : `${badge.threshold.toLocaleString('en-US')} pts`}
              </span>
            </li>
          );
        })}
      </ol>

      {next ? (
        <div className="mt-4 px-1">
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
            className="mt-1.5 h-2 overflow-hidden rounded-pill bg-canvas shadow-[inset_0_0_0_1px_rgba(248,250,252,0.08)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(next.fraction * 100)}
            aria-label={`Progress to ${next.badge.name}`}
          >
            <div
              className="h-full rounded-pill bg-gradient-to-r from-brand-gold to-brand-gold-deep shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] transition-[width] duration-700 ease-soft"
              style={{ width: `${Math.max(2, next.fraction * 100)}%` }}
            />
          </div>
          <p className="mt-2 max-w-measure text-2xs leading-relaxed text-muted">{next.badge.blurb}</p>
        </div>
      ) : (
        <p className="mt-4 px-1 text-2xs text-muted">Every badge earned. {BADGES.at(-1)?.blurb}</p>
      )}
    </div>
  );
}

/**
 * Each rung's finish, climbing: bronze, silver and gold, then gold-rimmed
 * enamel for the jury and the finale, and a holographic face for the top.
 * Spelled out for Tailwind's content scan.
 */
const FINISH: Record<string, string> = {
  castmate: 'medal-bronze',
  'comp-winner': 'medal-silver',
  'power-player': 'medal-gold',
  'jury-member': 'medal-velvet',
  finalist: 'medal-ice',
  'comp-beast': 'medal-holo',
};

/**
 * One badge as a medal (`.medal` in globals.css). `sm` is for pinning the
 * highest badge beside a name; the shelf uses the full size.
 */
export function Medal({
  badge,
  earned = true,
  size = 'md',
  className,
}: {
  badge: Badge;
  earned?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'medal',
        earned && (FINISH[badge.slug] ?? 'medal-gold'),
        size === 'sm' && 'medal-sm',
        className,
      )}
    >
      <BadgeIcon slug={badge.slug} size={size === 'sm' ? 14 : 24} faded={!earned} />
    </span>
  );
}

/**
 * One glyph per tier, embossed on the medal: a door for making the cast, a
 * flag for a comp win, a bolt for running the game, a gavel for the jury, a
 * podium for the finale, and the wordmark's climbing bars for the top.
 */
function BadgeIcon({ slug, size, faded }: { slug: Badge['slug']; size: number; faded: boolean }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: faded ? 'opacity-50' : undefined,
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
