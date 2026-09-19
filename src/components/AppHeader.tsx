import Link from 'next/link';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';

export function AppHeader({ isPlatformAdmin = false }: { isPlatformAdmin?: boolean }) {
  return (
    <header className="sticky top-0 z-20 bg-canvas/90 px-5 pb-2 pt-4 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center sm:max-w-lg lg:max-w-3xl justify-between">
        <Link href="/leagues" aria-label="Comp Beast home">
          <CompBeastLogo />
        </Link>
        <div className="flex items-center gap-3">
          {isPlatformAdmin && (
            <Link
              href="/admin/ingestion"
              // Clerk-protected. Next's default prefetch fires an RSC request
              // that the middleware redirects to Clerk's own domain, where it
              // dies on CORS — a failed request and a console error on every
              // page carrying this link, for a payload that can never arrive.
              prefetch={false}
              className="grid h-9 w-9 place-items-center rounded-full bg-surface shadow-card"
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
            <UserButton appearance={{ elements: { avatarBox: 'h-9 w-9' } }} />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}

/**
 * The Ascending Tally: bars climbing from early-game slate to gold "Comp Beast
 * peak," capped with a red clutch-veto pip. Mark and wordmark are separate
 * elements (not one flattened SVG) so the wordmark stays real, selectable
 * DOM text in the display typeface rather than a font baked into an asset.
 */
export function CompBeastLogo({ className = 'h-8' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg viewBox="0 0 64 64" className="h-full w-auto overflow-visible" fill="none" aria-hidden>
        <g transform="translate(4, 10)">
          <polygon points="7,24 14,24 7,44 0,44" className="fill-slate-500" />
          <polygon points="22,12 29,12 21,44 14,44" className="fill-brand-gold" />
          <polygon points="37,0 45,0 35,44 27,44" className="fill-brand-gold" />
          <circle cx="53" cy="7" r="4.5" className="fill-danger" />
        </g>
      </svg>
      <div className="flex items-baseline font-display tracking-wider text-2xl">
        <span className="text-ink">COMP</span>
        <span className="ml-1 text-brand-gold">BEAST</span>
      </div>
    </div>
  );
}

function FeedIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" strokeLinecap="round" />
      <circle cx="5" cy="19" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
