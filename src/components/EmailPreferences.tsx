'use client';

import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { CATEGORIES, type EmailCategory } from '@/lib/email/templates';
import { cn } from '@/lib/ui';
import { setEmailPreferenceAction, type ActionState } from '@/server/actions';
import type { EmailPreferences as Preferences } from '@/server/notification-email';

/**
 * Which alerts also reach your inbox.
 *
 * Grouped rather than one switch per notification type. There are nine types
 * and nobody wants a nine-row control panel to say "stop emailing me about
 * drafts" — but the *stored* shape stays per-type (see setEmailPreference), so
 * a type added to a category later inherits the answer somebody already gave
 * about that category.
 *
 * Every switch is its own form. That is what makes each one save on the spot
 * with no save button to miss, and it keeps working if the JavaScript never
 * arrives.
 */
export function EmailPreferences({ preferences }: { preferences: Preferences }) {
  const keys = Object.keys(CATEGORIES) as EmailCategory[];

  return (
    <div className="card divide-y divide-hairline">
      <Row
        scope="all"
        enabled={preferences.enabled}
        label="Email notifications"
        description="The master switch. In-app alerts keep working either way."
        emphasis
      />

      {keys.map((key) => (
        <Row
          key={key}
          scope={key}
          // A category cannot be meaningfully on while everything is off, and
          // showing it as on would be a lie about what will arrive.
          enabled={preferences.enabled && preferences.categories[key]}
          disabled={!preferences.enabled}
          label={CATEGORIES[key].label}
          description={CATEGORIES[key].description}
        />
      ))}

      {!preferences.configured && (
        <p className="p-4 text-2xs leading-relaxed text-muted">
          No mail provider is connected to this deployment yet, so nothing is being sent. These choices are
          saved and will apply the moment one is.
        </p>
      )}
    </div>
  );
}

function Row({
  scope,
  enabled,
  disabled = false,
  label,
  description,
  emphasis = false,
}: {
  scope: 'all' | EmailCategory;
  enabled: boolean;
  disabled?: boolean;
  label: string;
  description: string;
  emphasis?: boolean;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(setEmailPreferenceAction, {});

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  return (
    <form action={formAction} className="flex items-start gap-4 p-4">
      <input type="hidden" name="scope" value={scope} />
      {/* The form posts the state being asked for, not the current one. */}
      <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />

      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm', emphasis ? 'font-semibold' : 'font-medium')}>{label}</span>
        <span className="mt-0.5 block max-w-measure text-2xs leading-relaxed text-muted">{description}</span>
      </span>

      <Switch enabled={enabled} disabled={disabled} label={label} />
    </form>
  );
}

function Switch({ enabled, disabled, label }: { enabled: boolean; disabled: boolean; label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      // role="switch" plus aria-checked is what makes a screen reader announce
      // "on"/"off" rather than just reading it as a button.
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={disabled || pending}
      className={cn(
        'relative mt-0.5 h-6 w-11 shrink-0 rounded-pill transition-colors duration-200',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-gold',
        // The off track has to be visible against the card or the control has
        // only one state you can see. `surface-raised` measured 1.2:1 here —
        // effectively invisible; slate-500 is 3.1:1, which is the floor for
        // something whose whole job is to show you a state.
        enabled ? 'bg-brand-gold' : 'bg-slate-500',
        (disabled || pending) && 'opacity-50',
      )}
    >
      <span
        aria-hidden
        className={cn(
          // `left-0` is load-bearing: without it the knob starts from its
          // static position — centred, because buttons centre their content —
          // so both translations landed it at the right-hand end and an off
          // switch was indistinguishable from an on one.
          'switch-knob absolute left-0 top-1 h-4 w-4 rounded-pill shadow-[0_1px_2px_rgba(0,0,0,0.35)]',
          // Gold is a light fill; white on it is 2:1. Same rule as every other
          // gold surface in the app (see the `on-gold` token).
          enabled ? 'translate-x-6 bg-on-gold' : 'translate-x-1 bg-ink',
        )}
      />
    </button>
  );
}
