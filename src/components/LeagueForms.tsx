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
        <input
          id="name"
          className="field"
          placeholder="First Eviction Club"
          required
          minLength={3}
          maxLength={60}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'name-error' : undefined}
          {...register('name')}
        />
        <FieldError id="name-error" message={errors.name?.message} />
      </div>

      <div>
        <label className="label" htmlFor="teamName">
          Your team name
        </label>
        <input
          id="teamName"
          className="field"
          placeholder="Block Party"
          required
          minLength={2}
          maxLength={40}
          aria-invalid={errors.teamName ? true : undefined}
          aria-describedby={errors.teamName ? 'teamName-error' : undefined}
          {...register('teamName')}
        />
        <FieldError id="teamName-error" message={errors.teamName?.message} />
      </div>

      <div>
        <label className="label" htmlFor="seasonId">
          Season
        </label>
        <select id="seasonId" className="field" required {...register('seasonId')}>
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.showName} — {season.name}
            </option>
          ))}
        </select>
        <FieldError id="seasonId-error" message={errors.seasonId?.message} />
      </div>

      <div>
        <label className="label" htmlFor="scoringRulesetId">
          Scoring
        </label>
        <select id="scoringRulesetId" className="field" required {...register('scoringRulesetId')}>
          {rulesets.map((ruleset) => (
            <option key={ruleset.id} value={ruleset.id}>
              {ruleset.name}
            </option>
          ))}
        </select>
        <FieldError id="scoringRulesetId-error" message={errors.scoringRulesetId?.message} />
        {defaultRuleset?.description && (
          <p className="mt-1.5 text-2xs leading-relaxed text-muted">{defaultRuleset.description}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="rosterSize">
            Roster size
          </label>
          <input
            id="rosterSize"
            type="number"
            inputMode="numeric"
            min={1}
            max={12}
            required
            className="field"
            aria-invalid={errors.rosterSize ? true : undefined}
            aria-describedby={errors.rosterSize ? 'rosterSize-error' : undefined}
            {...register('rosterSize')}
          />
          <FieldError id="rosterSize-error" message={errors.rosterSize?.message} />
        </div>
        <div>
          <label className="label" htmlFor="maxTeams">
            Max teams
          </label>
          <input
            id="maxTeams"
            type="number"
            inputMode="numeric"
            min={2}
            max={24}
            required
            className="field"
            aria-invalid={errors.maxTeams ? true : undefined}
            aria-describedby={errors.maxTeams ? 'maxTeams-error' : undefined}
            {...register('maxTeams')}
          />
          <FieldError id="maxTeams-error" message={errors.maxTeams?.message} />
        </div>
      </div>

      <label className="flex items-center gap-3 rounded-2xl bg-surface p-4">
        <input type="checkbox" className="h-5 w-5 accent-brand-gold" {...register('isPublic')} />
        <span>
          <span className="block text-sm font-medium">Public league</span>
          <span className="mt-0.5 block text-2xs text-muted">Anyone with the code joins instantly.</span>
        </span>
      </label>

      {state.error && <p className="text-xs text-danger-deep">{state.error}</p>}
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

export function JoinLeagueForm({ defaultCode = '' }: { defaultCode?: string }) {
  const [state, formAction] = useFormState<ActionState, FormData>(joinLeagueAction, {});
  const {
    register,
    formState: { errors },
  } = useForm<JoinLeagueFields>({
    resolver: zodResolver(joinLeagueSchema),
    mode: 'onChange',
    defaultValues: { inviteCode: defaultCode },
  });

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
          // Also set on the DOM node, not just in RHF's defaultValues, so a
          // scanned QR code arrives filled in in the server-rendered HTML —
          // before hydration, and with JavaScript off.
          defaultValue={defaultCode}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          required
          aria-invalid={errors.inviteCode ? true : undefined}
          aria-describedby={errors.inviteCode ? 'inviteCode-error' : undefined}
          {...register('inviteCode')}
        />
        <FieldError id="inviteCode-error" message={errors.inviteCode?.message} />
      </div>
      <div>
        <label className="label" htmlFor="teamName">
          Your team name
        </label>
        <input
          id="teamName"
          className="field"
          placeholder="Veto Villains"
          required
          minLength={2}
          maxLength={40}
          aria-invalid={errors.teamName ? true : undefined}
          aria-describedby={errors.teamName ? 'teamName-error' : undefined}
          {...register('teamName')}
        />
        <FieldError id="teamName-error" message={errors.teamName?.message} />
      </div>
      {state.error && <p className="text-xs text-danger-deep">{state.error}</p>}
      <SubmitButton label="Enter the House" />
    </form>
  );
}

/**
 * One error slot, wired to its input by id.
 *
 * `role="alert"` matters as much as the text: react-hook-form validates as you
 * type, but these messages sit visually below the field, so without it a
 * screen-reader user gets no signal that anything appeared at all.
 *
 * The inline messages are the nicety; the `required`/`min`/`max` attributes on
 * the inputs are what actually blocks a bad submit. This form posts through a
 * server action, so react-hook-form never owns the submit event and its
 * `errors` alone would let an invalid form through — the browser's own
 * constraint validation is what holds, and it holds with JavaScript disabled.
 */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-2xs text-danger-deep">
      {message}
    </p>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary w-full py-3 text-base disabled:opacity-50"
    >
      {pending ? 'Working…' : label}
    </button>
  );
}
