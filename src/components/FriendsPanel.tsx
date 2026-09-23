'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { Avatar } from '@/components/Avatar';
import { Tag } from '@/components/Tag';
import {
  removeFriendAction,
  respondToFriendRequestAction,
  sendFriendRequestAction,
  type ActionState,
} from '@/server/actions';
import type { FriendOverview, FriendSearchResult } from '@/server/social';

export function FriendsPanel({ overview }: { overview: FriendOverview }) {
  const { friends, incoming, outgoing } = overview;

  return (
    <div className="space-y-6">
      <FriendSearch />

      {incoming.length > 0 && (
        <section>
          <h3 className="eyebrow mb-2">Waiting on you ({incoming.length})</h3>
          <ul className="divide-y divide-hairline border-y border-hairline">
            {incoming.map((request) => (
              <li key={request.friendshipId} className="flex items-center gap-3 py-3">
                <Avatar name={request.name} photoUrl={request.avatarUrl} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{request.name}</span>
                  {request.handle && (
                    <span className="block truncate text-2xs text-muted">@{request.handle}</span>
                  )}
                </span>
                <RespondForm friendshipId={request.friendshipId} name={request.name} accept />
                <RespondForm friendshipId={request.friendshipId} name={request.name} accept={false} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="eyebrow mb-2">Friends ({friends.length})</h3>
        {friends.length === 0 ? (
          <p className="list-empty text-2xs">
            No friends yet. Search above by name, handle, or their full email address — then you can invite
            them straight into a league.
          </p>
        ) : (
          <ul className="divide-y divide-hairline border-y border-hairline">
            {friends.map((friend) => (
              <li key={friend.userId} className="flex items-center gap-3 py-3">
                <Avatar name={friend.name} photoUrl={friend.avatarUrl} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{friend.name}</span>
                  {friend.handle && (
                    <span className="block truncate text-2xs text-muted">@{friend.handle}</span>
                  )}
                </span>
                <RemoveFriendForm friendUserId={friend.userId} name={friend.name} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {outgoing.length > 0 && (
        <section>
          <h3 className="eyebrow mb-2">Waiting on them ({outgoing.length})</h3>
          <ul className="divide-y divide-hairline border-y border-hairline">
            {outgoing.map((request) => (
              <li key={request.friendshipId} className="flex items-center gap-3 py-3">
                <Avatar name={request.name} photoUrl={request.avatarUrl} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{request.name}</span>
                  <span className="block text-2xs text-muted">Request sent</span>
                </span>
                {/* Withdrawing is the same delete as unfriending — the row is
                    gone either way, and a separate "cancel" mutation would be
                    the same query with a different name. */}
                <RemoveFriendForm friendUserId={request.userId} name={request.name} withdraw />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * Search box.
 *
 * Hits a route rather than a server action because it runs on every keystroke
 * (debounced) and needs a *result set* back, which is not what an action's
 * `{ok, error}` state is for. Requests are sequenced so a slow early response
 * cannot overwrite a fast later one.
 */
function FriendSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/friends/search?q=${encodeURIComponent(trimmed)}`, {
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('search failed');
        const data: { results?: FriendSearchResult[] } = await response.json();
        if (!cancelled) setResults(data.results ?? []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const trimmed = query.trim();

  return (
    <section>
      <label className="label" htmlFor="friend-search">
        Find people
      </label>
      <input
        id="friend-search"
        type="search"
        className="field"
        placeholder="Name, handle, or full email"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoComplete="off"
        aria-describedby="friend-search-status"
      />
      <p id="friend-search-status" className="mt-1.5 text-2xs text-muted" aria-live="polite">
        {trimmed.length === 0
          ? 'Email has to be exact — names and handles do not.'
          : trimmed.length < 2
            ? 'Keep typing…'
            : searching
              ? 'Searching…'
              : `${results.length} ${results.length === 1 ? 'match' : 'matches'}`}
      </p>

      {results.length > 0 && (
        <ul className="mt-3 divide-y divide-hairline border-y border-hairline">
          {results.map((result) => (
            <li key={result.userId} className="flex items-center gap-3 py-3">
              <Avatar name={result.name} photoUrl={result.avatarUrl} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{result.name}</span>
                {result.handle && (
                  <span className="block truncate text-2xs text-muted">@{result.handle}</span>
                )}
              </span>
              <SearchRowAction result={result} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SearchRowAction({ result }: { result: FriendSearchResult }) {
  const [state, formAction] = useFormState<ActionState, FormData>(sendFriendRequestAction, {});
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.ok) {
      setSent(true);
      toast.success(`Request sent to ${result.name}`);
    }
  }, [state, result.name]);

  if (result.relation === 'FRIENDS') {
    return (
      <Tag tone="mint" size="sm">
        Friends
      </Tag>
    );
  }
  if (result.relation === 'REQUEST_SENT' || sent) {
    return (
      <Tag tone="outline" size="sm">
        Requested
      </Tag>
    );
  }
  if (result.relation === 'REQUEST_RECEIVED') {
    return (
      <Tag tone="lavender" size="sm">
        Asked you
      </Tag>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="targetUserId" value={result.userId} />
      <PendingButton label="Add" pendingLabel="Adding…" ariaLabel={`Add ${result.name}`} />
    </form>
  );
}

function RespondForm({
  friendshipId,
  name,
  accept,
}: {
  friendshipId: string;
  name: string;
  accept: boolean;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(respondToFriendRequestAction, {});

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  return (
    <form action={formAction}>
      <input type="hidden" name="friendshipId" value={friendshipId} />
      <input type="hidden" name="accept" value={String(accept)} />
      <PendingButton
        label={accept ? 'Accept' : 'Ignore'}
        pendingLabel="…"
        ariaLabel={`${accept ? 'Accept' : 'Ignore'} friend request from ${name}`}
        variant={accept ? 'primary' : 'ghost'}
      />
    </form>
  );
}

/**
 * Remove a friend, or withdraw a request you sent.
 *
 * Removing asks twice — the button turns into "Sure?" and only the second tap
 * submits — rather than opening a `window.confirm`. A browser dialog is
 * dismissed by reflex, it cannot be styled, and on a phone it yanks focus out
 * of the page entirely. The two-tap is the same pattern the delete-league
 * panel uses, and it reverts on blur so an abandoned "Sure?" does not sit
 * there armed.
 *
 * Withdrawing skips the confirm. Cancelling a request you sent is not lossy.
 */
function RemoveFriendForm({
  friendUserId,
  name,
  withdraw = false,
}: {
  friendUserId: string;
  name: string;
  withdraw?: boolean;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(removeFriendAction, {});
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  // Never leave the destructive state armed after attention moves elsewhere.
  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(id);
  }, [confirming]);

  const needsConfirm = !withdraw && !confirming;

  return (
    <form action={formAction} onBlur={() => setConfirming(false)}>
      <input type="hidden" name="friendUserId" value={friendUserId} />
      {needsConfirm ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Remove ${name} from friends`}
          className="btn-ghost btn-sm shrink-0"
        >
          Remove
        </button>
      ) : (
        <PendingButton
          label={withdraw ? 'Withdraw' : 'Sure?'}
          pendingLabel="…"
          ariaLabel={withdraw ? `Withdraw request to ${name}` : `Confirm removing ${name} from friends`}
        />
      )}
    </form>
  );
}

function PendingButton({
  label,
  pendingLabel,
  ariaLabel,
  variant = 'ghost',
}: {
  label: string;
  pendingLabel: string;
  ariaLabel: string;
  variant?: 'primary' | 'ghost';
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      // Visible labels repeat down the list, so the accessible name carries
      // the person's name instead.
      aria-label={ariaLabel}
      className={`${variant === 'primary' ? 'btn-primary' : 'btn-ghost'} btn-sm shrink-0`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
