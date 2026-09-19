import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher([
  '/leagues/new(.*)',
  '/leagues/join(.*)',
  '/leagues/:leagueId/draft(.*)',
  '/leagues/:leagueId/settings(.*)',
  '/account(.*)',
  '/notifications(.*)',
  '/admin(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect();
});

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)'],
};
