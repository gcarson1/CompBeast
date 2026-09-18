import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { getCurrentUser } from '@/lib/auth';
import { formatPoints, pointsTone, relativeTime } from '@/lib/ui';
import { getCurrentCycle, getLeagueLeaderboard, getLeagueOverview } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function LeaguePage({ params }: { params: { leagueId: string } }) {
  const [user, league] = await Promise.all([getCurrentUser(), getLeagueOverview(params.leagueId)]);
  if (!league) notFound();

  const [{ rows }, currentCycle] = await Promise.all([
    getLeagueLeaderboard(league.id),
    getCurrentCycle(league.season.id),
  ]);

  const myTeam = league.teams.find((t) => t.owner.id === user?.id);
  const isCommissioner = user?.id === league.commissionerId;
  const drafting = league.draftStatus !== 'COMPLETED';
  const cycleLocked =
    currentCycle !== null &&
    (currentCycle.status !== 'UPCOMING' || Date.now() >= currentCycle.locksAt.getTime());

  return (
    <div className="pt-2">
      <Link href="/leagues" className="text-[13px] text-muted">
        ← Leagues
      </Link>

      <h1 className="mt-2 text-[26px] font-semibold tracking-tight">{league.name}</h1>
      <p className="mt-0.5 text-[13px] text-muted">
        {league.season.show.name} · {league.season.name} · {league.scoringRuleset.name} scoring
      </p>

      {drafting && (
        <Link
          href={`/leagues/${league.id}/draft`}
          className="mt-4 flex items-center justify-between rounded-card bg-ink p-4 text-white transition active:scale-[0.99]"
        >
          <span>
            <span className="block text-[15px] font-semibold">
              {league.draftStatus === 'NOT_STARTED' ? 'Draft has not started' : 'Draft in progress'}
            </span>
            <span className="mt-0.5 block text-[13px] text-white/60">
              {league.teams.length} {league.teams.length === 1 ? 'team' : 'teams'} ·{' '}
              {league.rosterSize} picks each
            </span>
          </span>
          <span className="pill bg-lime text-ink">
            {league.draftStatus === 'NOT_STARTED' && isCommissioner ? 'Start' : 'Open'}
          </span>
        </Link>
      )}

      {currentCycle && (
        <div className="card mt-4 flex items-center justify-between p-4">
          <span>
            <span className="block text-[15px] font-semibold">{currentCycle.label}</span>
            <span className="mt-0.5 block text-[13px] text-muted">
              {cycleLocked
                ? `Locked ${relativeTime(currentCycle.locksAt)}`
                : `Rosters lock ${relativeTime(currentCycle.locksAt)}`}
            </span>
          </span>
          <span
            className={`pill text-[12px] ${
              cycleLocked ? 'bg-canvas text-muted' : 'bg-lime-soft text-lime-deep'
            }`}
          >
            {cycleLocked ? 'Locked' : 'Open'}
          </span>
        </div>
      )}

      <section className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-[17px] font-semibold">Leaderboard</h2>
          {myTeam && (
            <Link href={`/teams/${myTeam.id}`} className="text-[13px] text-lime-deep">
              My team
            </Link>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="card p-4 text-[13px] text-muted">
            No teams yet. Share the invite code to get your league going.
          </p>
        ) : (
          <ul className="card divide-y divide-hairline overflow-hidden">
            {rows.map((row) => {
              const isMine = row.teamId === myTeam?.id;
              return (
                <li key={row.teamId}>
                  <Link
                    href={`/teams/${row.teamId}`}
                    className={`flex items-center gap-3 p-4 transition ${isMine ? 'bg-lime-soft/40' : ''}`}
                  >
                    <span className="w-6 text-[15px] font-semibold tabular-nums text-muted">
                      {row.rank}
                    </span>
                    <Avatar name={row.ownerName ?? row.teamName} size={38} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">
                        {row.teamName}
                        {isMine && <span className="ml-1.5 text-[11px] text-lime-deep">you</span>}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-muted">
                        {row.ownerName} · {row.activeCount}/{row.rosterCount} still in
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[17px] font-semibold tabular-nums">
                        {row.totalPoints}
                      </span>
                      <span className={`block text-[12px] tabular-nums ${pointsTone(row.lastCyclePoints)}`}>
                        {formatPoints(row.lastCyclePoints)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-[17px] font-semibold">League</h2>
        <div className="card divide-y divide-hairline">
          <Row label="Invite code" value={league.inviteCode} />
          <Row label="Scoring" value={league.scoringRuleset.name} href="/rules" />
          <Row label="Draft" value={`${league.draftType.toLowerCase()} · ${league.rosterSize} rounds`} />
          <Row label="Visibility" value={league.isPublic ? 'Public' : 'Private'} />
        </div>
        {league.scoringRuleset.description && (
          <p className="mt-2 px-1 text-[12px] leading-relaxed text-muted">
            {league.scoringRuleset.description}
          </p>
        )}
      </section>
    </div>
  );
}

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <>
      <span className="text-[14px] text-muted">{label}</span>
      <span className="text-[14px] font-medium">{value}</span>
    </>
  );
  return href ? (
    <Link href={href} className="flex items-center justify-between p-4">
      {content}
    </Link>
  ) : (
    <div className="flex items-center justify-between p-4">{content}</div>
  );
}
