'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AvatarStack } from '@/components/Avatar';
import { BeastDoodle } from '@/components/doodles/BeastDoodle';
import { Doodle } from '@/components/doodles/Doodle';
import { MotionCard } from '@/components/motion/MotionCard';
import { Sticker } from '@/components/Sticker';
import { cn, formatPoints, pointsTone, relativeTime } from '@/lib/ui';
import type { HomeLeagueCard } from '@/server/queries';

const DRAFT_LABEL: Record<string, string> = {
  NOT_STARTED: 'Pre-draft',
  IN_PROGRESS: 'Drafting',
  COMPLETED: 'In season',
};

// The monogram chip cycles through the tile tones by position, so a row of
// leagues reads as a set of distinct objects rather than four of the same
// card. Spelled out so Tailwind's scan keeps every class.
const CHIP_TONES = ['clay-gold', 'clay-lavender', 'clay-mint', 'clay-sky'] as const;

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
        //
        // -mt-8 pt-8: the status sticker and the mascot sit proud of the card's
        // top edge, and a scroll container clips on both axes, so the scroll
        // box has to start above the cards for the overhang to show.
        className="no-scrollbar -mx-5 -mt-8 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-3 pt-8"
        {...(overflowing
          ? { tabIndex: 0, role: 'region', 'aria-label': 'Your leagues, scrollable' }
          : {})}
      >
        {leagues.map((league, index) => (
          <li key={league.leagueId} className="w-[16.5rem] shrink-0 snap-start">
            <LeagueCard league={league} chipTone={CHIP_TONES[index % CHIP_TONES.length]} />
          </li>
        ))}
        <li className="w-[16.5rem] shrink-0 snap-start">
          <AddLeagueCard />
        </li>
      </ul>
    </div>
  );
}

function LeagueCard({
  league,
  chipTone,
}: {
  league: HomeLeagueCard;
  chipTone: (typeof CHIP_TONES)[number];
}) {
  const alert = league.atRisk ?? league.nearMiss;
  const alertTone = league.atRisk ? 'text-danger-deep' : 'text-brand-gold-deep';
  const leading = league.rank === 1;

  return (
    // The motion frame carries the tile chrome; the link inside it is the
    // control, so the focus ring lands on what the keyboard actually operates.
    <MotionCard tilt className="relative h-full">
      {/* The status sticker overhangs the top-right corner — a tag stuck on
          the card rather than printed in it. */}
      <Sticker tilt="r" seed={league.leagueId} className="absolute -right-2 -top-3 z-10">
        {DRAFT_LABEL[league.draftStatus] ?? league.draftStatus}
      </Sticker>

      <Link
        href={`/leagues/${league.leagueId}`}
        className="flex h-full flex-col rounded-card p-4"
      >
        <span aria-hidden className={cn('clay h-11 w-11 font-display text-lg leading-none', chipTone)}>
          {league.leagueName.slice(0, 1).toUpperCase()}
        </span>

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
            <span className="flex shrink-0 flex-col items-end">
              {league.rank > 0 && (
                <Sticker tone={leading ? 'gold' : 'ink'} tilt="l" seed={league.leagueId}>
                  {/* The crown is decoration; "#1" is the fact. */}
                  {leading && <Doodle kind="crown" className="-ml-1 h-4 w-4" />}#{league.rank}
                </Sticker>
              )}
              <span
                className={`mt-1.5 block text-2xs font-semibold tabular-nums ${pointsTone(
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
            <AvatarStack names={league.memberNames} total={league.memberCount} />
            <span className="text-2xs text-muted">
              {league.teamCount}/{league.maxTeams} teams
            </span>
          </div>
        </div>
      </Link>
    </MotionCard>
  );
}

/** Always the last card, so the rail never dead-ends without an action. */
function AddLeagueCard() {
  return (
    <div className="card-pop-gold card-lift relative flex h-full flex-col p-4">
      {/* Peeks over the top-right corner, half outside the tile. Purely
          decorative, and the tile's copy says everything it says. */}
      <BeastDoodle mood="wink" className="absolute -right-3 -top-7 h-16 w-16 rotate-6" />
      <Doodle kind="tally" tone="paper" className="absolute left-3 top-3 h-7 w-7 -rotate-6" />
      <span className="clay clay-lavender mt-6 h-11 w-11">
        <BoltIcon className="text-pop-lavender-ink" />
      </span>
      <h3 className="headline mt-3">Start or join</h3>
      <p className="mt-1 text-2xs leading-relaxed text-tile-muted">
        Run a league for any season, or jump into a friend&apos;s with their code.
      </p>
      <div className="mt-auto flex gap-2 pt-3">
        <Link
          href="/leagues/join"
          prefetch={false}
          className="btn btn-sm flex-1 border-2 border-pop-gold-ink/20 bg-white/40 text-pop-gold-ink hover:bg-white/60"
        >
          Join
        </Link>
        <Link
          href="/leagues/new"
          prefetch={false}
          className="btn btn-sm flex-1 bg-pop-gold-ink text-brand-gold-deep hover:bg-black"
        >
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
      className="grid h-9 w-9 place-items-center rounded-full border border-hairline bg-surface text-muted transition duration-200 ease-spring hover:text-ink motion-safe:hover:scale-110 motion-safe:active:scale-90 disabled:opacity-30 disabled:hover:scale-100"
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
