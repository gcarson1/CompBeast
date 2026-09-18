'use client';

import { useState } from 'react';
import { cn, formatPoints, pointsTone } from '@/lib/ui';

export interface PlayerEvent {
  id: string;
  points: number;
  note: string | null;
  cycleLabel: string;
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
}: {
  events: PlayerEvent[];
  gameLog: PlayerGameLogRow[];
  leagues: Array<{ leagueId: string; leagueName: string; teamName: string }>;
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

      <div className="mt-3">
        {tab === 'Summary' && <SummaryTab events={events} />}
        {tab === 'Game log' && <GameLogTab gameLog={gameLog} events={events} />}
        {tab === 'Leagues' && <LeaguesTab leagues={leagues} />}
      </div>
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
    ELIMINATION_ENDGAME: 'Eviction & endgame',
    SOCIAL_DRAMA: 'Social & drama',
  };

  if (events.length === 0) {
    return <p className="card p-4 text-[13px] text-muted">No scoring events yet this season.</p>;
  }

  return (
    <div className="card divide-y divide-hairline">
      {[...byCategory.entries()].map(([category, value]) => (
        <div key={category} className="flex items-center justify-between p-4">
          <span>
            <span className="block text-[14px] font-medium">{labels[category] ?? category}</span>
            <span className="mt-0.5 block text-[12px] text-muted">
              {value.count} {value.count === 1 ? 'event' : 'events'}
            </span>
          </span>
          <span className={`text-[16px] font-semibold tabular-nums ${pointsTone(value.points)}`}>
            {formatPoints(value.points)}
          </span>
        </div>
      ))}
    </div>
  );
}

function GameLogTab({ gameLog, events }: { gameLog: PlayerGameLogRow[]; events: PlayerEvent[] }) {
  if (gameLog.length === 0) {
    return <p className="card p-4 text-[13px] text-muted">Nothing logged yet.</p>;
  }

  return (
    <div className="space-y-3">
      {gameLog.map((row) => (
        <div key={row.sequence} className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <span className="text-[14px] font-semibold">{row.label}</span>
            <span className={`text-[15px] font-semibold tabular-nums ${pointsTone(row.points)}`}>
              {formatPoints(row.points)}
            </span>
          </div>
          <ul className="divide-y divide-hairline">
            {events
              .filter((e) => e.cycleLabel === row.label)
              .map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{event.label}</span>
                    {event.note && (
                      <span className="mt-0.5 block truncate text-[11px] text-muted">{event.note}</span>
                    )}
                  </span>
                  <span className={`text-[13px] font-medium tabular-nums ${pointsTone(event.points)}`}>
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
}: {
  leagues: Array<{ leagueId: string; leagueName: string; teamName: string }>;
}) {
  if (leagues.length === 0) {
    return <p className="card p-4 text-[13px] text-muted">Undrafted in every league you&apos;re in.</p>;
  }

  return (
    <ul className="card divide-y divide-hairline">
      {leagues.map((entry) => (
        <li key={entry.leagueId} className="flex items-center justify-between p-4">
          <span>
            <span className="block text-[14px] font-medium">{entry.leagueName}</span>
            <span className="mt-0.5 block text-[12px] text-muted">Rostered by {entry.teamName}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
