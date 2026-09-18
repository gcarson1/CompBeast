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
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const existing = await prisma.user.findUnique({ where: { authId: clerkUser.id }, select: SELECT });
  if (existing) return existing;

  const email =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) return null; // Clerk allows email-less accounts (e.g. phone-only); unsupported here.

  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null;

  // Bootstrap admin by email. Platform admin can only be granted by another
  // admin, so without this the first real account after any database reset has
  // no way to reach ingestion review — the flag previously survived only as a
  // manual SQL update.
  const adminEmails = (process.env.PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return prisma.user.create({
    data: {
      authId: clerkUser.id,
      email,
      name,
      avatarUrl: clerkUser.imageUrl || null,
      handle: clerkUser.username,
      isPlatformAdmin: adminEmails.includes(email.toLowerCase()),
    },
    select: SELECT,
  });
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
