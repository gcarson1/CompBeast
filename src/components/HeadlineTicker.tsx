'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { formatPoints, pointsTone } from '@/lib/ui';
import type { SeasonHeadline } from '@/server/queries';

/**
 * Cycles one real recent scoring event at a time, like a breaking-news bar.
 *
 * Unlike the cast marquee this stays a JS animation: it is a discrete
 * crossfade every few seconds, not a continuous transform, so a stalled frame
 * costs a slightly late swap rather than a visibly stuttering scroll.
 */
export function HeadlineTicker({ headlines }: { headlines: SeasonHeadline[] }) {
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (headlines.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % headlines.length), 3800);
    return () => clearInterval(id);
  }, [headlines.length]);

  if (headlines.length === 0) return null;
  // Guards against the list shrinking under a stale index on a revalidate.
  const headline = headlines[index % headlines.length];

  return (
    <div className="card overflow-hidden p-4">
      <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-gold" />
        Just happened
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={headline.id}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className="mt-2 flex items-center justify-between gap-3"
        >
          <span className="min-w-0 truncate text-sm font-medium">
            <span className="font-semibold">{headline.contestantName}</span> — {headline.eventLabel}
          </span>
          <span
            className={`shrink-0 text-xs font-semibold tabular-nums ${pointsTone(headline.points)}`}
          >
            {formatPoints(headline.points)}
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
