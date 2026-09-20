import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Avatar } from '@/components/Avatar';
import { JsonLd } from '@/components/JsonLd';
import { PlayerTabs } from '@/components/PlayerTabs';
import { absoluteUrl, breadcrumbList } from '@/lib/seo';
import { formatPoints, pointsTone } from '@/lib/ui';
import { getContestantProfile } from '@/server/queries';

export const dynamic = 'force-dynamic';

// Shared between `generateMetadata` and the render via React's per-request
// cache — one profile query per request. No loading boundary sits above
// this route, so an unknown id is a real 404 (see the season page).
const loadPlayer = cache((contestantId: string) => getContestantProfile(contestantId));

export async function generateMetadata({
  params,
}: {
  params: { contestantId: string };
}): Promise<Metadata> {
  const player = await loadPlayer(params.contestantId);
  if (!player) notFound();

  const status = player.isActive ? 'still in the house' : 'evicted';
  return {
    title: `${player.name} — ${player.season.name} fantasy points`,
    description: `${player.name}'s Comp Beast fantasy scoring on ${player.season.name} (${player.season.show.name}): ${formatPoints(
      player.totalPoints,
    )} points from ${player.events.length} scored ${player.events.length === 1 ? 'event' : 'events'}, ${status}.`,
    alternates: { canonical: absoluteUrl(`/players/${player.id}`) },
  };
}

export default async function PlayerPage({ params }: { params: { contestantId: string } }) {
  const player = await loadPlayer(params.contestantId);
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
      <JsonLd
        data={breadcrumbList([
          { name: 'Seasons', path: '/seasons' },
          { name: player.season.name, path: `/seasons/${player.season.slug}` },
          { name: player.name, path: `/players/${player.id}` },
        ])}
      />
      <Link href={`/seasons/${player.season.slug}`} className="text-xs text-muted">
        ← {player.season.name}
      </Link>

      <div className="mt-4 flex flex-col items-center text-center">
        <Avatar name={player.name} photoUrl={player.photoUrl} size={84} dimmed={!player.isActive} />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{player.name}</h1>
        <p className="mt-0.5 text-xs text-muted">
          {player.isActive ? 'In the house' : `Evicted · ${player.eliminatedCycle?.label ?? '—'}`}
        </p>
        <p className={`mt-2 text-4xl font-semibold tabular-nums ${pointsTone(player.totalPoints)}`}>
          {formatPoints(player.totalPoints)}
        </p>
        <p className="text-2xs uppercase tracking-wide text-muted">Season points</p>
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
      <div className="truncate text-xs font-semibold">{value}</div>
      <div className="mt-0.5 text-2xs uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}
