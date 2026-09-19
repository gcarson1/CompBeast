'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { Avatar } from '@/components/Avatar';
import { formatPoints, pointsTone } from '@/lib/ui';
import type { LeaderboardRow } from '@/server/queries';

const PULL_THRESHOLD = 64;
const MAX_PULL = 90;
// Deliberate friction before the refresh even starts — the "spinning key"
// moment the pull is supposed to earn, not an instant, un-anticipated update.
const REVEAL_DELAY_MS = 1500;

export function Leaderboard({
  rows,
  myTeamId,
}: {
  rows: LeaderboardRow[];
  myTeamId: string | null;
}) {
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
    if (revealing || window.scrollY > 0) return;
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

  const runRefresh = async () => {
    setRevealing(true);
    setPull(PULL_THRESHOLD);
    await new Promise((resolve) => setTimeout(resolve, REVEAL_DELAY_MS));
    startTransition(() => router.refresh());
  };

  const onPointerUp = async () => {
    if (startY.current === null) return;
    startY.current = null;

    if (pull < PULL_THRESHOLD) {
      setPull(0);
      return;
    }

    await runRefresh();
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
          className="btn-ghost min-h-0 px-3 py-1.5 text-xs disabled:opacity-50"
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
        <motion.svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          animate={{ rotate: revealing ? 360 : (pull / MAX_PULL) * 180 }}
          transition={
            revealing ? { repeat: Infinity, duration: 0.7, ease: 'linear' } : { duration: 0 }
          }
        >
          <circle cx="8" cy="8" r="4" />
          <path d="M11 11 20 20M15.5 15.5 18 13M18.5 18.5 21 16" strokeLinecap="round" />
        </motion.svg>
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
              <motion.li key={row.teamId} layout transition={{ type: 'spring', stiffness: 350, damping: 32 }}>
                <Link
                  href={`/teams/${row.teamId}`}
                  className={`flex items-center gap-3 p-4 transition ${isMine ? 'bg-brand-gold-soft/40' : ''}`}
                >
                  <span className="w-6 text-base font-semibold tabular-nums text-muted">{row.rank}</span>
                  <Avatar name={row.ownerName ?? row.teamName} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">
                      {row.teamName}
                      {isMine && <span className="ml-1.5 text-2xs text-brand-gold-deep">you</span>}
                    </span>
                    <span className="mt-0.5 block text-2xs text-muted">
                      {row.ownerName} · {row.activeCount}/{row.rosterCount} still in
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-lg font-semibold tabular-nums">{row.totalPoints}</span>
                    <span className={`block text-2xs tabular-nums ${pointsTone(row.lastCyclePoints)}`}>
                      {formatPoints(row.lastCyclePoints)}
                    </span>
                  </span>
                </Link>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
