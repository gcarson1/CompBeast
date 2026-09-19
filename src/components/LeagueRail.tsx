'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AvatarStack } from '@/components/Avatar';
import { formatPoints, pointsTone, relativeTime } from '@/lib/ui';
import type { HomeLeagueCard } from '@/server/queries';

const DRAFT_LABEL: Record<string, string> = {
  NOT_STARTED: 'Pre-draft',
  IN_PROGRESS: 'Drafting',
  COMPLETED: 'In season',
};

/**
 * The league picker on the home page: one card per league, scrolling
 * sideways.
 *
 * The scroll itself is native (`overflow-x-auto` + scroll snap), so it works
 * before hydration, with a touch swipe, and with a trackpad. The arrows exist
 * for the mouse-and-desktop case, where sideways scrolling is otherwise a
 * discoverability problem — they appear only when the rail actually overflows
 * and disable themselves at each end, so they never sit there as dead
 * controls. Keyboard users get the container as a focus stop for arrow keys
 * (WCAG 2.1.1) only when there is something to scroll.
 */
export function LeagueRail({ leagues, caption }: { leagues: HomeLeagueCard[]; caption: string }) {
  const scrollerRef = useRef<HTMLUListElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // 1px of slack: fractional layout widths make an exact comparison flicker.
    const canScroll = el.scrollWidth - el.clientWidth > 1;
    setOverflowing(canScroll);
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, leagues.length]);

  const page = (direction: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    // A near-full pane keeps a sliver of the next card visible, which is the
    // affordance that says the rail continues.
    el.scrollBy({ left: direction * (el.clientWidth * 0.85), behavior: 'smooth' });
  };

  return (
    <div>
      <div className="mb-2 flex min-h-[36px] items-center justify-between gap-3">
        <p className="text-xs text-muted">{caption}</p>
        {overflowing && (
          <div className="flex shrink-0 gap-2">
            <RailButton direction="prev" disabled={atStart} onClick={() => page(-1)} />
            <RailButton direction="next" disabled={atEnd} onClick={() => page(1)} />
          </div>
        )}
      </div>

      <ul
        ref={scrollerRef}
        onScroll={measure}
        // -mx-5 px-5 lets the row bleed to the screen edges inside the app's
        // padded shell, so a card can scroll off the edge instead of stopping
        // at a margin — the thing that makes a rail read as scrollable.
        //
        // scroll-px-5 has to match that padding. Without it the snap area
        // starts at the border edge, so the browser settles at scrollLeft 20
        // to sit the first card flush: it eats the gutter (the card stops
        // lining up with the heading above it) and `scrollLeft <= 1` is then
        // never true, which left the Previous arrow permanently enabled.
        className="no-scrollbar -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-1"
        {...(overflowing
          ? { tabIndex: 0, role: 'region', 'aria-label': 'Your leagues, scrollable' }
          : {})}
      >
        {leagues.map((league) => (
          <li key={league.leagueId} className="w-[16.5rem] shrink-0 snap-start">
            <LeagueCard league={league} />
          </li>
        ))}
        <li className="w-[16.5rem] shrink-0 snap-start">
          <AddLeagueCard />
        </li>
      </ul>
    </div>
  );
}

function LeagueCard({ league }: { league: HomeLeagueCard }) {
  const alert = league.atRisk ?? league.nearMiss;
  const alertTone = league.atRisk ? 'text-danger-deep' : 'text-brand-gold-deep';

  return (
    <Link
      href={`/leagues/${league.leagueId}`}
      className="card flex h-full flex-col p-4 transition active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-2">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-brand-gold/30 bg-brand-gold-soft font-display text-md leading-none text-brand-gold-deep"
        >
          {league.leagueName.slice(0, 1).toUpperCase()}
        </span>
        <span className="pill bg-canvas text-2xs text-muted">
          {DRAFT_LABEL[league.draftStatus] ?? league.draftStatus}
        </span>
      </div>

      <h3 className="mt-3 truncate text-base font-semibold">{league.leagueName}</h3>
      <p className="mt-0.5 truncate text-2xs text-muted">
        {league.showName} · {league.seasonName}
      </p>

      {league.teamId ? (
        <div className="mt-3 flex items-end justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-2xs text-muted">{league.teamName}</span>
            <span className="font-display text-4xl leading-none tracking-wide">
              {league.totalPoints}
            </span>
          </span>
          <span className="shrink-0 text-right">
            {league.rank > 0 && (
              <span
                className={`pill text-2xs ${
                  league.rank === 1 ? 'bg-brand-gold text-on-gold' : 'bg-canvas text-muted'
                }`}
              >
                #{league.rank}
              </span>
            )}
            <span
              className={`mt-1 block text-2xs font-semibold tabular-nums ${pointsTone(
                league.lastCyclePoints,
              )}`}
            >
              {formatPoints(league.lastCyclePoints)} last
            </span>
          </span>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">You have no team in this league yet.</p>
      )}

      {/* mt-auto pins the footer to the bottom so cards of different heights
          still line their footers up across the rail. */}
      <div className="mt-auto pt-3">
        {alert && <p className={`mb-2 line-clamp-2 text-2xs font-medium ${alertTone}`}>{alert}</p>}

        {league.currentCycleLabel && league.locksAt && (
          <p className="mb-2 truncate text-2xs text-muted">
            {league.cycleLocked
              ? `${league.currentCycleLabel} · locked`
              : `Rosters lock ${relativeTime(league.locksAt)}`}
          </p>
        )}

        <div className="flex items-center justify-between border-t border-hairline pt-3">
          <AvatarStack names={league.memberNames} />
          <span className="text-2xs text-muted">
            {league.teamCount}/{league.maxTeams} teams
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Always the last card, so the rail never dead-ends without an action. */
function AddLeagueCard() {
  return (
    <div className="flex h-full flex-col rounded-card border border-dashed border-brand-gold-deep/50 bg-brand-gold-soft/30 p-4">
      <BoltIcon className="text-brand-gold-deep" />
      <h3 className="mt-2 text-base font-semibold">Start or join</h3>
      <p className="mt-0.5 text-2xs leading-relaxed text-muted">
        Run a league for any season, or jump into a friend&apos;s with their code.
      </p>
      <div className="mt-auto flex gap-2 pt-3">
        <Link href="/leagues/join" prefetch={false} className="btn-ghost btn-sm flex-1">
          Join
        </Link>
        <Link href="/leagues/new" prefetch={false} className="btn-primary btn-sm flex-1">
          Create
        </Link>
      </div>
    </div>
  );
}

function RailButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'prev' | 'next';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'prev' ? 'Scroll to previous leagues' : 'Scroll to more leagues'}
      className="grid h-9 w-9 place-items-center rounded-full border border-hairline bg-surface text-muted transition hover:text-ink disabled:opacity-30"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path
          d={direction === 'prev' ? 'M15 5 8 12l7 7' : 'M9 5l7 7-7 7'}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" strokeLinejoin="round" />
    </svg>
  );
}
