'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { lower, type ShowLexicon } from '@/lib/shows/lexicon';
import { cn, formatPoints, pointsTone } from '@/lib/ui';
import type { ContestantLeagueLine } from '@/server/queries';

export interface PlayerEvent {
  id: string;
  points: number;
  note: string | null;
  cycleLabel: string;
  /** Grouping key. Labels are display text and two cycles can share one. */
  cycleSequence: number;
  label: string;
  category: string;
}

export interface PlayerGameLogRow {
  sequence: number;
  label: string;
  points: number;
  count: number;
}

const TABS = ['Summary', 'Game log', 'Leagues'] as const;
type Tab = (typeof TABS)[number];

export function PlayerTabs({
  events,
  gameLog,
  leagues,
  signedIn,
  lexicon,
}: {
  events: PlayerEvent[];
  gameLog: PlayerGameLogRow[];
  /** The viewer's leagues that drafted this player; always empty signed out. */
  leagues: ContestantLeagueLine[];
  signedIn: boolean;
  lexicon: ShowLexicon;
}) {
  const [tab, setTab] = useState<Tab>('Summary');

  return (
    <div className="mt-5">
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            className={cn('shrink-0', tab === name ? 'tab-active' : 'tab-idle')}
          >
            {name}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
          className="mt-3"
        >
          {tab === 'Summary' && <SummaryTab events={events} />}
          {tab === 'Game log' && <GameLogTab gameLog={gameLog} events={events} />}
          {tab === 'Leagues' && <LeaguesTab leagues={leagues} signedIn={signedIn} lexicon={lexicon} />}
        </m.div>
      </AnimatePresence>
    </div>
  );
}

function SummaryTab({ events }: { events: PlayerEvent[] }) {
  const byCategory = new Map<string, { points: number; count: number }>();
  for (const event of events) {
    const bucket = byCategory.get(event.category) ?? { points: 0, count: 0 };
    bucket.points += event.points;
    bucket.count += 1;
    byCategory.set(event.category, bucket);
  }

  const labels: Record<string, string> = {
    COMPETITION_GAMEPLAY: 'Competition & gameplay',
    ELIMINATION_ENDGAME: 'Elimination & endgame',
    SOCIAL_DRAMA: 'Social & drama',
  };

  if (events.length === 0) {
    return <p className="card p-4 text-xs text-muted">No scoring events yet this season.</p>;
  }

  return (
    <div className="card divide-y divide-hairline">
      {[...byCategory.entries()].map(([category, value]) => (
        <div key={category} className="flex items-center justify-between p-4">
          <span>
            <span className="block text-sm font-medium">{labels[category] ?? category}</span>
            <span className="mt-0.5 block text-2xs text-muted">
              {value.count} {value.count === 1 ? 'event' : 'events'}
            </span>
          </span>
          <span className={`text-md font-semibold tabular-nums ${pointsTone(value.points)}`}>
            {formatPoints(value.points)}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Newest first, both between weeks and inside them.
 *
 * The reversal lives here rather than in the query on purpose. `gameLog` is
 * built from the same ascending `events` the Summary tab aggregates, and the
 * team-level equivalent of this list is read elsewhere with `.at(-1)` to mean
 * "the latest cycle" — flipping the data underneath those callers would
 * silently hand them the oldest week instead. Presentation order is a
 * presentation concern.
 */
function GameLogTab({ gameLog, events }: { gameLog: PlayerGameLogRow[]; events: PlayerEvent[] }) {
  if (gameLog.length === 0) {
    return <p className="card p-4 text-xs text-muted">Nothing logged yet.</p>;
  }

  const newestFirst = [...gameLog].sort((a, b) => b.sequence - a.sequence);

  return (
    <div className="space-y-3">
      {newestFirst.map((row) => (
        <div key={row.sequence} className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <span className="text-sm font-semibold">{row.label}</span>
            <span className={`text-base font-semibold tabular-nums ${pointsTone(row.points)}`}>
              {formatPoints(row.points)}
            </span>
          </div>
          <ul className="divide-y divide-hairline">
            {events
              // Match on sequence, not the display label — two cycles can
              // carry the same text and would pool into one week.
              .filter((e) => e.cycleSequence === row.sequence)
              // Events arrive oldest-first within a cycle; the last thing that
              // happened belongs at the top of the week too, not the bottom.
              .reverse()
              .map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs">{event.label}</span>
                    {event.note && (
                      <span className="mt-0.5 block truncate text-2xs text-muted">{event.note}</span>
                    )}
                  </span>
                  <span className={`text-xs font-medium tabular-nums ${pointsTone(event.points)}`}>
                    {formatPoints(event.points)}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function LeaguesTab({
  leagues,
  signedIn,
  lexicon,
}: {
  leagues: ContestantLeagueLine[];
  signedIn: boolean;
  lexicon: ShowLexicon;
}) {
  if (!signedIn) {
    return (
      <p className="card p-4 text-xs text-muted">
        Sign in to see which of your leagues drafted this {lower(lexicon.contestantSingular)}.
      </p>
    );
  }
  if (leagues.length === 0) {
    return <p className="card p-4 text-xs text-muted">Undrafted in every league you&apos;re in.</p>;
  }

  return (
    <ul className="card divide-y divide-hairline">
      {leagues.map((entry) => (
        <li key={entry.leagueId}>
          <Link
            href={`/leagues/${entry.leagueId}`}
            className="flex items-center justify-between gap-3 p-4 transition hover:bg-surface-raised"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{entry.leagueName}</span>
              <span className="mt-0.5 block truncate text-2xs text-muted">Rostered by {entry.teamName}</span>
            </span>
            <span aria-hidden className="text-muted">
              →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
