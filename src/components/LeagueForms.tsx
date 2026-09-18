'use client';

import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { createLeagueAction, joinLeagueAction, type ActionState } from '@/server/actions';
import { createLeagueSchema } from '@/lib/validation';

// z.input, not z.infer/z.output — the .default() on isPublic makes the parsed
// *output* required, but RHF needs the pre-parse *input* shape (optional).
type CreateLeagueFields = z.input<typeof createLeagueSchema>;

export function CreateLeagueForm({
  seasons,
  rulesets,
}: {
  seasons: Array<{ id: string; name: string; showName: string }>;
  rulesets: Array<{ id: string; name: string; description: string | null; isDefault: boolean }>;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(createLeagueAction, {});
  const defaultRuleset = rulesets.find((r) => r.isDefault) ?? rulesets[0];

  // Reuses the server's own Zod schema (src/server/mutations.ts) so client-side
  // validation can never drift out of sync with what the server will accept.
  const {
    register,
    formState: { errors },
  } = useForm<CreateLeagueFields>({
    resolver: zodResolver(createLeagueSchema),
    mode: 'onChange',
    defaultValues: {
      rosterSize: 4,
      maxTeams: 8,
      isPublic: false,
      scoringRulesetId: defaultRuleset?.id ?? '',
    },
  });

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="name">
          League name
        </label>
        <input id="name" className="field" placeholder="First Eviction Club" {...register('name')} />
        {errors.name && <p className="mt-1.5 text-[12px] text-danger">{errors.name.message}</p>}
      </div>

      <div>
        <label className="label" htmlFor="teamName">
          Your team name
        </label>
        <input id="teamName" className="field" placeholder="Block Party" {...register('teamName')} />
        {errors.teamName && <p className="mt-1.5 text-[12px] text-danger">{errors.teamName.message}</p>}
      </div>

      <div>
        <label className="label" htmlFor="seasonId">
          Season
        </label>
        <select id="seasonId" className="field" {...register('seasonId')}>
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
        <select id="scoringRulesetId" className="field" {...register('scoringRulesetId')}>
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
          <input id="rosterSize" type="number" min={1} max={12} className="field" {...register('rosterSize')} />
          {errors.rosterSize && (
            <p className="mt-1.5 text-[12px] text-danger">{errors.rosterSize.message}</p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="maxTeams">
            Max teams
          </label>
          <input id="maxTeams" type="number" min={2} max={24} className="field" {...register('maxTeams')} />
          {errors.maxTeams && <p className="mt-1.5 text-[12px] text-danger">{errors.maxTeams.message}</p>}
        </div>
      </div>

      <label className="flex items-center gap-3 rounded-2xl bg-surface p-4">
        <input type="checkbox" className="h-5 w-5 accent-brand-gold" {...register('isPublic')} />
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

// No shared server schema exists for join (the action validates inline), so
// this mirrors those same constraints locally for instant inline feedback.
const joinLeagueSchema = z.object({
  inviteCode: z.string().trim().min(1, 'Enter an invite code'),
  teamName: z.string().trim().min(2, 'Give your team a name').max(40),
});
type JoinLeagueFields = z.infer<typeof joinLeagueSchema>;

export function JoinLeagueForm() {
  const [state, formAction] = useFormState<ActionState, FormData>(joinLeagueAction, {});
  const {
    register,
    formState: { errors },
  } = useForm<JoinLeagueFields>({ resolver: zodResolver(joinLeagueSchema), mode: 'onChange' });

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="inviteCode">
          Invite code
        </label>
        <input
          id="inviteCode"
          className="field uppercase tracking-widest"
          placeholder="DEMO-BB27"
          autoCapitalize="characters"
          {...register('inviteCode')}
        />
        {errors.inviteCode && <p className="mt-1.5 text-[12px] text-danger">{errors.inviteCode.message}</p>}
      </div>
      <div>
        <label className="label" htmlFor="teamName">
          Your team name
        </label>
        <input id="teamName" className="field" placeholder="Veto Villains" {...register('teamName')} />
        {errors.teamName && <p className="mt-1.5 text-[12px] text-danger">{errors.teamName.message}</p>}
      </div>
      {state.error && <p className="text-[13px] text-danger">{state.error}</p>}
      <SubmitButton label="Enter the House" />
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
