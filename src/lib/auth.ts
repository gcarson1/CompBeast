import { currentUser } from '@clerk/nextjs/server';
import { prisma } from './db';

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
 * A row whose `authId` no longer matches is re-keyed by email rather than
 * recreated. Clerk ids are per instance, so moving from the development
 * instance to a production one hands every returning member a brand-new id;
 * without this the `create` below would trip the unique index on `email` and
 * every existing account would 500 on sign-in. Everything else in the schema
 * hangs off `User.id`, so adopting the row keeps leagues, teams and picks.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
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

  const primaryEmail =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId) ??
    clerkUser.emailAddresses[0];
  const email = primaryEmail?.emailAddress;
  if (!email) return null; // Clerk allows email-less accounts (e.g. phone-only); unsupported here.

  // Only a verified address may claim an existing row — otherwise anyone could
  // sign up as you@example.com and inherit your leagues. Clerk verifies at
  // sign-up by default (and Google addresses arrive verified), so this is a
  // guard against a dashboard misconfiguration, not the normal path. An
  // unverified match falls through to `create` and fails on the email index,
  // which is the right outcome: loud, and nothing is handed over.
  if (primaryEmail.verification?.status === 'verified') {
    const orphan = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (orphan) {
      return prisma.user.update({
        where: { id: orphan.id },
        data: { authId: clerkUser.id },
        select: SELECT,
      });
    }
  }

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
}

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
