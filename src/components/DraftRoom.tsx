'use client';

import { useFormState } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { Avatar } from '@/components/Avatar';
import { useLeaguePulse } from '@/lib/live';
import { cn } from '@/lib/ui';
import { draftPickAction, startDraftAction, type ActionState } from '@/server/actions';

export interface DraftPickView {
  pickNumber: number;
  round: number;
  teamId: string;
  teamName: string;
  contestantName: string;
}

export interface DraftRoomProps {
  leagueId: string;
  draftStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  isCommissioner: boolean;
  myTeamId: string | null;
  onTheClockTeamId: string | null;
  currentPickNumber: number;
  currentRound: number;
  totalRounds: number;
  totalPicks: number;
  teams: Array<{ id: string; name: string; ownerName: string | null; position: number | null }>;
  picks: DraftPickView[];
  available: Array<{ id: string; name: string; photoUrl: string | null; occupation: string | null }>;
}

const TAB_TRANSITION = { duration: 0.15 };

/** Fast, because a draft is the one screen where staleness costs you a turn. */
const DRAFT_POLL_MS = 4_000;
const IDLE_POLL_MS = 20_000;

export function DraftRoom(props: DraftRoomProps) {
  const [tab, setTab] = useState<'Board' | 'Picks' | 'Teams'>('Board');
  const [query, setQuery] = useState('');
  /** The contestant whose pick is in flight, so the whole board can lock. */
  const [picking, setPicking] = useState<string | null>(null);

  const drafting = props.draftStatus === 'IN_PROGRESS';
  const myTurn = drafting && props.myTeamId !== null && props.myTeamId === props.onTheClockTeamId;
  const onTheClock = props.teams.find((t) => t.id === props.onTheClockTeamId);

  /**
   * The page re-renders itself whenever the pick count moves, which is what
   * makes someone else's pick appear here without a manual refresh — the whole
   * reason this screen was unusable with more than one person in it.
   */
  const { live, syncing } = useLeaguePulse({
    leagueId: props.leagueId,
    watch: { picks: props.picks.length, draftStatus: props.draftStatus },
    intervalMs: drafting ? DRAFT_POLL_MS : IDLE_POLL_MS,
    enabled: props.draftStatus !== 'COMPLETED',
  });

  const [state, formAction] = useFormState<ActionState, FormData>(draftPickAction, {});

  // A new server render is the signal that the pick landed (or didn't).
  useEffect(() => {
    setPicking(null);
  }, [props.picks.length, state]);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  useAnnounceNewPicks(props.picks, props.myTeamId);
  useAnnounceMyTurn(myTurn, props.currentPickNumber);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return props.available;
    return props.available.filter(
      (c) => c.name.toLowerCase().includes(q) || c.occupation?.toLowerCase().includes(q),
    );
  }, [props.available, query]);

  const myPicks = props.picks.filter((p) => p.teamId === props.myTeamId);

  return (
    <div>
      <div className={cn('card mt-4 p-4', myTurn && 'ring-1 ring-brand-gold')}>
        {props.draftStatus === 'NOT_STARTED' ? (
          <StartDraftPanel leagueId={props.leagueId} isCommissioner={props.isCommissioner} />
        ) : props.draftStatus === 'COMPLETED' ? (
          <p className="text-sm font-medium">
            <span className="text-brand-gold-deep">Houseguests locked in</span> — all{' '}
            {props.totalPicks} picks are in.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-2xs uppercase tracking-wide text-muted">
                  On the clock
                </span>
                <span className="mt-0.5 block truncate text-md font-semibold">
                  {myTurn ? 'You' : (onTheClock?.name ?? '—')}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="pill bg-canvas text-2xs tabular-nums text-muted">
                  {props.currentPickNumber} / {props.totalPicks}
                </span>
                <span className="mt-1 block text-2xs text-muted">
                  Round {props.currentRound} of {props.totalRounds}
                </span>
              </span>
            </div>

            <p className="mt-3 flex items-center gap-1.5 border-t border-hairline pt-3 text-2xs text-muted">
              <LiveDot live={live} syncing={syncing} />
              {!live
                ? 'Reconnecting — this board may be behind'
                : myTurn
                  ? 'Your pick. Choose a houseguest below.'
                  : `Waiting on ${onTheClock?.ownerName ?? onTheClock?.name ?? 'the next manager'}`}
            </p>
          </>
        )}
      </div>

      {drafting && myPicks.length > 0 && (
        <p className="mt-2 px-1 text-2xs text-muted">
          <span className="text-ink">Your roster:</span>{' '}
          {myPicks.map((p) => p.contestantName).join(', ')}
        </p>
      )}

      <div className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto pb-1">
        {(['Board', 'Picks', 'Teams'] as const).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            className={cn('shrink-0', tab === name ? 'tab-active' : 'tab-idle')}
          >
            {name}
            {name === 'Picks' && props.picks.length > 0 && (
              <span className="ml-1.5 tabular-nums opacity-60">{props.picks.length}</span>
            )}
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
              <p className="card p-4 text-xs text-muted">
                {props.available.length === 0
                  ? 'Everyone has been drafted.'
                  : `Nobody matches “${query.trim()}”.`}
              </p>
            ) : (
              <ul className="card divide-y divide-hairline">
                {filtered.map((contestant) => (
                  <li key={contestant.id} className="flex items-center gap-3 p-3.5">
                    <Avatar name={contestant.name} photoUrl={contestant.photoUrl} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold">
                        {contestant.name}
                      </span>
                      <span className="mt-0.5 block truncate text-2xs text-muted">
                        {contestant.occupation ?? 'Houseguest'}
                      </span>
                    </span>
                    {myTurn && props.myTeamId && (
                      <form
                        action={(formData) => {
                          setPicking(contestant.id);
                          formAction(formData);
                        }}
                      >
                        <input type="hidden" name="leagueId" value={props.leagueId} />
                        <input type="hidden" name="teamId" value={props.myTeamId} />
                        <input type="hidden" name="contestantId" value={contestant.id} />
                        <button
                          type="submit"
                          // One pick at a time: on a phone it is far too easy
                          // to tap a second row while the first is in flight,
                          // and only one of them can possibly succeed.
                          disabled={picking !== null}
                          aria-busy={picking === contestant.id}
                          className="btn-primary text-xs disabled:opacity-50"
                        >
                          {picking === contestant.id ? 'Locking…' : 'Lock In'}
                        </button>
                      </form>
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
                {/* Newest first: during a draft the question is always "what
                    just happened", never "what happened first". */}
                {[...props.picks].reverse().map((pick) => (
                  <li
                    key={pick.pickNumber}
                    className={cn(
                      'flex items-center gap-3 p-3.5',
                      pick.teamId === props.myTeamId && 'bg-brand-gold-soft',
                    )}
                  >
                    <span className="w-10 text-2xs tabular-nums text-muted">
                      {pick.round}.{String(pick.pickNumber).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {pick.contestantName}
                      </span>
                      <span className="mt-0.5 block truncate text-2xs text-muted">
                        {pick.teamName}
                      </span>
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

/**
 * Tells you what you missed while you were reading the board.
 *
 * Driven by the pick list rather than by the action's return value, so it
 * reports your own pick and everyone else's through the same path — including
 * a pick you made on your laptop while this phone was open. The first render
 * only records a baseline: arriving at a draft already in progress should not
 * fire a toast for every pick that happened before you opened the page.
 */
function useAnnounceNewPicks(picks: DraftPickView[], myTeamId: string | null) {
  const seen = useRef<number | null>(null);

  useEffect(() => {
    const latest = picks.at(-1);
    const previous = seen.current;
    seen.current = latest?.pickNumber ?? 0;

    if (previous === null || !latest || latest.pickNumber <= previous) return;
    if (latest.teamId === myTeamId) toast.success(`${latest.contestantName} locked in.`);
    else toast(`${latest.teamName} drafted ${latest.contestantName}`);
  }, [picks, myTeamId]);
}

/** The moment that actually matters: it is your turn and you are looking elsewhere. */
function useAnnounceMyTurn(myTurn: boolean, pickNumber: number) {
  const announced = useRef<number | null>(null);

  useEffect(() => {
    if (!myTurn) return;
    if (announced.current === pickNumber) return;
    announced.current = pickNumber;
    toast.success("You're on the clock", { description: 'Pick a houseguest to lock in.' });
    // Unsupported on iOS and a no-op without prior interaction elsewhere, so
    // this is a bonus on the platforms that have it rather than the mechanism.
    navigator.vibrate?.(180);
  }, [myTurn, pickNumber]);
}

function LiveDot({ live, syncing }: { live: boolean; syncing: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'h-1.5 w-1.5 shrink-0 rounded-full',
        !live ? 'bg-muted' : syncing ? 'animate-pulse bg-brand-gold' : 'bg-brand-gold-deep',
      )}
    />
  );
}

function StartDraftPanel({
  leagueId,
  isCommissioner,
}: {
  leagueId: string;
  isCommissioner: boolean;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(startDraftAction, {});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(false);
    if (state.ok) toast.success('Draft started.');
    if (state.error) toast.error(state.error);
  }, [state]);

  if (!isCommissioner) {
    return <p className="text-sm text-muted">Waiting for the commissioner to start the draft.</p>;
  }

  return (
    <form
      action={(formData) => {
        setPending(true);
        formAction(formData);
      }}
      className="flex items-center justify-between gap-3"
    >
      <input type="hidden" name="leagueId" value={leagueId} />
      <span className="text-sm font-medium">Ready when you are.</span>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="btn-primary shrink-0 text-xs disabled:opacity-50"
      >
        {pending ? 'Starting…' : 'Start draft'}
      </button>
      {state.error && <span className="text-2xs text-danger-deep">{state.error}</span>}
    </form>
  );
}
