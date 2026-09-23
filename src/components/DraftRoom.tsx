'use client';

import { useFormState } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { toast } from 'sonner';
import { Avatar } from '@/components/Avatar';
import { Tag } from '@/components/Tag';
import { useLeaguePulse, type PulseStatus } from '@/lib/live';
import { lower, type ShowLexicon } from '@/lib/shows/lexicon';
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
  available: Array<{
    id: string;
    name: string;
    photoUrl: string | null;
    occupation: string | null;
    /** The Traitors: holding a cloak, once the broadcast has shown it. */
    traitor?: boolean;
    /** False once they have been eliminated — still draftable, rarely wise. */
    isActive: boolean;
  }>;
  lexicon: ShowLexicon;
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
  const { status, syncing } = useLeaguePulse({
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
  useAnnounceMyTurn(myTurn, props.currentPickNumber, lower(props.lexicon.contestantSingular));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? props.available.filter(
          (c) => c.name.toLowerCase().includes(q) || c.occupation?.toLowerCase().includes(q),
        )
      : props.available;
    // Evicted houseguests sink. Nothing stops you drafting one — a late-season
    // league might want the points they already banked — but they should never
    // be the first name your thumb lands on.
    return [...matches].sort((a, b) => Number(b.isActive) - Number(a.isActive));
  }, [props.available, query]);

  const myPicks = props.picks.filter((p) => p.teamId === props.myTeamId);

  return (
    <div>
      {/* Your turn lights the clock in the show's colour; anyone else's
          turn is a plain tile, so the page itself says whose move it is. */}
      <div className={cn('mt-5 p-4', myTurn ? 'card-feature' : 'card')}>
        {props.draftStatus === 'NOT_STARTED' ? (
          <StartDraftPanel leagueId={props.leagueId} isCommissioner={props.isCommissioner} />
        ) : props.draftStatus === 'COMPLETED' ? (
          <p className="text-sm font-medium">
            <span className="text-brand-gold-deep">{props.lexicon.contestantPlural} locked in</span> — all{' '}
            {props.totalPicks} picks are in.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="eyebrow">On the clock</span>
                  {myTurn && (
                    <Tag tone="show" live size="sm">
                      Your pick
                    </Tag>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-md font-semibold">
                  {myTurn ? 'You' : (onTheClock?.name ?? '—')}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="font-display text-2xl leading-none tracking-wide tabular-nums">
                  {props.currentPickNumber}
                  <span className="text-muted"> / {props.totalPicks}</span>
                </span>
                <span className="mt-1 block text-2xs text-muted">
                  Round {props.currentRound} of {props.totalRounds}
                </span>
              </span>
            </div>

            <p className="mt-3 flex items-center gap-1.5 border-t border-hairline pt-3 text-2xs text-muted">
              <LiveDot status={status} syncing={syncing} />
              {status === 'reconnecting'
                ? 'Reconnecting — this board may be behind'
                : myTurn
                  ? `Your pick. Choose a ${lower(props.lexicon.contestantSingular)} below.`
                  : `Waiting on ${onTheClock?.ownerName ?? onTheClock?.name ?? 'the next manager'}`}
            </p>
          </>
        )}
      </div>

      {drafting && myPicks.length > 0 && (
        <p className="mt-2 px-1 text-2xs text-muted">
          <span className="text-ink">Your roster:</span> {myPicks.map((p) => p.contestantName).join(', ')}
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
              <span className="ml-1.5 tabular-nums text-muted">{props.picks.length}</span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {tab === 'Board' && (
          <m.div
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
              placeholder={`Search ${lower(props.lexicon.contestantPlural)}`}
              className="field mb-3"
              aria-label={`Search ${lower(props.lexicon.contestantPlural)}`}
            />
            {filtered.length === 0 ? (
              <p className="list-empty">
                {props.available.length === 0
                  ? 'Everyone has been drafted.'
                  : `Nobody matches “${query.trim()}”.`}
              </p>
            ) : (
              <ul className="list">
                {filtered.map((contestant) => (
                  <li key={contestant.id} className="flex items-center gap-3 py-3">
                    <Avatar
                      name={contestant.name}
                      photoUrl={contestant.photoUrl}
                      size={40}
                      dimmed={!contestant.isActive}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            'min-w-0 truncate text-base font-semibold',
                            !contestant.isActive && 'text-muted',
                          )}
                        >
                          {contestant.name}
                        </span>
                        {contestant.traitor && contestant.isActive && (
                          <Tag tone="red" size="sm">
                            Traitor
                          </Tag>
                        )}
                        {!contestant.isActive && (
                          <Tag tone="red" size="sm">
                            {lower(props.lexicon.eliminationVerb)}
                          </Tag>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-2xs text-muted">
                        {contestant.occupation ?? props.lexicon.contestantSingular}
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
                          // A quiet button on every row, lit on hover: sixteen
                          // gold buttons in a column shout over the names.
                          className="btn-ghost btn-sm text-show-deep hover:border-show-accent disabled:opacity-50"
                        >
                          {picking === contestant.id ? 'Locking…' : 'Lock in'}
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </m.div>
        )}

        {tab === 'Picks' && (
          <m.div
            key="Picks"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={TAB_TRANSITION}
            className="mt-3"
          >
            {props.picks.length === 0 ? (
              <p className="list-empty">No picks yet.</p>
            ) : (
              <ul className="list">
                {/* Newest first: during a draft the question is always "what
                    just happened", never "what happened first". */}
                {[...props.picks].reverse().map((pick) => (
                  <li
                    key={pick.pickNumber}
                    className={cn(
                      'relative isolate flex items-center gap-3 py-3',
                      pick.teamId === props.myTeamId && 'row-mine',
                    )}
                  >
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
          </m.div>
        )}

        {tab === 'Teams' && (
          <m.ul
            key="Teams"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={TAB_TRANSITION}
            className="list mt-3"
          >
            {props.teams.map((team) => (
              <li key={team.id} className="flex items-center gap-3 py-3">
                <span className="w-5 text-xs tabular-nums text-muted">{team.position ?? '—'}</span>
                <Avatar name={team.ownerName ?? team.name} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{team.name}</span>
                  <span className="mt-0.5 block truncate text-2xs text-muted">{team.ownerName}</span>
                </span>
                {team.id === props.onTheClockTeamId && (
                  <span className="pill bg-brand-gold-soft text-2xs text-brand-gold-deep">on the clock</span>
                )}
              </li>
            ))}
          </m.ul>
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
function useAnnounceMyTurn(myTurn: boolean, pickNumber: number, contestantWord: string) {
  const announced = useRef<number | null>(null);

  useEffect(() => {
    if (!myTurn) return;
    if (announced.current === pickNumber) return;
    announced.current = pickNumber;
    toast.success("You're on the clock", { description: `Pick a ${contestantWord} to lock in.` });

    // A bonus on the platforms that have it, never the mechanism — iOS has no
    // vibrate at all. The activation check is not optional: calling this
    // before the page has been touched does not throw, it logs a console
    // error, which would mean a red line in the console on every draft page
    // that loads on your turn.
    if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(180);
  }, [myTurn, pickNumber, contestantWord]);
}

function LiveDot({ status, syncing }: { status: PulseStatus; syncing: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'h-1.5 w-1.5 shrink-0 rounded-full',
        status !== 'live' ? 'bg-muted' : syncing ? 'animate-pulse bg-brand-gold' : 'bg-brand-gold-deep',
      )}
    />
  );
}

function StartDraftPanel({ leagueId, isCommissioner }: { leagueId: string; isCommissioner: boolean }) {
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
