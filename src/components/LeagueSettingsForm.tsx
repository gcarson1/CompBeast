'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import {
  DEFAULT_LOCK_OFFSET_MINUTES,
  LOCK_OFFSET_CHOICES,
} from '@/lib/cycles';
import { deleteLeagueAction, updateLeagueAction, type ActionState } from '@/server/actions';

export interface LeagueSettingsValues {
  leagueId: string;
  name: string;
  scoringRulesetId: string;
  rosterSize: number;
  maxTeams: number;
  isPublic: boolean;
  /** Null means "use the season's own deadline". */
  lockOffsetMinutes: number | null;
  /** Drives which fields are frozen; the server enforces the same rule. */
  draftStarted: boolean;
  teamCount: number;
}

export function LeagueSettingsForm({
  values,
  rulesets,
}: {
  values: LeagueSettingsValues;
  rulesets: Array<{ id: string; name: string; description: string | null }>;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(updateLeagueAction, {});

  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.ok) toast.success('League settings saved');
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="leagueId" value={values.leagueId} />

      <div>
        <label className="label" htmlFor="name">
          League name
        </label>
        <input
          id="name"
          name="name"
          className="field"
          defaultValue={values.name}
          required
          minLength={3}
          maxLength={60}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="maxTeams">
            Max teams
          </label>
          <input
            id="maxTeams"
            name="maxTeams"
            type="number"
            inputMode="numeric"
            className="field"
            defaultValue={values.maxTeams}
            // The floor is the teams already seated, not the schema's 2 —
            // surfacing it here means the browser catches it before a round
            // trip, while `updateLeague` still enforces it server-side.
            min={Math.max(2, values.teamCount)}
            max={24}
            required
            aria-describedby="maxTeams-help"
          />
          <p id="maxTeams-help" className="mt-1.5 text-2xs text-muted">
            {values.teamCount} {values.teamCount === 1 ? 'team is' : 'teams are'} already in.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="rosterSize">
            Roster size
          </label>
          <input
            id="rosterSize"
            name="rosterSize"
            type="number"
            inputMode="numeric"
            className="field"
            defaultValue={values.rosterSize}
            min={1}
            max={12}
            required
            disabled={values.draftStarted}
            aria-describedby="rosterSize-help"
          />
          <p id="rosterSize-help" className="mt-1.5 text-2xs text-muted">
            {values.draftStarted
              ? 'Locked — it sets how many picks the draft has.'
              : 'Houseguests each manager drafts.'}
          </p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="scoringRulesetId">
          Scoring
        </label>
        <select
          id="scoringRulesetId"
          name="scoringRulesetId"
          className="field"
          defaultValue={values.scoringRulesetId}
          required
          disabled={values.draftStarted}
          aria-describedby="scoring-help"
        >
          {rulesets.map((ruleset) => (
            <option key={ruleset.id} value={ruleset.id}>
              {ruleset.name}
            </option>
          ))}
        </select>
        <p id="scoring-help" className="mt-1.5 text-2xs leading-relaxed text-muted">
          {values.draftStarted
            ? 'Locked — everyone drafted against these rules.'
            : 'Changeable until the draft starts.'}
        </p>
      </div>

      <div>
        <label className="label" htmlFor="lockOffsetMinutes">
          Roster lock
        </label>
        <select
          id="lockOffsetMinutes"
          name="lockOffsetMinutes"
          className="field"
          // '' is the season-default option and must stay '' all the way to
          // the schema — see the preprocess note in src/lib/validation.ts.
          defaultValue={values.lockOffsetMinutes === null ? '' : String(values.lockOffsetMinutes)}
          aria-describedby="lock-help"
        >
          <option value="">
            Season default ({DEFAULT_LOCK_OFFSET_MINUTES} minutes before airtime)
          </option>
          {LOCK_OFFSET_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
        <p id="lock-help" className="mt-1.5 text-2xs leading-relaxed text-muted">
          When this league&apos;s rosters close each week, counted back from when the episode
          airs. Weeks with no known airtime fall back to the season schedule.
        </p>
      </div>

      {/*
        A disabled input submits nothing, which would make the server read a
        missing field as an attempted change. These carry the current value
        through so a locked field round-trips unchanged.
      */}
      {values.draftStarted && (
        <>
          <input type="hidden" name="rosterSize" value={values.rosterSize} />
          <input type="hidden" name="scoringRulesetId" value={values.scoringRulesetId} />
        </>
      )}

      <label className="flex items-center gap-3 rounded-btn bg-surface p-4">
        <input
          type="checkbox"
          name="isPublic"
          className="h-5 w-5 accent-brand-gold"
          defaultChecked={values.isPublic}
        />
        <span>
          <span className="block text-sm font-medium">Public league</span>
          <span className="mt-0.5 block text-2xs text-muted">
            Anyone with the code joins instantly.
          </span>
        </span>
      </label>

      {state.error && <p className="text-xs text-danger-deep">{state.error}</p>}
      <SaveButton />
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="btn-primary w-full py-3 text-base disabled:opacity-50"
    >
      {pending ? 'Saving…' : 'Save settings'}
    </button>
  );
}

/**
 * Deleting a league.
 *
 * Two gates, neither of them a dialog: the destructive control is hidden
 * behind a disclosure so it cannot be hit while scrolling, and the button
 * stays disabled until the league's name is typed back exactly. A confirm()
 * is dismissed by reflex; retyping a name cannot be done by accident. The
 * server checks the same name again, because a disabled button is a
 * convenience, not a permission.
 */
export function DeleteLeaguePanel({
  leagueId,
  leagueName,
  memberCount,
}: {
  leagueId: string;
  leagueName: string;
  memberCount: number;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(deleteLeagueAction, {});
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  const matches = typed.trim() === leagueName;

  return (
    <section className="mt-10 rounded-card border border-danger/30 p-4">
      <h2 className="text-base font-semibold text-danger-deep">Delete this league</h2>
      <p className="mt-1 max-w-measure text-2xs leading-relaxed text-muted">
        Standings, rosters, draft results and the whole feed go with it, for all{' '}
        {memberCount} {memberCount === 1 ? 'manager' : 'managers'}. Everyone keeps the points they
        scored here on their own account. This cannot be undone.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-ghost btn-sm mt-3 border-danger/40 text-danger-deep"
        >
          Delete league…
        </button>
      ) : (
        <form action={formAction} className="mt-4">
          <input type="hidden" name="leagueId" value={leagueId} />
          <label className="label" htmlFor="confirmName">
            Type <span className="font-semibold text-ink">{leagueName}</span> to confirm
          </label>
          <input
            id="confirmName"
            name="confirmName"
            className="field"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="confirm-help"
          />
          <p id="confirm-help" className="mt-1.5 text-2xs text-muted">
            {matches ? 'Names match.' : 'Must match exactly, including capitals.'}
          </p>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped('');
              }}
              className="btn-ghost flex-1"
            >
              Cancel
            </button>
            <DeleteButton disabled={!matches} />
          </div>
        </form>
      )}
    </section>
  );
}

function DeleteButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className="btn flex-1 bg-danger-strong text-white hover:brightness-110 disabled:opacity-40"
    >
      {pending ? 'Deleting…' : 'Delete forever'}
    </button>
  );
}
