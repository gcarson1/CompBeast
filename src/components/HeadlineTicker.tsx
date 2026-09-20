'use client';

import { useEffect, useState } from 'react';
import { formatPoints, pointsTone } from '@/lib/ui';
import type { SeasonHeadline } from '@/server/queries';

/**
 * Cycles one real recent scoring event at a time, like a breaking-news bar.
 *
 * The swap is a CSS animation on a re-keyed row rather than a Framer Motion
 * crossfade, for two measured reasons. This card sits on the landing page,
 * and it was the only thing there still importing Framer Motion — a whole
 * animation runtime on the route a search engine reads, for one crossfade.
 * And its `initial={{ opacity: 0 }}` arrived as `style="opacity:0"` in the
 * HTML, invisible until hydration, which made it the page's Largest
 * Contentful Paint at over six seconds on a throttled phone once the hero
 * had been fixed. The first headline now renders visible and still; only
 * the swaps that follow animate, and there is no exit animation — a stalled
 * frame costs a slightly late swap, not a visibly stuttering one.
 */
export function HeadlineTicker({ headlines }: { headlines: SeasonHeadline[] }) {
  // `swaps` rather than a boolean: it is what makes the row's key change
  // even when the index wraps back to 0, so every swap restarts the animation.
  const [state, setState] = useState({ index: 0, swaps: 0 });

  useEffect(() => {
    if (headlines.length <= 1) return;
    const id = setInterval(
      () =>
        setState((s) => ({
          index: (s.index + 1) % headlines.length,
          swaps: s.swaps + 1,
        })),
      3800,
    );
    return () => clearInterval(id);
  }, [headlines.length]);

  if (headlines.length === 0) return null;
  // Guards against the list shrinking under a stale index on a revalidate.
  const headline = headlines[state.index % headlines.length];

  return (
    <div className="card overflow-hidden p-4">
      <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-gold" />
        Just happened
      </div>
      <div
        key={`${headline.id}-${state.swaps}`}
        className={`mt-2 flex items-center justify-between gap-3 ${state.swaps > 0 ? 'animate-rise' : ''}`}
      >
        <span className="min-w-0 truncate text-sm font-medium">
          <span className="font-semibold">{headline.contestantName}</span> — {headline.eventLabel}
        </span>
        <span className={`shrink-0 text-xs font-semibold tabular-nums ${pointsTone(headline.points)}`}>
          {formatPoints(headline.points)}
        </span>
      </div>
    </div>
  );
}
