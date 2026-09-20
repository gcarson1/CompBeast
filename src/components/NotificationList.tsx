'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { Avatar } from '@/components/Avatar';
import { relativeTime } from '@/lib/ui';
import { markAllNotificationsReadAction, type ActionState } from '@/server/actions';
import type { NotificationView } from '@/server/notifications';

/**
 * Per-type accent and glyph.
 *
 * Keyed off the enum so adding a notification type is a line here and a line
 * in the schema — nothing else in the UI has to learn about it. An unknown
 * type falls back to the neutral treatment rather than rendering nothing,
 * because a notification with no icon is still readable but a blank row is a
 * bug the person cannot report.
 */
const STYLES: Record<string, { tone: string; icon: 'person' | 'league' | 'draft' | 'alert' }> = {
  FRIEND_REQUEST: { tone: 'text-brand-velvet-deep', icon: 'person' },
  FRIEND_ACCEPTED: { tone: 'text-brand-velvet-deep', icon: 'person' },
  LEAGUE_INVITE: { tone: 'text-brand-gold-deep', icon: 'league' },
  LEAGUE_MEMBER_JOINED: { tone: 'text-brand-gold-deep', icon: 'league' },
  LEAGUE_DRAFT_STARTED: { tone: 'text-brand-gold-deep', icon: 'draft' },
  LEAGUE_DRAFT_PICK_DUE: { tone: 'text-brand-gold-deep', icon: 'draft' },
  LEAGUE_DRAFT_COMPLETED: { tone: 'text-brand-gold-deep', icon: 'draft' },
  LEAGUE_UPDATED: { tone: 'text-muted', icon: 'alert' },
  LEAGUE_DELETED: { tone: 'text-danger-deep', icon: 'alert' },
};

export function NotificationList({ notifications }: { notifications: NotificationView[] }) {
  const unread = notifications.filter((n) => n.readAt === null).length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {unread > 0 ? `${unread} unread` : 'All caught up'}
        </p>
        {unread > 0 && <MarkAllReadForm />}
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-card border border-dashed border-hairline p-6">
          <h2 className="text-base font-semibold">Nothing yet</h2>
          <p className="mt-1 max-w-measure text-xs leading-relaxed text-muted">
            League invites, friend requests and draft alerts land here. Add a friend from your
            account page to get started.
          </p>
          <Link href="/account" className="btn-ghost btn-sm mt-4">
            Go to your account
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-hairline border-y border-hairline">
          {notifications.map((notification) => (
            <NotificationRow key={notification.id} notification={notification} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationRow({ notification }: { notification: NotificationView }) {
  const style = STYLES[notification.type] ?? { tone: 'text-muted', icon: 'alert' as const };
  const unread = notification.readAt === null;

  const content = (
    <div className="flex items-start gap-3 py-4">
      <span className="relative shrink-0">
        {notification.actorName ? (
          <Avatar name={notification.actorName} photoUrl={notification.actorAvatarUrl} size={36} />
        ) : (
          <span className={`grid h-9 w-9 place-items-center rounded-full bg-surface ${style.tone}`}>
            <TypeIcon kind={style.icon} />
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={`text-sm ${unread ? 'font-semibold text-ink' : 'font-medium text-muted'}`}>
            {notification.title}
          </span>
          <time
            dateTime={new Date(notification.createdAt).toISOString()}
            className="ml-auto shrink-0 text-2xs text-muted"
          >
            {relativeTime(notification.createdAt)}
          </time>
        </span>
        {notification.body && (
          <span className="mt-0.5 block max-w-measure text-2xs leading-relaxed text-muted">
            {notification.body}
          </span>
        )}
      </span>

      {unread && (
        // Not colour alone: the title is also bolder, and the row carries the
        // word "Unread" for a screen reader.
        <span className="mt-1.5 shrink-0" aria-hidden>
          <span className="block h-2 w-2 rounded-full bg-brand-gold" />
        </span>
      )}
    </div>
  );

  return (
    <li>
      {notification.href ? (
        <MarkReadOnVisit notification={notification}>{content}</MarkReadOnVisit>
      ) : (
        <div className="px-1">
          {content}
          {unread && <span className="sr-only">Unread</span>}
        </div>
      )}
    </li>
  );
}

/**
 * The row is a real anchor, and following it marks it read.
 *
 * The mark goes out as `keepalive` fetch rather than a server action on
 * purpose. The click does two things at once — mark, and navigate — and a
 * server action's POST is racing a navigation that may tear it down halfway.
 * `keepalive` is the thing browsers actually guarantee to deliver while the
 * page is going away, and it costs one tiny route.
 *
 * Keeping it an anchor is what preserves middle-click, open-in-new-tab and
 * the destination showing in the status bar. A submit button would have lost
 * all three.
 */
function MarkReadOnVisit({
  notification,
  children,
}: {
  notification: NotificationView;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={notification.href ?? '#'}
      prefetch={false}
      onClick={() => {
        if (notification.readAt !== null) return;
        // Fire-and-forget. Failing to mark read must never block the
        // navigation, and a stale badge for 60s is not worth a blocked tap.
        void fetch('/api/notifications/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: notification.id }),
          keepalive: true,
        }).catch(() => {});
      }}
      className="block rounded-btn px-1 transition hover:bg-surface/60"
    >
      {children}
      {notification.readAt === null && <span className="sr-only">Unread</span>}
    </Link>
  );
}

function MarkAllReadForm() {
  const [state, formAction] = useFormState<ActionState, FormData>(
    markAllNotificationsReadAction,
    {},
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  return (
    <form action={formAction}>
      <MarkAllButton />
    </form>
  );
}

function MarkAllButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className="btn-ghost btn-sm">
      {pending ? 'Marking…' : 'Mark all read'}
    </button>
  );
}

function TypeIcon({ kind }: { kind: 'person' | 'league' | 'draft' | 'alert' }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    'aria-hidden': true,
  } as const;

  if (kind === 'person') {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 20c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'draft') {
    return (
      <svg {...common}>
        <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'league') {
    return (
      <svg {...common}>
        <path d="M6 20v-6M12 20V9M18 20V4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v4.5M12 16h.01" strokeLinecap="round" />
    </svg>
  );
}
