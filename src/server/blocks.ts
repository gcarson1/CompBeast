import { prisma } from '../lib/db';

/**
 * Who is blocked from whom — the read side of blocking, on its own so the
 * feed, the friend graph and the moderation module can all ask without
 * importing each other. Writing blocks is src/server/moderation.ts.
 */

/**
 * Everyone this person has blocked or been blocked by, in one round trip.
 * Blocking is symmetric in effect, so this is the one place the OR is
 * written — the same rule as `friendIdsFor`.
 */
export async function blockedIdsFor(userId: string): Promise<string[]> {
  const rows = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return [...new Set(rows.map((row) => (row.blockerId === userId ? row.blockedId : row.blockerId)))];
}

export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  const row = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { id: true },
  });
  return row !== null;
}
