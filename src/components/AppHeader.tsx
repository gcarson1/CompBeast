import Link from 'next/link';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';
import { HeaderNav } from '@/components/HeaderNav';
import { NotificationBell } from '@/components/NotificationBell';
import { MARK_BARS, MARK_FILLS, MARK_PIP, MARK_VIEWBOX } from '@/lib/brand';
import { cn } from '@/lib/ui';

export function AppHeader({
  isPlatformAdmin = false,
  signedIn = false,
  unreadCount = 0,
}: {
  isPlatformAdmin?: boolean;
  /** From our own session lookup, not Clerk's — the bell needs a user row. */
  signedIn?: boolean;
  unreadCount?: number;
}) {
  return (
    // Outside the scroller (see AppScroller.tsx), so it never moves. The
    // hairline under it appears only once content is passing beneath —
    // `data-scrolled` on the root, set by the scroller.
    <header className="app-header relative z-20 flex-none border-b border-transparent bg-canvas pb-2.5 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-[calc(env(safe-area-inset-top)+0.875rem)] transition-[border-color,box-shadow] duration-200">
      <div className="mx-auto flex max-w-md items-center gap-4 sm:max-w-lg lg:max-w-3xl">
        <Link href="/leagues" aria-label="Comp Beast home" className="shrink-0 rounded-btn">
          <CompBeastLogo />
        </Link>
        <HeaderNav signedIn={signedIn} />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {signedIn && <NotificationBell initialCount={unreadCount} />}
          {isPlatformAdmin && (
            <Link
              href="/admin/ingestion"
              // Clerk-protected. Next's default prefetch fires an RSC request
              // that the middleware redirects to Clerk's own domain, where it
              // dies on CORS — a failed request and a console error on every
              // page carrying this link, for a payload that can never arrive.
              prefetch={false}
              className="icon-btn"
              aria-label="Ingestion review"
            >
              <FeedIcon />
            </Link>
          )}
          <SignedOut>
            <SignInButton mode="modal">
              <button type="button" className="btn-ghost btn-sm">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            {/* A fixed box around Clerk's button. Its root is `w-full` (the
                sign-in page wants that), and in a flex row a full-width item
                squeezed the bell and the admin link down to 20px slivers. */}
            <span className="grid h-9 w-9 shrink-0 place-items-center">
              <UserButton appearance={{ elements: { avatarBox: 'h-9 w-9 ring-2 ring-white/10' } }} />
            </span>
          </SignedIn>
        </div>
      </div>
    </header>
  );
}

/**
 * The logo: the mark, then the wordmark on the mark's own lean. Mark and
 * wordmark are separate elements (not one flattened SVG) so the wordmark
 * stays real, selectable DOM text in the display typeface rather than a
 * font baked into an asset. `id` keeps the gradient ids unique when the
 * logo appears twice on a page (the header and the footer).
 */
export function CompBeastLogo({
  className,
  id = 'logo',
  size = 'md',
}: {
  className?: string;
  id?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <span className={cn('flex items-center', size === 'sm' ? 'gap-2' : 'gap-2.5', className)}>
      <BrandMark id={id} className={cn('w-auto', size === 'sm' ? 'h-[19px]' : 'h-[26px]')} />
      {/* The literal space is for the text, not the layout — a flex container
          drops whitespace between items, so it renders nothing, but without
          it the wordmark reads "COMPBEAST" to anything that reads text: the
          link's accessible name ("Comp Beast home") then no longer contains
          its visible label, which is a WCAG 2.5.3 failure. */}
      <span
        className={cn(
          'flex -skew-x-[8deg] items-baseline font-display leading-none tracking-[0.04em]',
          size === 'sm' ? 'text-lg' : 'text-2xl',
        )}
      >
        <span className="text-ink">COMP</span> <span className="wordmark-gold ml-[0.2em]">BEAST</span>
      </span>
    </span>
  );
}

/** The mark alone, in its gradients (see `src/lib/brand.ts`). */
export function BrandMark({ id = 'mark', className }: { id?: string; className?: string }) {
  const [short, middle, tall] = MARK_BARS;
  const stops = (colors: readonly string[]) =>
    colors.map((color, i) => (
      <stop
        key={color}
        offset={colors.length === 3 && i === 1 ? 0.35 : i / (colors.length - 1)}
        stopColor={color}
      />
    ));
  return (
    <svg viewBox={MARK_VIEWBOX} className={cn('overflow-visible', className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}-s`} x1="0" y1="0" x2="0" y2="1">
          {stops(MARK_FILLS.slate)}
        </linearGradient>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="0" y2="1">
          {stops(MARK_FILLS.amber)}
        </linearGradient>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          {stops(MARK_FILLS.gold)}
        </linearGradient>
        <radialGradient id={`${id}-p`} cx="0.35" cy="0.35" r="0.7">
          {stops(MARK_FILLS.pip)}
        </radialGradient>
      </defs>
      <polygon points={short} fill={`url(#${id}-s)`} />
      <polygon points={middle} fill={`url(#${id}-a)`} />
      <polygon points={tall} fill={`url(#${id}-g)`} />
      <circle cx={MARK_PIP.cx} cy={MARK_PIP.cy} r={MARK_PIP.r} fill={`url(#${id}-p)`} />
    </svg>
  );
}

function FeedIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" strokeLinecap="round" />
      <circle cx="5" cy="19" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
