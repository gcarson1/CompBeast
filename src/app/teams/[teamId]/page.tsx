import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { formatPoints, pointsTone } from '@/lib/ui';
import { getTeamDetail } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function TeamPage({ params }: { params: { teamId: string } }) {
  const detail = await getTeamDetail(params.teamId);
  if (!detail) notFound();

  const { team, score, roster } = detail;

  return (
    <div className="pt-2">
      <Link href={`/leagues/${team.leagueId}`} className="text-[13px] text-muted">
        ← League
      </Link>

      <div className="mt-3 flex items-center gap-3">
        <Avatar name={team.ownerName ?? team.name} size={52} />
        <div className="min-w-0">
          <h1 className="truncate text-[24px] font-semibold tracking-tight">{team.name}</h1>
          <p className="text-[13px] text-muted">{team.ownerName}</p>
        </div>
      </div>

      <div className="card mt-4 grid grid-cols-3 divide-x divide-hairline p-4 text-center">
        <Stat label="Total" value={`${score?.totalPoints ?? 0}`} />
        <Stat label="Rank" value={score?.rank ? `#${score.rank}` : '—'} />
        <Stat label="Last week" value={formatPoints(score?.lastCyclePoints ?? 0)} />
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-[17px] font-semibold">Roster</h2>
        <ul className="card divide-y divide-hairline">
          {roster.map((player) => (
            <li key={player.contestantId}>
              <Link href={`/players/${player.contestantId}`} className="flex items-center gap-3 p-4">
                <Avatar name={player.name} size={42} dimmed={!player.isActive} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{player.name}</span>
                  <span className="mt-0.5 block text-[12px] text-muted">
                    {player.isActive ? 'In the house' : `Evicted · ${player.eliminatedLabel ?? '—'}`}
                  </span>
                </span>
                <span className={`text-[16px] font-semibold tabular-nums ${pointsTone(player.points)}`}>
                  {formatPoints(player.points)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {score && score.cycles.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[17px] font-semibold">Week by week</h2>
          <div className="card divide-y divide-hairline">
            {score.cycles.map((cycle) => (
              <details key={cycle.cycleId} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between p-4">
                  <span className="text-[15px] font-medium">{cycle.label}</span>
                  <span className="flex items-center gap-2">
                    <span className={`text-[15px] font-semibold tabular-nums ${pointsTone(cycle.points)}`}>
                      {formatPoints(cycle.points)}
                    </span>
                    <ChevronIcon />
                  </span>
                </summary>
                <ul className="space-y-1.5 border-t border-hairline bg-canvas/60 px-4 py-3">
                  {cycle.lines.map((line) => (
                    <li key={line.scoredEventId} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{line.label}</span>
                      <span className={`text-[13px] font-medium tabular-nums ${pointsTone(line.points)}`}>
                        {formatPoints(line.points)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[20px] font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#94A3B8"
      strokeWidth="2"
      className="transition group-open:rotate-180"
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
