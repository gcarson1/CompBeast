import { NextResponse } from 'next/server';
import { getLeagueLeaderboard } from '@/server/queries';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { leagueId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const league = await prisma.league.findUnique({
    where: { id: params.leagueId },
    select: {
      isPublic: true,
      name: true,
      scoringRuleset: { select: { id: true, name: true } },
      members: { where: { userId: user.id, status: 'ACTIVE' }, select: { id: true } },
    },
  });
  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
  if (!league.isPublic && league.members.length === 0) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { rows } = await getLeagueLeaderboard(params.leagueId);

  return NextResponse.json({
    league: { id: params.leagueId, name: league.name },
    ruleset: league.scoringRuleset,
    standings: rows,
  });
}
