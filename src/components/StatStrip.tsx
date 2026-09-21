import { cn } from '@/lib/ui';

export interface StatItem {
  label: string;
  value: string;
  /** Colour class for the value; the display face stays the same. */
  tone?: string;
}

/**
 * A row of two to four headline numbers in one tile — a team's total, rank
 * and last week; the admin page's published/pending/rejected counts. The
 * values are set in the display face like every other big number in the
 * app, and it is a definition list so a screen reader hears each label with
 * its value rather than three numbers followed by three words.
 */
export function StatStrip({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <dl
      className={cn('card grid divide-x divide-hairline p-4 text-center', className)}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0 px-1">
          <dd className={cn('truncate font-display text-3xl leading-none tracking-wide', item.tone)}>
            {item.value}
          </dd>
          <dt className="mt-1.5 text-2xs font-bold uppercase tracking-wide text-muted">{item.label}</dt>
        </div>
      ))}
    </dl>
  );
}
