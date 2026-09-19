'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { Avatar } from '@/components/Avatar';
import { inviteFriendAction, type ActionState } from '@/server/actions';
import type { InvitableFriend } from '@/server/social';

/**
 * One-tap league invites for people you already know.
 *
 * This is what the friend graph is *for*. Without it, inviting someone means
 * copying a code out of the app and into a message and hoping they paste it
 * back correctly; with it, they get an alert that deep-links to a prefilled
 * join form.
 *
 * Friends already in the league stay in the list, greyed out. Filtering them
 * away makes people hunt for someone who is standing right there.
 */
export function InviteFriends({
  leagueId,
  friends,
  seatsLeft,
}: {
  leagueId: string;
  friends: InvitableFriend[];
  seatsLeft: number;
}) {
  if (friends.length === 0) {
    return (
      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">Invite friends</h2>
        <div className="rounded-card border border-dashed border-hairline p-4">
          <p className="max-w-measure text-xs leading-relaxed text-muted">
            Add friends and you can drop them into a league in one tap, instead of copying the
            invite code into a message.
          </p>
          <Link href="/account" prefetch={false} className="btn-ghost btn-sm mt-3">
            Find friends
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">Invite friends</h2>
        <span className="text-2xs text-muted">
          {seatsLeft === 0 ? 'League full' : `${seatsLeft} ${seatsLeft === 1 ? 'seat' : 'seats'} left`}
        </span>
      </div>
      <ul className="card divide-y divide-hairline">
        {friends.map((friend) => (
          <li key={friend.userId} className="flex items-center gap-3 p-3">
            <Avatar name={friend.name} photoUrl={friend.avatarUrl} size={34} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{friend.name}</span>
              {friend.handle && (
                <span className="block truncate text-2xs text-muted">@{friend.handle}</span>
              )}
            </span>
            {friend.alreadyIn ? (
              <span className="pill shrink-0 bg-canvas text-2xs text-muted">Already in</span>
            ) : (
              <InviteForm leagueId={leagueId} friend={friend} disabled={seatsLeft === 0} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function InviteForm({
  leagueId,
  friend,
  disabled,
}: {
  leagueId: string;
  friend: InvitableFriend;
  disabled: boolean;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(inviteFriendAction, {});
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.ok) {
      setSent(true);
      toast.success(`Invite sent to ${friend.name}`);
    }
  }, [state, friend.name]);

  if (sent) {
    return (
      <span className="pill shrink-0 bg-brand-gold-soft text-2xs text-brand-gold-deep">Invited</span>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="friendUserId" value={friend.userId} />
      <InviteButton name={friend.name} disabled={disabled} />
    </form>
  );
}

function InviteButton({ name, disabled }: { name: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      // The visible label is just "Invite"; the accessible name says who,
      // because a screen reader reading twelve identical buttons is useless.
      aria-label={`Invite ${name}`}
      className="btn-ghost btn-sm shrink-0"
    >
      {pending ? 'Sending…' : 'Invite'}
    </button>
  );
}
