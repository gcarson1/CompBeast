import Link from 'next/link';
import { Avatar } from '@/components/Avatar';
import { prisma } from '@/lib/db';
import { formatPoints, pointsTone } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export default async function PlayersPage() {
  const season = await prisma.season.findFirst({ orderBy: { year: 'desc' } });
  if (!season) {
    return <p className="card mt-6 p-4 text-[13px] text-muted">No seasons loaded yet.</p>;
  }

  const contestants = await prisma.contestant.findMany({
    where: { seasonId: season.id },
    select: {
      id: true,
      name: true,
      isActive: true,
      metadata: true,
      eliminatedCycle: { select: { label: true } },
      scoredEvents: { where: { isVoided: false }, select: { pointsAwarded: true } },
    },
  });

  const ranked = contestants
    .map((c) => ({
      ...c,
      points: c.scoredEvents.reduce((sum, e) => sum + Number(e.pointsAwarded), 0),
    }))
    .sort((a, b) => b.points - a.points);

  return (
    <div className="pt-2">
      <h1 className="text-[28px] font-semibold tracking-tight">Players</h1>
      <p className="mb-4 text-[13px] text-muted">{season.name} · {ranked.length} houseguests</p>

      <ul className="card divide-y divide-hairline">
        {ranked.map((player, index) => {
          const meta = player.metadata as { occupation?: string; hometown?: string } | null;
          return (
            <li key={player.id}>
              <Link href={`/players/${player.id}`} className="flex items-center gap-3 p-4">
                <span className="w-5 text-[13px] font-medium tabular-nums text-muted">{index + 1}</span>
                <Avatar name={player.name} size={42} dimmed={!player.isActive} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{player.name}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-muted">
                    {player.isActive
                      ? (meta?.occupation ?? 'Houseguest')
                      : `Evicted · ${player.eliminatedCycle?.label ?? '—'}`}
                  </span>
                </span>
                <span className={`text-[16px] font-semibold tabular-nums ${pointsTone(player.points)}`}>
                  {formatPoints(player.points)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
