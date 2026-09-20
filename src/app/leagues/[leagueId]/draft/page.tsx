import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DraftRoom } from '@/components/DraftRoom';
import { getCurrentUser } from '@/lib/auth';
import { buildDraftOrder } from '@/lib/draft/snake';
import { getDraftBoard, getLeagueOverview } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function DraftPage({ params }: { params: { leagueId: string } }) {
  const [user, overview] = await Promise.all([
    getCurrentUser(),
    getLeagueOverview(params.leagueId),
  ]);
  if (!overview) notFound();

  const { league, picks, contestants, teams } = await getDraftBoard(params.leagueId);

  const order = buildDraftOrder(
    teams.map((t) => t.id),
    league.rosterSize,
    league.draftType === 'LINEAR' ? 'LINEAR' : 'SNAKE',
  );
  const onTheClock = order[picks.length] ?? null;
  const drafted = new Set(picks.map((p) => p.contestantId));
  const myTeam = overview.teams.find((t) => t.owner.id === user?.id) ?? null;

  return (
    <div className="pt-2">
      <Link href={`/leagues/${params.leagueId}`} className="text-xs text-muted">
        ← {overview.name}
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Draft</h1>
      <p className="mt-0.5 text-xs text-muted">
        {league.draftType.toLowerCase()} · {league.rosterSize} rounds · {teams.length} teams
      </p>

      <DraftRoom
        leagueId={params.leagueId}
        draftStatus={league.draftStatus}
        isCommissioner={user?.id === overview.commissionerId}
        myTeamId={myTeam?.id ?? null}
        onTheClockTeamId={onTheClock?.teamId ?? null}
        currentPickNumber={Math.min(picks.length + 1, order.length)}
        currentRound={onTheClock?.round ?? league.rosterSize}
        totalRounds={league.rosterSize}
        totalPicks={order.length}
        teams={teams.map((t) => ({
          id: t.id,
          name: t.name,
          ownerName: t.owner?.name ?? null,
          position: t.draftOrderPosition,
        }))}
        picks={picks.map((p) => ({
          pickNumber: p.pickNumber,
          round: p.round,
          teamId: p.teamId,
          teamName: p.team.name,
          contestantName: p.contestant.name,
        }))}
        available={contestants
          .filter((c) => !drafted.has(c.id))
          .map((c) => ({
            id: c.id,
            name: c.name,
            photoUrl: c.photoUrl,
            occupation: (c.metadata as { occupation?: string } | null)?.occupation ?? null,
            isActive: c.isActive,
          }))}
      />
    </div>
  );
}
