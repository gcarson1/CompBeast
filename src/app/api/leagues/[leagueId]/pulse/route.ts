import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * "Has anything happened in this league since I loaded the page?"
 *
 * The whole live-update story in this app hangs off this one route, so it is
 * built to be the cheapest thing in the codebase: three indexed counts and an
 * enum, no joins to fetch content, no rendering. Clients poll it and re-render
 * themselves through `router.refresh()` only when a number moves, which means
 * a quiet league costs a count query every few seconds and a busy one costs a
 * page render exactly as often as something actually changed.
 *
 * Polling rather than a socket is a deliberate choice, not a stopgap. Sockets
 * on serverless mean holding an invocation open per viewer; a draft between
 * eight friends does not need that, and polling survives a phone locking, a
 * tunnel, and a backgrounded Safari tab — all of which a socket does not.
 *
 * Counts, not timestamps: a soft-deleted message and an un-hyped post both
 * move a count, and neither moves a `max(createdAt)`.
 */
export async function GET(_request: Request, { params }: { params: { leagueId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const [league, reactions] = await Promise.all([
    prisma.league.findUnique({
      where: { id: params.leagueId },
      select: {
        isPublic: true,
        draftStatus: true,
        members: { where: { userId: user.id, status: 'ACTIVE' }, select: { id: true } },
        _count: {
          select: {
            draftPicks: true,
            messages: { where: { deletedAt: null } },
          },
        },
      },
    }),
    prisma.leagueMessageReaction.count({ where: { message: { leagueId: params.leagueId } } }),
  ]);

  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
  if (!league.isPublic && league.members.length === 0) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(
    {
      draftStatus: league.draftStatus,
      picks: league._count.draftPicks,
      messages: league._count.messages,
      reactions,
    },
    // Belt and braces against a phone's HTTP cache answering this for us.
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
