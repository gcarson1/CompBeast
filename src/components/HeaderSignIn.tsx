'use client';

import { SignInButton, SignedOut } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';

/**
 * The header's "Sign in" for a visitor on the website (in the iOS app the
 * tab bar carries it). Not on the sign-in and sign-up pages themselves,
 * where it would only reopen the form already on the screen.
 */
export function HeaderSignIn() {
  const pathname = usePathname();
  if (pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')) return null;
  return (
    <SignedOut>
      <SignInButton mode="modal">
        <button type="button" className="btn-ghost btn-sm">
          Sign in
        </button>
      </SignInButton>
    </SignedOut>
  );
}
