'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { Avatar } from '@/components/Avatar';
import { useLeaguePulse } from '@/lib/live';
import { relativeTime } from '@/lib/ui';
import {
  deleteMessageAction,
  postMessageAction,
  toggleReactionAction,
  type ActionState,
} from '@/server/actions';
import type { LeagueMessageView } from '@/server/queries';

const MAX_LENGTH = 500;
/** Chat cadence: fast enough to feel like a conversation, slow enough to be free. */
const FEED_POLL_MS = 6_000;

/**
 * The league's trash-talk feed.
 *
 * Posting goes through a server action; everyone else's posts arrive because
 * the feed watches the league pulse and re-renders itself when the message or
 * reaction count moves (see src/lib/live.ts). So it is live without holding a
 * socket open per reader — which matters on a phone, where the socket would be
 * dropped every time the screen locks.
 *
 * The composer clears before the round trip finishes, because leaving the text
 * sitting there reads as a failed post.
 */
export function LeagueFeed({
  leagueId,
  messages,
  canPost,
  isCommissioner,
}: {
  leagueId: string;
  messages: LeagueMessageView[];
  canPost: boolean;
  isCommissioner: boolean;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(postMessageAction, {});
  const [body, setBody] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const reduceMotion = useReducedMotion();

  const { status } = useLeaguePulse({
    leagueId,
    watch: {
      messages: messages.length,
      // Reactions count too: someone hyping your post is the cheapest and most
      // common thing that happens in here, and a feed where it only shows up
      // after a reload is not a live feed.
      reactions: messages.reduce((total, message) => total + message.hype + message.shade, 0),
    },
    intervalMs: FEED_POLL_MS,
  });

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  const remaining = MAX_LENGTH - body.length;
  const over = remaining < 0;

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Trash talk</h2>
        <span className="flex items-center gap-1.5 text-2xs text-muted">
          {/* No dot for a viewer who cannot poll — a signed-out reader of a
              public league. Claiming "live" there would be untrue, and
              claiming "reconnecting" would promise something not coming. */}
          {status !== 'off' && (
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${status === 'live' ? 'bg-brand-gold-deep' : 'bg-muted'}`}
            />
          )}
          {status === 'reconnecting'
            ? 'Reconnecting'
            : messages.length === 0
              ? 'No posts yet'
              : `${messages.length} ${messages.length === 1 ? 'post' : 'posts'}`}
        </span>
      </div>

      {canPost ? (
        <form
          ref={formRef}
          action={(formData) => {
            // Clear before the action resolves: the round trip is a page
            // revalidation, and leaving the text sitting there reads as a
            // failed post.
            setBody('');
            formAction(formData);
          }}
          className="card p-3"
        >
          <input type="hidden" name="leagueId" value={leagueId} />
          <label htmlFor="feed-body" className="sr-only">
            Post to the league feed
          </label>
          <textarea
            id="feed-body"
            name="body"
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={MAX_LENGTH}
            required
            placeholder="Call your shot, coordinate the draft, or gloat…"
            className="field resize-none bg-canvas"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span
              className={`text-2xs tabular-nums ${over ? 'text-danger-deep' : 'text-muted'}`}
              aria-live="polite"
            >
              {remaining < 80 ? `${remaining} left` : ''}
            </span>
            <PostButton disabled={body.trim().length === 0 || over} />
          </div>
        </form>
      ) : (
        <p className="card p-4 text-xs text-muted">
          Join this league to post.
        </p>
      )}

      {messages.length === 0 ? (
        <p className="mt-3 text-center text-2xs text-muted">
          Somebody has to go first.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <motion.li
                key={message.id}
                layout={!reduceMotion}
                initial={reduceMotion ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                transition={{ duration: 0.22 }}
                className="card p-4"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={message.authorName} photoUrl={message.authorAvatarUrl} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-semibold">{message.authorName}</span>
                      <time
                        dateTime={new Date(message.createdAt).toISOString()}
                        className="shrink-0 text-2xs text-muted"
                      >
                        {relativeTime(message.createdAt)}
                      </time>
                    </p>
                    {/* whitespace-pre-wrap keeps the line breaks someone typed;
                        break-words stops an unbroken string blowing out the
                        card on a narrow screen. */}
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {message.body}
                    </p>

                    <div className="mt-2.5 flex items-center gap-2">
                      <ReactionButton
                        messageId={message.id}
                        kind="HYPE"
                        count={message.hype}
                        active={message.myHype}
                      />
                      <ReactionButton
                        messageId={message.id}
                        kind="SHADE"
                        count={message.shade}
                        active={message.myShade}
                      />
                      {(message.isMine || isCommissioner) && (
                        <DeleteMessageForm messageId={message.id} />
                      )}
                    </div>
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

function PostButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className="btn-primary btn-sm"
    >
      {pending ? 'Posting…' : 'Post'}
    </button>
  );
}

const REACTION_LABEL = {
  HYPE: { verb: 'Hype', on: 'bg-brand-gold-soft text-brand-gold-deep' },
  SHADE: { verb: 'Shade', on: 'bg-danger-soft text-danger-deep' },
} as const;

function ReactionButton({
  messageId,
  kind,
  count,
  active,
}: {
  messageId: string;
  kind: 'HYPE' | 'SHADE';
  count: number;
  active: boolean;
}) {
  const [, formAction] = useFormState<ActionState, FormData>(toggleReactionAction, {});
  const { verb, on } = REACTION_LABEL[kind];

  return (
    <form action={formAction}>
      <input type="hidden" name="messageId" value={messageId} />
      <input type="hidden" name="kind" value={kind} />
      <button
        type="submit"
        // aria-pressed, not colour alone: whether you already reacted is state,
        // and the only other signal is a background tint.
        aria-pressed={active}
        aria-label={`${verb}${count > 0 ? ` (${count})` : ''}`}
        className={`btn btn-sm ${active ? on : 'bg-canvas text-muted hover:text-ink'}`}
      >
        {kind === 'HYPE' ? <FlameIcon /> : <TargetIcon />}
        <span className="tabular-nums">{count > 0 ? count : verb}</span>
      </button>
    </form>
  );
}

function DeleteMessageForm({ messageId }: { messageId: string }) {
  const [, formAction] = useFormState<ActionState, FormData>(deleteMessageAction, {});
  return (
    <form action={formAction} className="ml-auto">
      <input type="hidden" name="messageId" value={messageId} />
      <button type="submit" className="btn btn-sm text-muted hover:text-danger-deep">
        Delete
      </button>
    </form>
  );
}

function FlameIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 3s5 4.2 5 9a5 5 0 0 1-10 0c0-1.6.6-3 1.4-4.1.3 1.2 1.1 2 2.1 2C11.5 7.8 12 5.3 12 3Z" strokeLinejoin="round" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}
