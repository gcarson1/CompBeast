import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { PlayerTabs } from '@/components/PlayerTabs';
import { formatPoints, pointsTone } from '@/lib/ui';
import { getContestantProfile } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function PlayerPage({ params }: { params: { contestantId: string } }) {
  const player = await getContestantProfile(params.contestantId);
  if (!player) notFound();

  const meta = player.metadata as
    | { occupation?: string; hometown?: string; age?: number }
    | null;

  const leagues = player.draftPicks.map((pick) => ({
    leagueId: pick.team.league.id,
    leagueName: pick.team.league.name,
    teamName: pick.team.name,
  }));

  return (
    <div className="pt-2">
      <Link href={`/seasons/${player.season.slug}`} className="text-[13px] text-muted">
        ← {player.season.name}
      </Link>

      <div className="mt-4 flex flex-col items-center text-center">
        <Avatar name={player.name} size={84} dimmed={!player.isActive} />
        <h1 className="mt-3 text-[22px] font-semibold tracking-tight">{player.name}</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          {player.isActive ? 'In the house' : `Evicted · ${player.eliminatedCycle?.label ?? '—'}`}
        </p>
        <p className={`mt-2 text-[28px] font-semibold tabular-nums ${pointsTone(player.totalPoints)}`}>
          {formatPoints(player.totalPoints)}
        </p>
        <p className="text-[11px] uppercase tracking-wide text-muted">Season points</p>
      </div>

      <div className="card mt-4 grid grid-cols-3 divide-x divide-hairline p-3 text-center">
        <Fact label="Age" value={meta?.age ? String(meta.age) : '—'} />
        <Fact label="From" value={meta?.hometown?.split(',')[0] ?? '—'} />
        <Fact label="Job" value={meta?.occupation ?? '—'} />
      </div>

      <PlayerTabs events={player.events} gameLog={player.gameLog} leagues={leagues} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-1">
      <div className="truncate text-[13px] font-semibold">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}
