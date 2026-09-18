import { cookies } from 'next/headers';
import { prisma } from './db';

/**
 * Auth boundary.
 *
 * Every caller in the app goes through `getCurrentUser()` / `requireUser()` and
 * never touches a provider SDK directly. Wiring up Clerk, Auth.js, or Supabase
 * means replacing the body of `resolveAuthId()` with that provider's session
 * lookup — no call site changes, because `User.authId` is already provider-
 * neutral.
 *
 * Until a provider is configured, a signed-out visitor is transparently bound
 * to the first seeded user so the app is fully explorable in development.
 */

const DEV_SESSION_COOKIE = 'cb_dev_user';

async function resolveAuthId(): Promise<string | null> {
  // ── Swap point ──────────────────────────────────────────────────────────
  // Clerk:     const { userId } = auth(); return userId;
  // Auth.js:   const session = await auth(); return session?.user?.id ?? null;
  // Supabase:  const { data } = await supabase.auth.getUser(); return data.user?.id ?? null;
  // ────────────────────────────────────────────────────────────────────────
  const devUser = cookies().get(DEV_SESSION_COOKIE)?.value;
  return devUser ?? null;
}

export type SessionUser = {
  id: string;
  name: string | null;
  email: string;
  handle: string | null;
  avatarUrl: string | null;
  isPlatformAdmin: boolean;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const authId = await resolveAuthId();

  if (authId) {
    const user = await prisma.user.findUnique({
      where: { authId },
      select: { id: true, name: true, email: true, handle: true, avatarUrl: true, isPlatformAdmin: true },
    });
    if (user) return user;
  }

  if (process.env.NODE_ENV === 'production') return null;

  // Development fallback: act as the first seeded user.
  return prisma.user.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, email: true, handle: true, avatarUrl: true, isPlatformAdmin: true },
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
