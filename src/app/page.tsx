import Link from 'next/link';
import { redirect } from 'next/navigation';
import { atRiskMessage, nearMissMessage } from '@/lib/engagement';
import { formatPoints, pointsTone, relativeTime } from '@/lib/ui';
import { getCurrentUser } from '@/lib/auth';
import { getUserTeams, type UserTeamSummary } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect('/leagues');

  const teams = await getUserTeams(user.id);
  if (teams.length === 0) redirect('/leagues');

  return (
    <div className="pt-2">
      <p className="text-[12px] font-medium uppercase tracking-wide text-muted">
        Your matchup{teams.length > 1 ? 's' : ''}
      </p>
      <div className="mt-3 space-y-4">
        {teams.map((team) => (
          <MatchupHero key={team.teamId} team={team} />
        ))}
      </div>
    </div>
  );
}

function MatchupHero({ team }: { team: UserTeamSummary }) {
  const nearMiss = nearMissMessage(team.rows, team.teamId);
  const atRisk = atRiskMessage(team.atRiskNames);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-start justify-between p-4 pb-0">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{team.teamName}</p>
          <p className="mt-0.5 truncate text-[12px] text-muted">
            {team.showName} · {team.leagueName}
          </p>
        </div>
        {team.rank > 0 && (
          <span
            className={`pill shrink-0 text-[11px] ${
              team.rank === 1 ? 'bg-brand-gold text-ink' : 'bg-canvas text-muted'
            }`}
          >
            #{team.rank}
          </span>
        )}
      </div>

      <div className="flex items-end justify-between px-4 pb-1 pt-3">
        <span className="font-display text-[56px] leading-none tracking-wide">{team.totalPoints}</span>
        <span className={`mb-1.5 text-[14px] font-semibold tabular-nums ${pointsTone(team.lastCyclePoints)}`}>
          {formatPoints(team.lastCyclePoints)} last cycle
        </span>
      </div>

      {team.currentCycleLabel && team.locksAt && (
        <div className="flex items-center justify-between px-4 pb-4">
          <span className="text-[12px] text-muted">{team.currentCycleLabel}</span>
          <span
            className={`pill text-[11px] ${
              team.cycleLocked ? 'bg-canvas text-muted' : 'bg-brand-gold-soft text-brand-gold-deep'
            }`}
          >
            {team.cycleLocked ? 'Locked' : `Rosters lock ${relativeTime(team.locksAt)}`}
          </span>
        </div>
      )}

      {(nearMiss || atRisk) && (
        <div className="space-y-2 border-t border-hairline p-4">
          {nearMiss && (
            <p className="text-[13px] font-medium text-brand-gold-deep">{nearMiss}</p>
          )}
          {atRisk && <p className="text-[13px] font-medium text-danger">{atRisk}</p>}
        </div>
      )}

      <div className="flex divide-x divide-hairline border-t border-hairline">
        <Link
          href={`/teams/${team.teamId}`}
          className="flex-1 p-3 text-center text-[13px] font-medium text-muted transition active:bg-canvas"
        >
          My roster
        </Link>
        <Link
          href={`/leagues/${team.leagueId}`}
          className="flex-1 p-3 text-center text-[13px] font-medium text-muted transition active:bg-canvas"
        >
          League
        </Link>
      </div>
    </div>
  );
}
