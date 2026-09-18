import Link from 'next/link';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';

export function AppHeader({ isPlatformAdmin = false }: { isPlatformAdmin?: boolean }) {
  return (
    <header className="sticky top-0 z-20 bg-canvas/90 px-5 pb-2 pt-4 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between">
        <Link href="/leagues" className="flex items-center gap-2" aria-label="Comp Beast home">
          <LogoMark />
        </Link>
        <div className="flex items-center gap-3">
          {isPlatformAdmin && (
            <Link
              href="/admin/ingestion"
              className="grid h-9 w-9 place-items-center rounded-full bg-surface shadow-card"
              aria-label="Ingestion review"
            >
              <FeedIcon />
            </Link>
          )}
          <button
            type="button"
            className="relative grid h-9 w-9 place-items-center rounded-full bg-surface shadow-card"
            aria-label="Notifications"
          >
            <BellIcon />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger ring-2 ring-surface" />
          </button>
          <SignedOut>
            <SignInButton mode="modal">
              <button type="button" className="pill bg-ink px-4 py-2 text-[13px] text-white">
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

function LogoMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M16 3 28 11l-12 5.5L4 11 16 3Z" fill="#8fa9f5" />
      <path d="M16 18.5 28 13v8l-12 8-12-8v-8l12 5.5Z" fill="#5b7ce8" />
    </svg>
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

function BellIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6.5 10a5.5 5.5 0 1 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z" strokeLinejoin="round" />
      <path d="M10 18.5a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  );
}
