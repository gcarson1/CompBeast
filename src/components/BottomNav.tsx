'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/ui';

export const TABS = [
  { href: '/leagues', label: 'Leagues', icon: HomeIcon, owns: ['/leagues', '/teams'] },
  // Player pages are reached through a season, so they keep this tab lit.
  { href: '/seasons', label: 'Seasons', icon: BoxIcon, owns: ['/seasons', '/players'] },
  { href: '/rules', label: 'Rules', icon: BookIcon, owns: ['/rules'] },
  // Notifications live in the header bell; this is the profile, friends and
  // career-stats surface, which is where the bell's alerts mostly lead.
  { href: '/account', label: 'You', icon: PersonIcon, owns: ['/account', '/notifications'] },
];

/** Whether `tab` owns the page at `pathname`, so it shows as the current one. */
export function tabIsActive(tab: (typeof TABS)[number], pathname: string): boolean {
  return tab.owns.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    // Outside the scroller, at the foot of the app column, so it cannot be
    // carried up the screen: it is not in the flow of anything that scrolls.
    // A phone and tablet control: on a wide screen the same tabs sit in the
    // header (<HeaderNav>), where a desktop reader looks for them.
    <nav className="relative z-20 flex-none border-t border-hairline bg-surface px-4 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-2 lg:hidden">
      <ul className="mx-auto flex max-w-md items-center sm:max-w-lg lg:max-w-3xl justify-around">
        {TABS.map((tab) => {
          const active = tabIsActive(tab, pathname);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex w-16 flex-col items-center gap-1 py-2 transition duration-200 ease-spring motion-safe:active:scale-90 sm:w-20',
                  active ? 'text-ink' : 'text-muted hover:text-ink',
                )}
              >
                {/* The current tab is marked from the nav's top edge by one of
                    the wordmark's slanted bars, and its icon turns gold. */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute -top-2 h-[3px] w-8 -skew-x-[20deg] bg-brand-gold transition-[opacity,transform] duration-300 ease-soft',
                    active ? 'opacity-100' : 'scale-x-0 opacity-0',
                  )}
                />
                <span className={cn('transition-colors duration-200', active && 'text-brand-gold')}>
                  <Icon />
                </span>
                <span className={cn('text-2xs', active ? 'font-semibold' : 'font-medium')}>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 9.5V20h13V9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3Z" strokeLinejoin="round" />
      <path d="M4 7.5 12 12l8-4.5M12 12v9" strokeLinejoin="round" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c0-3.7 3.1-6.4 7-6.4s7 2.7 7 6.4" strokeLinecap="round" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M5 4.5h9a3 3 0 0 1 3 3V20a2.5 2.5 0 0 0-2.5-2.5H5Z" strokeLinejoin="round" />
      <path d="M19 6.5V20" strokeLinecap="round" />
    </svg>
  );
}
