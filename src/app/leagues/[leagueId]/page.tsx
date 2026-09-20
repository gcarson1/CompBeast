import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Avatar } from '@/components/Avatar';
import { InviteCode } from '@/components/InviteCode';
import { InviteFriends } from '@/components/InviteFriends';
import { Leaderboard } from '@/components/Leaderboard';
import { LeagueFeed } from '@/components/LeagueFeed';
import { getCurrentUser } from '@/lib/auth';
import { describeLockState } from '@/lib/cycles';
import { atRiskMessage, isAtRiskCode, nearMissMessage } from '@/lib/engagement';
import { relativeTime } from '@/lib/ui';
import { getInvitableFriends } from '@/server/social';
import {
  getCurrentCycle,
  getLeagueLeaderboard,
  getLeagueMessages,
  getLeagueOverview,
  getTeamDetail,
} from '@/server/queries';

export const dynamic = 'force-dynamic';

// One overview query per request, shared with `generateMetadata` through
// React's per-request cache.
const loadLeague = cache((leagueId: string) => getLeagueOverview(leagueId));

/**
 * The title is for the tab; `noindex` is for the one league page a crawler
 * might reach by link despite robots.ts, since anyone with the id can view
 * it. Note what this does *not* do: this route streams its shell from
 * loading.tsx before the page runs, so an unknown id still answers 200 —
 * Next marks that not-found render `noindex` itself, and robots.ts keeps the
 * route out of the crawl, which is why it is tolerated here and not on the
 * public pages (see PageSkeleton.tsx).
 */
export async function generateMetadata({ params }: { params: { leagueId: string } }): Promise<Metadata> {
  const league = await loadLeague(params.leagueId);
  if (!league) notFound();
  return { title: league.name, robots: { index: false, follow: false } };
}

export default async function LeaguePage({ params }: { params: { leagueId: string } }) {
  const [user, league] = await Promise.all([getCurrentUser(), loadLeague(params.leagueId)]);
  if (!league) notFound();

  const [{ rows }, currentCycle, messages] = await Promise.all([
    getLeagueLeaderboard(league.id),
    getCurrentCycle(league.season.id),
    getLeagueMessages(league.id, user?.id ?? null),
  ]);

  const isMember = Boolean(user && league.members.some((m) => m.user.id === user.id));
  // Only members can invite, so only members pay for the query.
  const invitableFriends = user && isMember ? await getInvitableFriends(user.id, league.id) : [];

  const myTeam = league.teams.find((t) => t.owner.id === user?.id);
  const myTeamDetail = myTeam ? await getTeamDetail(myTeam.id) : null;
  const isCommissioner = user?.id === league.commissionerId;
  const drafting = league.draftStatus !== 'COMPLETED';
  // This league's deadline, not the season's — see src/lib/cycles.ts.
  const lockState = currentCycle
    ? describeLockState(currentCycle, league.lockOffsetMinutes)
    : null;
  const cycleLocked = lockState?.locked ?? false;

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
  const openSeats = Math.max(0, league.maxTeams - league.teams.length);

  return (
    <div className="pt-2">
      <Link href="/leagues" className="text-xs text-muted">
        ← Leagues
      </Link>

      <div className="mt-2 flex items-start justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{league.name}</h1>
        {/* Settings are the commissioner's alone (the mutation refuses anyone
            else), so the control only renders for them. It is a plain icon
            button, not a badge: the previous "Commissioner" pill announced a
            role where a control was expected, and a pill is the shape this
            app reserves for things you cannot tap. The role itself is still
            shown where it belongs, on the commissioner's row in the managers
            list. 44px square: WCAG 2.5.8's target size for a standalone
            control, the same floor as `.btn`. */}
        {isCommissioner && (
          <Link
            href={`/leagues/${league.id}/settings`}
            prefetch={false}
            aria-label="League settings"
            title="League settings"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-btn border border-hairline bg-surface text-muted transition hover:bg-surface-raised hover:text-ink active:scale-[0.97]"
          >
            <GearIcon />
          </Link>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted">
        {league.season.show.name} · {league.season.name} · {league.scoringRuleset.name} scoring
      </p>

      {drafting && (
        <Link
          href={`/leagues/${league.id}/draft`}
          prefetch={false}
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

      {currentCycle && lockState && (
        <div className="card mt-4 flex items-center justify-between p-4">
          <span>
            <span className="block text-base font-semibold">{currentCycle.label}</span>
            <span className="mt-0.5 block text-xs text-muted">
              {!lockState.showLockAt
                ? 'Rosters are closed'
                : cycleLocked
                  ? `Locked ${relativeTime(lockState.lockAt)}`
                  : `Rosters lock ${relativeTime(lockState.lockAt)}`}
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

      {/* Managers and the league's settings are both short reference lists, so
          they pair off once there is room rather than each taking a full
          screen-width row on a desktop. */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6">
      <section className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">
            Managers <span className="text-sm font-normal text-muted">{league.members.length}</span>
          </h2>
          <span className="text-2xs text-muted">
            {league.teams.length} of {league.maxTeams} seats filled
          </span>
        </div>
        <ul className="card divide-y divide-hairline">
          {league.members.map((member) => {
            const team = league.teams.find((t) => t.owner?.id === member.user.id);
            const isYou = member.user.id === user?.id;
            return (
              <li key={member.user.id} className="flex items-center gap-3 p-4">
                <Avatar name={member.user.name ?? member.user.handle ?? '?'} photoUrl={member.user.avatarUrl} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">
                    {team?.name ?? 'No team yet'}
                    {isYou && <span className="ml-1.5 text-2xs text-brand-gold-deep">you</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-2xs text-muted">
                    {member.user.name ?? member.user.handle ?? 'Unknown manager'}
                  </span>
                </span>
                {member.role === 'COMMISSIONER' && (
                  <span className="pill shrink-0 bg-brand-velvet-soft text-2xs text-brand-velvet-deep">
                    Commish
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 px-1 text-2xs leading-relaxed text-muted">
          {openSeats === 0
            ? 'Every seat is taken — this league is full.'
            : `${openSeats} ${
                openSeats === 1 ? 'seat is' : 'seats are'
              } still open — tap the invite code below to copy it, or show the QR code for someone to scan.`}
        </p>
      </section>

        <section className="mt-6">
          <h2 className="mb-2 text-lg font-semibold">League</h2>
          <div className="card divide-y divide-hairline">
            <InviteCode code={league.inviteCode} leagueName={league.name} />
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

      {isMember && league.draftStatus === 'NOT_STARTED' && (
        <InviteFriends
          leagueId={league.id}
          friends={invitableFriends}
          seatsLeft={openSeats}
        />
      )}

      {/* Full width on purpose: the feed is the part people come back to, and
          it reads badly squeezed into a half column next to a settings list. */}
      <LeagueFeed
        leagueId={league.id}
        messages={messages}
        canPost={isMember}
        isCommissioner={isCommissioner}
      />
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7 5.3 5.3" strokeLinecap="round" />
    </svg>
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
