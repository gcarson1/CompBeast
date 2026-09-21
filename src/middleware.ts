import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

/**
 * `/leagues/join` is deliberately absent. It is where a scanned QR code
 * lands, and for a new member the page itself is the sign-up: it shows the
 * league they were invited to and puts "Continue with Google" under it, then
 * returns them to the same URL signed in. Bouncing them to a sign-in page
 * first — the previous behaviour — is what made joining feel clunky. Joining
 * itself is a server action that still requires a session. Keeping the page
 * public is also what lets a chat's link preview fetch it.
 */
const isProtectedRoute = createRouteMatcher([
  '/leagues/new(.*)',
  '/leagues/:leagueId/draft(.*)',
  '/leagues/:leagueId/settings(.*)',
  '/account(.*)',
  '/notifications(.*)',
  '/admin(.*)',
]);

export default clerkMiddleware(
  async (auth, req) => {
    if (isProtectedRoute(req)) await auth.protect();
  },
  // Where `auth.protect()` sends a signed-out visitor: our pages, not the
  // hosted portal. `redirect_url` is appended automatically.
  { signInUrl: '/sign-in', signUpUrl: '/sign-up' },
);

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)'],
};
