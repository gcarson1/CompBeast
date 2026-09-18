import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { formatPoints, pointsTone } from '@/lib/ui';
import { getSeasonScoreboard } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function SeasonPage({ params }: { params: { slug: string } }) {
  const data = await getSeasonScoreboard(params.slug);
  if (!data) notFound();

  const { season, rulesetName, players } = data;
  const isArchived = season.status === 'COMPLETED';

  return (
    <div className="pt-2">
      <Link href="/seasons" className="text-[13px] text-muted">
        ← Seasons
      </Link>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-semibold tracking-tight">{season.name}</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {season.showName} · {season.year} · scored with {rulesetName} rules
          </p>
        </div>
        {isArchived && <span className="pill shrink-0 bg-canvas text-[11px] text-muted">Finished</span>}
      </div>

      {isArchived ? (
        <p className="mt-4 rounded-card border border-hairline bg-surface/60 p-3 text-[12px] leading-relaxed text-muted">
          This season has wrapped, so it is view-only. Leagues can only be created for seasons that
          are still airing or yet to start.
        </p>
      ) : (
        <Link
          href="/leagues/new"
          className="mt-4 flex items-center justify-between rounded-card border border-brand-gold/30 bg-surface p-4 text-ink transition active:scale-[0.99]"
        >
          <span>
            <span className="block text-[15px] font-semibold">Start a league</span>
            <span className="mt-0.5 block text-[13px] text-muted">This season is still in play</span>
          </span>
          <span className="pill bg-brand-gold text-ink">Create</span>
        </Link>
      )}

      <section className="mt-6">
        <h2 className="text-[17px] font-semibold">Player scores</h2>
        <p className="mb-2 text-[12px] text-muted">
          Ranked by fantasy points, which is not the same as how they placed on the show.
        </p>

        {players.length === 0 ? (
          <p className="card p-4 text-[13px] text-muted">No players loaded for this season yet.</p>
        ) : (
          <ul className="card divide-y divide-hairline">
            {players.map((player, index) => (
              <li key={player.contestantId}>
                <Link href={`/players/${player.contestantId}`} className="flex items-center gap-3 p-4">
                  <span className="w-6 shrink-0 text-center text-[13px] font-semibold tabular-nums text-muted">
                    {index + 1}
                  </span>
                  <Avatar
                    name={player.name}
                    photoUrl={player.photoUrl}
                    size={42}
                    dimmed={isArchived ? false : !player.isActive}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{player.name}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted">
                      {describe(player, isArchived)}
                    </span>
                  </span>
                  <span className={`text-[16px] font-semibold tabular-nums ${pointsTone(player.points)}`}>
                    {formatPoints(player.points)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function describe(
  player: { isActive: boolean; eliminatedLabel: string | null; metadata: unknown },
  isArchived: boolean,
): string {
  const meta = player.metadata as { occupation?: string; sourcePlace?: string } | null;

  if (isArchived) {
    return meta?.sourcePlace ?? (player.eliminatedLabel ? `Out · ${player.eliminatedLabel}` : 'Houseguest');
  }
  if (player.isActive) return meta?.occupation ?? 'In the house';
  return `Evicted · ${player.eliminatedLabel ?? '—'}`;
}
