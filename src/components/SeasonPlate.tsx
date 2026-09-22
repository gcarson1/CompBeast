import { monogramFor } from '@/lib/shows/registry';
import { cn } from '@/lib/ui';

const SIZE = {
  sm: { box: 'h-11 w-11', figure: 'text-lg' },
  md: { box: 'h-12 w-12', figure: 'text-xl' },
  lg: { box: 'h-16 w-16', figure: 'text-3xl' },
} as const;

/**
 * A season's number plate (`.plate` in globals.css): the show's initials
 * over the season number, on the show's colour — BB 28, S 51 — so a list of
 * seasons reads by show and number at a glance. It replaced a chip that
 * printed the last two digits of the *year*, which put the same "26" on
 * every season airing this year.
 *
 * The number comes from the slug (`big-brother-28`), which is where the
 * catalogue keeps it; a season without one (a demo) shows its initials
 * alone. Wrap it in the show's `<ShowTheme>`. Decorative — the season's
 * name is always written beside it.
 */
export function SeasonPlate({
  showSlug,
  seasonSlug,
  archived = false,
  size = 'md',
  className,
}: {
  showSlug: string;
  seasonSlug: string;
  archived?: boolean;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const number = /(\d+)$/.exec(seasonSlug)?.[1] ?? null;
  const monogram = monogramFor(showSlug);
  const { box, figure } = SIZE[size];

  return (
    <span aria-hidden className={cn('plate', archived && 'plate-archived', box, className)}>
      {number ? (
        <>
          <span className="text-2xs font-bold leading-none tracking-[0.12em] opacity-80">{monogram}</span>
          <span className={cn('font-display leading-none', figure)}>{number}</span>
        </>
      ) : (
        <span className={cn('font-display leading-none', figure)}>{monogram}</span>
      )}
    </span>
  );
}
