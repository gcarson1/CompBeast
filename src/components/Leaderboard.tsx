'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { m } from 'framer-motion';
import { appScroller } from '@/components/AppScroller';
import { Avatar } from '@/components/Avatar';
import { RankPlate, Tag } from '@/components/Tag';
import { cn, formatPoints, pointsTone } from '@/lib/ui';
import type { LeaderboardRow } from '@/server/queries';

const PULL_THRESHOLD = 64;
const MAX_PULL = 90;

export function Leaderboard({ rows, myTeamId }: { rows: LeaderboardRow[]; myTeamId: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pull, setPull] = useState(0);
  const [revealing, setRevealing] = useState(false);
  const startY = useRef<number | null>(null);

  // Keep the spinner up until the refreshed rows have actually committed,
  // not just until router.refresh() was called.
  useEffect(() => {
    if (!isPending && revealing && startY.current === null) {
      setRevealing(false);
      setPull(0);
    }
  }, [isPending, revealing]);

  const onPointerDown = (e: React.PointerEvent) => {
    // Only from the very top of the page, like every pull-to-refresh. The page
    // scrolls inside the app shell, not the document (AppScroller.tsx).
    if (revealing || appScroller().scrollTop > 0) return;
    startY.current = e.clientY;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (startY.current === null) return;
    const delta = e.clientY - startY.current;
    if (delta <= 0) {
      setPull(0);
      return;
    }
    if (e.cancelable) e.preventDefault();
    setPull(Math.min(delta * 0.5, MAX_PULL));
  };

  // A cancelled pointer (the OS taking over for a system gesture, a stray
  // touch) means the gesture was abandoned, not completed — it should undo the
  // pull, not commit it the way routing it through onPointerUp used to.
  const onPointerCancel = () => {
    startY.current = null;
    setPull(0);
  };

  // The key spins for exactly as long as the refresh takes. There used to be
  // a fixed 1.5s pause here before the request even went out, to make the
  // gesture feel earned; a delay that exists only to be noticed is the one
  // kind of slowness nobody thanks you for.
  const runRefresh = () => {
    setRevealing(true);
    setPull(PULL_THRESHOLD);
    startTransition(() => router.refresh());
  };

  const onPointerUp = () => {
    if (startY.current === null) return;
    startY.current = null;

    if (pull < PULL_THRESHOLD) {
      setPull(0);
      return;
    }

    runRefresh();
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {/*
        A pull gesture is invisible and undiscoverable, and it is unreachable
        entirely by keyboard, switch control, or anyone who simply does not
        know to try it. It stays as an enhancement for people who expect it,
        but the button is the real control — same delay, same animation.
      */}
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={runRefresh}
          disabled={revealing || isPending}
          className="btn-ghost btn-sm disabled:opacity-50"
        >
          {revealing || isPending ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Announces the result to a screen reader, which cannot see rows reorder. */}
      <p aria-live="polite" className="sr-only">
        {revealing || isPending ? 'Refreshing the leaderboard' : `Leaderboard: ${rows.length} teams`}
      </p>

      <div
        className="flex items-center justify-center overflow-hidden text-brand-gold transition-[height]"
        style={{ height: pull }}
      >
        <m.svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          animate={{ rotate: revealing ? 360 : (pull / MAX_PULL) * 180 }}
          transition={revealing ? { repeat: Infinity, duration: 0.7, ease: 'linear' } : { duration: 0 }}
        >
          <circle cx="8" cy="8" r="4" />
          <path d="M11 11 20 20M15.5 15.5 18 13M18.5 18.5 21 16" strokeLinecap="round" />
        </m.svg>
      </div>

      {rows.length === 0 ? (
        <p className="card p-4 text-xs text-muted">
          No teams yet. Share the invite code to get your league going.
        </p>
      ) : (
        <ul className="card divide-y divide-hairline overflow-hidden">
          {rows.map((row) => {
            const isMine = row.teamId === myTeamId;
            return (
              <m.li key={row.teamId} layout transition={{ type: 'spring', stiffness: 350, damping: 32 }}>
                <Link
                  href={`/teams/${row.teamId}`}
                  className={cn(
                    'relative flex items-center gap-3 p-4 transition duration-200 ease-soft hover:bg-surface-raised motion-safe:active:scale-[0.99]',
                    // Your own row: a wash of gold and a gold edge on the left,
                    // so it is found without reading a single name.
                    isMine &&
                      'bg-gradient-to-r from-brand-gold/[0.14] to-brand-gold/[0.03] before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r-pill before:bg-brand-gold',
                  )}
                >
                  <RankPlate rank={row.rank} />
                  <Avatar name={row.ownerName ?? row.teamName} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-base font-semibold">
                      <span className="min-w-0 truncate">{row.teamName}</span>
                      {isMine && (
                        <Tag tone="mint" size="sm">
                          You
                        </Tag>
                      )}
                    </span>
                    <span className="mt-0.5 block text-2xs text-muted">
                      {row.ownerName} · {row.activeCount}/{row.rosterCount} still in
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-display text-2xl leading-none tracking-wide">
                      {row.totalPoints}
                    </span>
                    <span className={`mt-1 block text-2xs tabular-nums ${pointsTone(row.lastCyclePoints)}`}>
                      {formatPoints(row.lastCyclePoints)}
                    </span>
                  </span>
                </Link>
              </m.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
