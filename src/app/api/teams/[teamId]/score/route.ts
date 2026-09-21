import { NextResponse } from 'next/server';
import { getTeamDetail } from '@/server/queries';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { teamId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const detail = await getTeamDetail(params.teamId);
  if (!detail) return NextResponse.json({ error: 'Team not found' }, { status: 404 });

  const includeBreakdown = new URL(request.url).searchParams.get('breakdown') === 'true';

  return NextResponse.json({
    team: detail.team,
    totalPoints: detail.score?.totalPoints ?? 0,
    rank: detail.score?.rank ?? null,
    lastCyclePoints: detail.score?.lastCyclePoints ?? 0,
    roster: detail.roster,
    cycles: (detail.score?.cycles ?? []).map((cycle) => ({
      cycleId: cycle.cycleId,
      label: cycle.label,
      sequence: cycle.sequence,
      points: cycle.points,
      ...(includeBreakdown ? { lines: cycle.lines } : {}),
    })),
  });
}
