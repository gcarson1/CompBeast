'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createLeagueAction, joinLeagueAction, type ActionState } from '@/server/actions';

export function CreateLeagueForm({
  seasons,
  rulesets,
}: {
  seasons: Array<{ id: string; name: string; showName: string }>;
  rulesets: Array<{ id: string; name: string; description: string | null; isDefault: boolean }>;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(createLeagueAction, {});
  const defaultRuleset = rulesets.find((r) => r.isDefault) ?? rulesets[0];

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="name">
          League name
        </label>
        <input id="name" name="name" required minLength={3} className="field" placeholder="First Eviction Club" />
      </div>

      <div>
        <label className="label" htmlFor="teamName">
          Your team name
        </label>
        <input id="teamName" name="teamName" required minLength={2} className="field" placeholder="Block Party" />
      </div>

      <div>
        <label className="label" htmlFor="seasonId">
          Season
        </label>
        <select id="seasonId" name="seasonId" className="field" required>
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.showName} — {season.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="scoringRulesetId">
          Scoring
        </label>
        <select
          id="scoringRulesetId"
          name="scoringRulesetId"
          className="field"
          required
          defaultValue={defaultRuleset?.id}
        >
          {rulesets.map((ruleset) => (
            <option key={ruleset.id} value={ruleset.id}>
              {ruleset.name}
            </option>
          ))}
        </select>
        {defaultRuleset?.description && (
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{defaultRuleset.description}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="rosterSize">
            Roster size
          </label>
          <input
            id="rosterSize"
            name="rosterSize"
            type="number"
            min={1}
            max={12}
            defaultValue={4}
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="maxTeams">
            Max teams
          </label>
          <input
            id="maxTeams"
            name="maxTeams"
            type="number"
            min={2}
            max={24}
            defaultValue={8}
            className="field"
          />
        </div>
      </div>

      <label className="flex items-center gap-3 rounded-2xl bg-surface p-4">
        <input type="checkbox" name="isPublic" className="h-5 w-5 accent-[#8fd11a]" />
        <span>
          <span className="block text-[14px] font-medium">Public league</span>
          <span className="mt-0.5 block text-[12px] text-muted">Anyone with the code joins instantly.</span>
        </span>
      </label>

      {state.error && <p className="text-[13px] text-danger">{state.error}</p>}
      <SubmitButton label="Create league" />
    </form>
  );
}

export function JoinLeagueForm() {
  const [state, formAction] = useFormState<ActionState, FormData>(joinLeagueAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="inviteCode">
          Invite code
        </label>
        <input
          id="inviteCode"
          name="inviteCode"
          required
          className="field uppercase tracking-widest"
          placeholder="DEMO-BB27"
          autoCapitalize="characters"
        />
      </div>
      <div>
        <label className="label" htmlFor="teamName">
          Your team name
        </label>
        <input id="teamName" name="teamName" required minLength={2} className="field" placeholder="Veto Villains" />
      </div>
      {state.error && <p className="text-[13px] text-danger">{state.error}</p>}
      <SubmitButton label="Join league" />
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary w-full py-3 text-[15px] disabled:opacity-50"
    >
      {pending ? 'Working…' : label}
    </button>
  );
}
