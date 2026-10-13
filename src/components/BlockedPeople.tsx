'use client';

import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { Avatar } from '@/components/Avatar';
import { unblockUserAction, type ActionState } from '@/server/actions';
import type { BlockedPerson } from '@/server/moderation';

/** The people you have blocked, each with the way back. */
export function BlockedPeople({ people }: { people: BlockedPerson[] }) {
  if (people.length === 0) {
    return (
      <p className="list-empty text-2xs">
        Nobody. Block someone from the “⋯” beside their post, their team page or their friend request, and
        neither of you will see the other.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-hairline border-y border-hairline">
      {people.map((person) => (
        <li key={person.userId} className="flex items-center gap-3 py-3">
          <Avatar name={person.name} photoUrl={person.avatarUrl} size={34} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{person.name}</span>
            {person.handle && <span className="block truncate text-2xs text-muted">@{person.handle}</span>}
          </span>
          <UnblockForm userId={person.userId} name={person.name} />
        </li>
      ))}
    </ul>
  );
}

function UnblockForm({ userId, name }: { userId: string; name: string }) {
  const [state, formAction] = useFormState<ActionState, FormData>(unblockUserAction, {});
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.ok) toast.success(`${name} is unblocked`);
  }, [state, name]);
  return (
    <form action={formAction}>
      <input type="hidden" name="subjectUserId" value={userId} />
      <UnblockButton name={name} />
    </form>
  );
}

function UnblockButton({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      aria-label={`Unblock ${name}`}
      className="btn-ghost btn-sm shrink-0"
    >
      {pending ? '…' : 'Unblock'}
    </button>
  );
}
