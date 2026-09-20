'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Keeping a server-rendered page current without reloading it.
 *
 * The problem this solves is specific: during a draft, the person on the clock
 * changes because of something *somebody else* did. Until this existed, the
 * only way to find out was to pull-to-refresh, and a page that needs manual
 * refreshing to let you take your turn is not a draft room.
 *
 * The approach is to keep one source of truth — the server render — and use
 * polling purely as a trigger for `router.refresh()`. Nothing here holds a
 * second copy of the draft state that could drift out of step with the page,
 * which is the failure mode that makes hand-rolled live UIs worse than a
 * refresh button rather than better.
 */

export interface LeaguePulse {
  draftStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  picks: number;
  messages: number;
  reactions: number;
}

/** Fields a caller wants to react to, paired with what its render was built from. */
export type PulseWatch = Partial<Record<keyof LeaguePulse, string | number>>;

function signature(watch: PulseWatch, keys: string[]): string {
  return keys.map((key) => `${key}=${watch[key as keyof LeaguePulse] ?? ''}`).join('|');
}

export interface UseLeaguePulseResult {
  /** False once several polls in a row have failed — the page may be stale. */
  live: boolean;
  /** True between noticing a change and the new server render arriving. */
  syncing: boolean;
}

export function useLeaguePulse({
  leagueId,
  watch,
  intervalMs = 5_000,
  enabled = true,
}: {
  leagueId: string;
  /**
   * The watched fields *as this render sees them* — e.g. `{ picks: 12 }` from
   * `picks.length`. Passing the current values rather than a separate
   * comparator is what makes drift impossible: there is only one expression
   * of "what this page is showing".
   */
  watch: PulseWatch;
  intervalMs?: number;
  enabled?: boolean;
}): UseLeaguePulseResult {
  const router = useRouter();
  const [live, setLive] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Sorted so the signature does not depend on key order in the literal.
  const keys = Object.keys(watch).sort();
  const rendered = signature(watch, keys);

  const keysRef = useRef(keys);
  keysRef.current = keys;
  const seen = useRef(rendered);

  /**
   * A completed server render always wins. This is what closes the loop: the
   * refresh lands, props change, and the baseline moves to match — so the next
   * poll compares against what is genuinely on screen, not against whatever we
   * last saw over the wire.
   */
  useEffect(() => {
    seen.current = rendered;
    setSyncing(false);
  }, [rendered]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let inFlight = false;

    const schedule = (ms: number) => {
      if (cancelled) return;
      clearTimeout(timer);
      timer = setTimeout(tick, ms);
    };

    async function tick() {
      if (cancelled) return;

      // A hidden tab is not watching a draft. Browsers also throttle timers
      // there, so polling it is both wasted and unreliable; the visibility
      // listener below catches up the instant someone looks again.
      if (document.hidden || inFlight) {
        schedule(intervalMs);
        return;
      }

      inFlight = true;
      try {
        const response = await fetch(`/api/leagues/${leagueId}/pulse`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`pulse ${response.status}`);
        const pulse = (await response.json()) as LeaguePulse;
        failures = 0;
        if (cancelled) return;

        setLive(true);
        const next = signature(pulse, keysRef.current);
        if (next !== seen.current) {
          seen.current = next;
          setSyncing(true);
          router.refresh();
        }
      } catch {
        failures += 1;
        // One dropped request on a phone means nothing. Three in a row means
        // the page in front of someone may be out of date, and they deserve
        // to be told rather than to sit staring at a stale board.
        if (!cancelled && failures >= 3) setLive(false);
      } finally {
        inFlight = false;
        const backoff = failures === 0 ? intervalMs : Math.min(intervalMs * 2 ** failures, 60_000);
        schedule(backoff);
      }
    }

    const onVisibility = () => {
      if (!document.hidden) schedule(0);
    };
    document.addEventListener('visibilitychange', onVisibility);
    schedule(intervalMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, intervalMs, leagueId, router]);

  /**
   * A refresh that produces no visible change would otherwise leave the
   * spinner up forever. It should not happen — we only refresh when a number
   * moved — but "should not happen" is a poor reason for a permanent spinner.
   */
  useEffect(() => {
    if (!syncing) return;
    const id = setTimeout(() => setSyncing(false), 8_000);
    return () => clearTimeout(id);
  }, [syncing]);

  return { live, syncing };
}
