'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TABS, tabIsActive } from '@/components/BottomNav';
import { cn } from '@/lib/ui';

/**
 * The bottom nav's tabs, in the header, for screens wide enough to hold
 * them: from `lg` for someone signed in (the bottom nav stands down there),
 * and from `sm` for a visitor, who has no bottom nav at all and otherwise
 * could reach the seasons and the rules only through the footer. The
 * current tab is underlined by one of the wordmark's slanted bars, sitting
 * on the header's bottom edge.
 */
export function HeaderNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  // A visitor's "Leagues" is the landing page, which the logo already is;
  // "You" needs an account.
  const tabs = signedIn ? TABS : TABS.filter((tab) => tab.href === '/seasons' || tab.href === '/rules');

  return (
    <nav
      aria-label="Main"
      className={cn('items-center gap-1', signedIn ? 'hidden lg:flex' : 'hidden sm:flex')}
    >
      {tabs.map((tab) => {
        const active = tabIsActive(tab, pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative rounded-btn px-3 py-2 text-sm font-semibold transition-colors duration-200',
              active ? 'text-ink' : 'text-muted hover:text-ink',
            )}
          >
            {tab.label}
            <span
              aria-hidden
              className={cn(
                'absolute inset-x-3 -bottom-[11px] h-[3px] -skew-x-[20deg] rounded-t-[2px] bg-brand-gold transition-[opacity,transform] duration-300 ease-soft',
                active ? 'opacity-100' : 'scale-x-0 opacity-0',
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
