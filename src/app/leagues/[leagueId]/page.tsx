import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Leaderboard } from '@/components/Leaderboard';
import { getCurrentUser } from '@/lib/auth';
import { atRiskMessage, isAtRiskCode, nearMissMessage } from '@/lib/engagement';
import { relativeTime } from '@/lib/ui';
import { getCurrentCycle, getLeagueLeaderboard, getLeagueOverview, getTeamDetail } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function LeaguePage({ params }: { params: { leagueId: string } }) {
  const [user, league] = await Promise.all([getCurrentUser(), getLeagueOverview(params.leagueId)]);
  if (!league) notFound();

  const [{ rows }, currentCycle] = await Promise.all([
    getLeagueLeaderboard(league.id),
    getCurrentCycle(league.season.id),
  ]);

  const myTeam = league.teams.find((t) => t.owner.id === user?.id);
  const myTeamDetail = myTeam ? await getTeamDetail(myTeam.id) : null;
  const isCommissioner = user?.id === league.commissionerId;
  const drafting = league.draftStatus !== 'COMPLETED';
  const cycleLocked =
    currentCycle !== null &&
    (currentCycle.status !== 'UPCOMING' || Date.now() >= currentCycle.locksAt.getTime());

  const nearMiss = myTeam ? nearMissMessage(rows, myTeam.id) : null;
  const myRosterNames = new Map((myTeamDetail?.roster ?? []).map((p) => [p.contestantId, p.name]));
  const latestLines = myTeamDetail?.score?.cycles.at(-1)?.lines ?? [];
  const atRiskNames = [
    ...new Set(
      latestLines
        .filter((line) => isAtRiskCode(line.code))
        .map((line) => myRosterNames.get(line.contestantId))
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  const atRisk = atRiskMessage(atRiskNames);

  return (
    <div className="pt-2">
      <Link href="/leagues" className="text-xs text-muted">
        ← Leagues
      </Link>

      <div className="mt-2 flex items-start justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{league.name}</h1>
        {/* Commissioner powers (starting the draft, league settings) show up
            conditionally, so the role itself needs to be visible — otherwise
            the controls look arbitrary to whoever has them and missing to
            everyone else. This is what `brand-velvet` is reserved for. */}
        {isCommissioner && (
          <span className="pill shrink-0 bg-brand-velvet-soft text-2xs text-brand-velvet-deep">
            Commissioner
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted">
        {league.season.show.name} · {league.season.name} · {league.scoringRuleset.name} scoring
      </p>

      {drafting && (
        <Link
          href={`/leagues/${league.id}/draft`}
          className="mt-4 flex items-center justify-between rounded-card border border-brand-gold/30 bg-surface p-4 text-ink transition active:scale-[0.99]"
        >
          <span>
            <span className="block text-base font-semibold">
              {league.draftStatus === 'NOT_STARTED' ? 'Draft has not started' : 'Draft in progress'}
            </span>
            <span className="mt-0.5 block text-xs text-muted">
              {league.teams.length} {league.teams.length === 1 ? 'team' : 'teams'} ·{' '}
              {league.rosterSize} picks each
            </span>
          </span>
          <span className="pill bg-brand-gold text-on-gold">
            {league.draftStatus === 'NOT_STARTED' && isCommissioner ? 'Start' : 'Open'}
          </span>
        </Link>
      )}

      {currentCycle && (
        <div className="card mt-4 flex items-center justify-between p-4">
          <span>
            <span className="block text-base font-semibold">{currentCycle.label}</span>
            <span className="mt-0.5 block text-xs text-muted">
              {cycleLocked
                ? `Locked ${relativeTime(currentCycle.locksAt)}`
                : `Rosters lock ${relativeTime(currentCycle.locksAt)}`}
            </span>
          </span>
          <span
            className={`pill text-2xs ${
              cycleLocked ? 'bg-canvas text-muted' : 'bg-brand-gold-soft text-brand-gold-deep'
            }`}
          >
            {cycleLocked ? 'Locked' : 'Open'}
          </span>
        </div>
      )}

      {(nearMiss || atRisk) && (
        <div className="mt-4 space-y-2 rounded-card border border-hairline p-4">
          {nearMiss && <p className="text-xs font-medium text-brand-gold-deep">{nearMiss}</p>}
          {atRisk && <p className="text-xs font-medium text-danger-deep">{atRisk}</p>}
        </div>
      )}

      <section className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Leaderboard</h2>
          {myTeam && (
            <Link href={`/teams/${myTeam.id}`} className="text-xs text-brand-gold-deep">
              My team
            </Link>
          )}
        </div>

        <Leaderboard rows={rows} myTeamId={myTeam?.id ?? null} />
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">League</h2>
        <div className="card divide-y divide-hairline">
          <Row label="Invite code" value={league.inviteCode} />
          <Row label="Scoring" value={league.scoringRuleset.name} href="/rules" />
          <Row label="Draft" value={`${league.draftType.toLowerCase()} · ${league.rosterSize} rounds`} />
          <Row label="Visibility" value={league.isPublic ? 'Public' : 'Private'} />
        </div>
        {league.scoringRuleset.description && (
          <p className="mt-2 px-1 text-2xs leading-relaxed text-muted">
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
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-medium">{value}</span>
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
