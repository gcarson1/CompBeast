'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useMemo, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { cn } from '@/lib/ui';
import { draftPickAction, startDraftAction, type ActionState } from '@/server/actions';

export interface DraftRoomProps {
  leagueId: string;
  draftStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  isCommissioner: boolean;
  myTeamId: string | null;
  onTheClockTeamId: string | null;
  currentPickNumber: number;
  totalPicks: number;
  teams: Array<{ id: string; name: string; ownerName: string | null; position: number | null }>;
  picks: Array<{ pickNumber: number; round: number; teamName: string; contestantName: string }>;
  available: Array<{ id: string; name: string; occupation: string | null }>;
}

export function DraftRoom(props: DraftRoomProps) {
  const [tab, setTab] = useState<'Board' | 'Picks' | 'Teams'>('Board');
  const [query, setQuery] = useState('');

  const myTurn =
    props.draftStatus === 'IN_PROGRESS' &&
    props.myTeamId !== null &&
    props.myTeamId === props.onTheClockTeamId;
  const onTheClock = props.teams.find((t) => t.id === props.onTheClockTeamId);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return props.available;
    return props.available.filter(
      (c) => c.name.toLowerCase().includes(q) || c.occupation?.toLowerCase().includes(q),
    );
  }, [props.available, query]);

  return (
    <div>
      <div className="card mt-4 p-4">
        {props.draftStatus === 'NOT_STARTED' ? (
          <StartDraftPanel leagueId={props.leagueId} isCommissioner={props.isCommissioner} />
        ) : props.draftStatus === 'COMPLETED' ? (
          <p className="text-[14px] font-medium">Draft complete — all {props.totalPicks} picks are in.</p>
        ) : (
          <div className="flex items-center justify-between">
            <span>
              <span className="block text-[12px] uppercase tracking-wide text-muted">On the clock</span>
              <span className="mt-0.5 block text-[16px] font-semibold">
                {onTheClock?.name ?? '—'}
                {myTurn && <span className="ml-2 text-[12px] text-lime-deep">your pick</span>}
              </span>
            </span>
            <span className="pill bg-canvas text-[12px] text-muted">
              {props.currentPickNumber} / {props.totalPicks}
            </span>
          </div>
        )}
      </div>

      <div className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto pb-1">
        {(['Board', 'Picks', 'Teams'] as const).map((name) => (
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

      {tab === 'Board' && (
        <div className="mt-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search houseguests"
            className="field mb-3"
            aria-label="Search houseguests"
          />
          {filtered.length === 0 ? (
            <p className="card p-4 text-[13px] text-muted">Everyone has been drafted.</p>
          ) : (
            <ul className="card divide-y divide-hairline">
              {filtered.map((contestant) => (
                <li key={contestant.id} className="flex items-center gap-3 p-3.5">
                  <Avatar name={contestant.name} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{contestant.name}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted">
                      {contestant.occupation ?? 'Houseguest'}
                    </span>
                  </span>
                  {myTurn && props.myTeamId && (
                    <PickButton
                      leagueId={props.leagueId}
                      teamId={props.myTeamId}
                      contestantId={contestant.id}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'Picks' && (
        <div className="mt-3">
          {props.picks.length === 0 ? (
            <p className="card p-4 text-[13px] text-muted">No picks yet.</p>
          ) : (
            <ul className="card divide-y divide-hairline">
              {props.picks.map((pick) => (
                <li key={pick.pickNumber} className="flex items-center gap-3 p-3.5">
                  <span className="w-10 text-[12px] tabular-nums text-muted">
                    {pick.round}.{String(pick.pickNumber).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{pick.contestantName}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted">{pick.teamName}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'Teams' && (
        <ul className="card mt-3 divide-y divide-hairline">
          {props.teams.map((team) => (
            <li key={team.id} className="flex items-center gap-3 p-3.5">
              <span className="w-5 text-[13px] tabular-nums text-muted">{team.position ?? '—'}</span>
              <Avatar name={team.ownerName ?? team.name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{team.name}</span>
                <span className="mt-0.5 block truncate text-[12px] text-muted">{team.ownerName}</span>
              </span>
              {team.id === props.onTheClockTeamId && (
                <span className="pill bg-lime-soft text-[11px] text-lime-deep">on the clock</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PickButton({
  leagueId,
  teamId,
  contestantId,
}: {
  leagueId: string;
  teamId: string;
  contestantId: string;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(draftPickAction, {});

  return (
    <form action={formAction}>
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="contestantId" value={contestantId} />
      <SubmitButton label="Draft" />
      {state.error && <span className="mt-1 block text-[11px] text-danger">{state.error}</span>}
    </form>
  );
}

function StartDraftPanel({ leagueId, isCommissioner }: { leagueId: string; isCommissioner: boolean }) {
  const [state, formAction] = useFormState<ActionState, FormData>(startDraftAction, {});

  if (!isCommissioner) {
    return <p className="text-[14px] text-muted">Waiting for the commissioner to start the draft.</p>;
  }

  return (
    <form action={formAction} className="flex items-center justify-between gap-3">
      <input type="hidden" name="leagueId" value={leagueId} />
      <span className="text-[14px] font-medium">Ready when you are.</span>
      <SubmitButton label="Start draft" />
      {state.error && <span className="text-[11px] text-danger">{state.error}</span>}
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary text-[13px] disabled:opacity-50">
      {pending ? '…' : label}
    </button>
  );
}
