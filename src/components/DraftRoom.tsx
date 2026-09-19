'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
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
  available: Array<{ id: string; name: string; photoUrl: string | null; occupation: string | null }>;
}

const TAB_TRANSITION = { duration: 0.15 };

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
          <p className="text-sm font-medium">
            <span className="text-brand-gold-deep">Houseguests locked in</span> — all {props.totalPicks}{' '}
            picks are in.
          </p>
        ) : (
          <div className="flex items-center justify-between">
            <span>
              <span className="block text-2xs uppercase tracking-wide text-muted">On the clock</span>
              <span className="mt-0.5 block text-md font-semibold">
                {onTheClock?.name ?? '—'}
                {myTurn && <span className="ml-2 text-2xs text-brand-gold-deep">your pick</span>}
              </span>
            </span>
            <span className="pill bg-canvas text-2xs text-muted">
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

      <AnimatePresence mode="wait" initial={false}>
        {tab === 'Board' && (
          <motion.div
            key="Board"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={TAB_TRANSITION}
            className="mt-3"
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search houseguests"
              className="field mb-3"
              aria-label="Search houseguests"
            />
            {filtered.length === 0 ? (
              <p className="card p-4 text-xs text-muted">Everyone has been drafted.</p>
            ) : (
              <ul className="card divide-y divide-hairline">
                {filtered.map((contestant) => (
                  <li key={contestant.id} className="flex items-center gap-3 p-3.5">
                    <Avatar name={contestant.name} photoUrl={contestant.photoUrl} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold">{contestant.name}</span>
                      <span className="mt-0.5 block truncate text-2xs text-muted">
                        {contestant.occupation ?? 'Houseguest'}
                      </span>
                    </span>
                    {myTurn && props.myTeamId && (
                      <PickButton
                        leagueId={props.leagueId}
                        teamId={props.myTeamId}
                        contestantId={contestant.id}
                        contestantName={contestant.name}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}

        {tab === 'Picks' && (
          <motion.div
            key="Picks"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={TAB_TRANSITION}
            className="mt-3"
          >
            {props.picks.length === 0 ? (
              <p className="card p-4 text-xs text-muted">No picks yet.</p>
            ) : (
              <ul className="card divide-y divide-hairline">
                {props.picks.map((pick) => (
                  <li key={pick.pickNumber} className="flex items-center gap-3 p-3.5">
                    <span className="w-10 text-2xs tabular-nums text-muted">
                      {pick.round}.{String(pick.pickNumber).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{pick.contestantName}</span>
                      <span className="mt-0.5 block truncate text-2xs text-muted">{pick.teamName}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}

        {tab === 'Teams' && (
          <motion.ul
            key="Teams"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={TAB_TRANSITION}
            className="card mt-3 divide-y divide-hairline"
          >
            {props.teams.map((team) => (
              <li key={team.id} className="flex items-center gap-3 p-3.5">
                <span className="w-5 text-xs tabular-nums text-muted">{team.position ?? '—'}</span>
                <Avatar name={team.ownerName ?? team.name} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{team.name}</span>
                  <span className="mt-0.5 block truncate text-2xs text-muted">{team.ownerName}</span>
                </span>
                {team.id === props.onTheClockTeamId && (
                  <span className="pill bg-brand-gold-soft text-2xs text-brand-gold-deep">
                    on the clock
                  </span>
                )}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function PickButton({
  leagueId,
  teamId,
  contestantId,
  contestantName,
}: {
  leagueId: string;
  teamId: string;
  contestantId: string;
  contestantName: string;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(draftPickAction, {});

  useEffect(() => {
    if (state.ok) toast.success(`${contestantName} locked in.`);
    if (state.error) toast.error(state.error);
    // contestantName is a stable prop per row; only the action result should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, state.error]);

  return (
    <form action={formAction}>
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="contestantId" value={contestantId} />
      <SubmitButton label="Lock In" />
      {state.error && <span className="mt-1 block text-2xs text-danger-deep">{state.error}</span>}
    </form>
  );
}

function StartDraftPanel({ leagueId, isCommissioner }: { leagueId: string; isCommissioner: boolean }) {
  const [state, formAction] = useFormState<ActionState, FormData>(startDraftAction, {});

  useEffect(() => {
    if (state.ok) toast.success('Draft started.');
    if (state.error) toast.error(state.error);
  }, [state.ok, state.error]);

  if (!isCommissioner) {
    return <p className="text-sm text-muted">Waiting for the commissioner to start the draft.</p>;
  }

  return (
    <form action={formAction} className="flex items-center justify-between gap-3">
      <input type="hidden" name="leagueId" value={leagueId} />
      <span className="text-sm font-medium">Ready when you are.</span>
      <SubmitButton label="Start draft" />
      {state.error && <span className="text-2xs text-danger-deep">{state.error}</span>}
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary text-xs disabled:opacity-50">
      {pending ? '…' : label}
    </button>
  );
}
