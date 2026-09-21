'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const POLL_MS = 60_000;

/**
 * The unread badge in the header.
 *
 * Seeded from a server-rendered count so it is correct on first paint with no
 * request at all, then kept fresh by polling. There is no realtime transport
 * in this app (the league feed is refresh-based for the same reason), and a
 * notification badge is the one place where "a minute stale" is genuinely
 * fine.
 *
 * It refreshes on tab focus as well as on the interval, which is the case
 * that actually matters: someone comes back to a tab they left open an hour
 * ago and the first thing they look at is this number.
 */
export function NotificationBell({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const pathname = usePathname();

  // Trust a new server render over local state — navigating to a page that
  // marks things read should not leave a stale number sitting in the header.
  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      // Polling a hidden tab is wasted work; the visibility listener below
      // catches it up the moment someone looks at it again.
      if (document.hidden) return;
      try {
        const response = await fetch('/api/notifications/unread', { cache: 'no-store' });
        if (!response.ok) return;
        const data: { count?: number } = await response.json();
        if (!cancelled && typeof data.count === 'number') setCount(data.count);
      } catch {
        // Offline or a dropped request. The badge keeps its last known value
        // rather than flashing to zero, which would read as "all caught up".
      }
    }

    const id = setInterval(refresh, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pathname]);

  const label =
    count === 0 ? 'Notifications' : `Notifications, ${count} unread${count >= 100 ? ' or more' : ''}`;

  return (
    <Link
      href="/notifications"
      prefetch={false}
      aria-label={label}
      className="relative grid h-9 w-9 place-items-center rounded-full bg-surface text-muted transition hover:text-ink"
    >
      <BellIcon />
      {count > 0 && (
        <span
          // aria-hidden because the count is already in the link's own label;
          // announcing it twice is worse than not styling it at all.
          aria-hidden
          className="absolute -right-0.5 -top-0.5 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-danger px-1 text-2xs font-bold leading-none text-white ring-2 ring-canvas"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

function BellIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path
        d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13.7 19a2 2 0 0 1-3.4 0" strokeLinecap="round" />
    </svg>
  );
}
