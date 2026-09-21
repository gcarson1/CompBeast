import { currentUser } from '@clerk/nextjs/server';
import * as React from 'react';
import { prisma } from './db';

/**
 * React's per-request memo where it exists. React 18 only exports `cache`
 * under the `react-server` condition — the build Next uses for server
 * components, actions and route handlers. Under Node's default condition
 * (the test runner) it is undefined, and there is no request to scope to
 * anyway, so the function is used as is.
 */
const perRequest: <T extends (...args: never[]) => unknown>(fn: T) => T =
  typeof React.cache === 'function' ? React.cache : (fn) => fn;

/**
 * Auth boundary.
 *
 * Every caller in the app goes through `getCurrentUser()` / `requireUser()` and
 * never touches Clerk directly. `User.authId` holds Clerk's user id — swapping
 * providers later means changing only this file.
 */

export type SessionUser = {
  id: string;
  name: string | null;
  email: string;
  handle: string | null;
  avatarUrl: string | null;
  isPlatformAdmin: boolean;
};

const SELECT = {
  id: true,
  name: true,
  email: true,
  handle: true,
  avatarUrl: true,
  isPlatformAdmin: true,
} as const;

/**
 * Resolves the signed-in user, provisioning our `User` row on first sign-in.
 *
 * Clerk owns the identity; we only mirror the fields the app actually reads.
 * There's no webhook — the row is created lazily, the first time a signed-in
 * visitor hits a page that asks who they are, which is simpler than standing
 * up webhook signature verification for an app this size.
 *
 * Wrapped in React's per-request `cache`: the root layout asks who this is
 * for the header, and then every page asks again for itself, which was two
 * identical user lookups on every request.
 */
export const getCurrentUser = perRequest(async function getCurrentUser(): Promise<SessionUser | null> {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const existing = await prisma.user.findUnique({ where: { authId: clerkUser.id }, select: SELECT });
  if (existing) {
    // Reconciled on every sign-in, not just at row creation. An account that
    // already existed when PLATFORM_ADMIN_EMAILS was set would otherwise be
    // stranded without admin forever, because nothing else in the app grants
    // the flag. Grant-only: a flag set some other way is never revoked here.
    if (!existing.isPlatformAdmin && adminEmailList().includes(existing.email.toLowerCase())) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { isPlatformAdmin: true },
        select: SELECT,
      });
    }
    return existing;
  }

  const email =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) return null; // Clerk allows email-less accounts (e.g. phone-only); unsupported here.

  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null;

  return prisma.user.create({
    data: {
      authId: clerkUser.id,
      email,
      name,
      avatarUrl: clerkUser.imageUrl || null,
      handle: clerkUser.username,
      isPlatformAdmin: adminEmailList().includes(email.toLowerCase()),
    },
    select: SELECT,
  });
});

/**
 * Emails this deploy grants platform admin to, from `PLATFORM_ADMIN_EMAILS`.
 *
 * Bootstraps admin by email because platform admin can only be granted by
 * another admin — without it, the first real account after any database reset
 * has no way to reach ingestion review short of a manual SQL update.
 */
function adminEmailList(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}

/**
 * Gate for actions that reach beyond a single league — ingestion publishes
 * events that rescore every league on a season, so league membership is not a
 * sufficient credential.
 */
export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isPlatformAdmin) throw new Error('FORBIDDEN');
  return user;
}

/** Role check used by league-scoped mutations. */
export async function assertLeagueRole(
  leagueId: string,
  userId: string,
  roles: Array<'COMMISSIONER' | 'ADMIN' | 'MEMBER'>,
): Promise<void> {
  const membership = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
    select: { role: true, status: true },
  });
  if (!membership || membership.status !== 'ACTIVE' || !roles.includes(membership.role)) {
    throw new Error('FORBIDDEN');
  }
}
