'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useClerk } from '@clerk/nextjs';
import { toast } from 'sonner';
import { HOME_PATH } from '@/lib/seo';
import { deleteAccountAction, type DeleteAccountState } from '@/server/account-actions';

const CONFIRM_WORD = 'DELETE';

/**
 * The way out. Same shape as deleting a league: the consequences in plain
 * words, a button that only opens the form, and a typed word as the guard —
 * a confirm dialog is dismissed by reflex, this cannot be.
 *
 * On success the browser signs out through Clerk's own client, because the
 * server has already deleted the sign-in and the session cookie is now for
 * an account that does not exist.
 */
export function DeleteAccountPanel({ leaguesCommissioned }: { leaguesCommissioned: number }) {
  const [state, formAction] = useFormState<DeleteAccountState, FormData>(deleteAccountAction, {});
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const { signOut } = useClerk();

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  useEffect(() => {
    if (state.done) void signOut({ redirectUrl: HOME_PATH });
  }, [state.done, signOut]);

  const matches = typed.trim() === CONFIRM_WORD;

  return (
    <section className="mt-10 border-t-2 border-danger/50 pt-4" aria-labelledby="delete-account">
      <h2 id="delete-account" className="headline text-xl text-danger-deep">
        Delete your account
      </h2>
      <div className="mt-1 max-w-measure space-y-2 text-2xs leading-relaxed text-muted">
        <p>
          Your sign-in, email, name, avatar, friendships, notifications, career records and every message you
          posted are erased immediately. Teams in leagues already drafted stay on the board with no name, so
          the other managers&apos; standings hold; seats in leagues not yet drafted are freed.
        </p>
        {leaguesCommissioned > 0 && (
          <p>
            {leaguesCommissioned === 1
              ? 'The league you commission passes'
              : `The ${leaguesCommissioned} leagues you commission pass`}{' '}
            to the longest-standing other member; a league with no other members is deleted.
          </p>
        )}
        <p>
          This cannot be undone.{' '}
          <Link href="/privacy#deletion" className="text-brand-gold-deep underline underline-offset-2">
            What deletion removes, in full.
          </Link>
        </p>
      </div>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-ghost btn-sm mt-3 border-danger/40 text-danger-deep"
        >
          Delete account…
        </button>
      ) : (
        <form action={formAction} className="mt-4">
          <label className="label" htmlFor="confirm-delete">
            Type <span className="font-semibold text-ink">{CONFIRM_WORD}</span> to confirm
          </label>
          <input
            id="confirm-delete"
            name="confirm"
            className="field"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-describedby="confirm-delete-help"
          />
          <p id="confirm-delete-help" className="mt-1.5 text-2xs text-muted">
            {matches ? 'Ready.' : 'In capitals, exactly as shown.'}
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
              Keep my account
            </button>
            <DeleteButton disabled={!matches || Boolean(state.done)} />
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
