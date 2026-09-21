'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/ui';

const TABS = [
  { href: '/leagues', label: 'Leagues', icon: HomeIcon, owns: ['/leagues', '/teams'] },
  // Player pages are reached through a season, so they keep this tab lit.
  { href: '/seasons', label: 'Seasons', icon: BoxIcon, owns: ['/seasons', '/players'] },
  { href: '/rules', label: 'Rules', icon: BookIcon, owns: ['/rules'] },
  // Notifications live in the header bell; this is the profile, friends and
  // career-stats surface, which is where the bell's alerts mostly lead.
  { href: '/account', label: 'You', icon: PersonIcon, owns: ['/account', '/notifications'] },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-20 border-t border-hairline bg-surface/95 px-4 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur">
      <ul className="mx-auto flex max-w-md items-center sm:max-w-lg lg:max-w-3xl justify-around">
        {TABS.map((tab) => {
          const active = tab.owns.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex w-16 flex-col items-center gap-1 rounded-btn py-2 transition duration-200 ease-spring motion-safe:active:scale-90 sm:w-20',
                  active ? 'bg-canvas text-ink' : 'text-muted',
                )}
              >
                <Icon />
                <span className="text-2xs font-medium">{tab.label}</span>
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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 9.5V20h13V9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3Z" strokeLinejoin="round" />
      <path d="M4 7.5 12 12l8-4.5M12 12v9" strokeLinejoin="round" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c0-3.7 3.1-6.4 7-6.4s7 2.7 7 6.4" strokeLinecap="round" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 4.5h9a3 3 0 0 1 3 3V20a2.5 2.5 0 0 0-2.5-2.5H5Z" strokeLinejoin="round" />
      <path d="M19 6.5V20" strokeLinecap="round" />
    </svg>
  );
}
