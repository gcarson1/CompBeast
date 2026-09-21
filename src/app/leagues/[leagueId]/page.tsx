import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Avatar, AvatarStack } from '@/components/Avatar';
import { BeastDoodle } from '@/components/doodles/BeastDoodle';
import { Doodle } from '@/components/doodles/Doodle';
import { InviteCode } from '@/components/InviteCode';
import { InviteFriends } from '@/components/InviteFriends';
import { Leaderboard } from '@/components/Leaderboard';
import { LeagueFeed } from '@/components/LeagueFeed';
import { MotionCard } from '@/components/motion/MotionCard';
import { Reveal, RevealGroup } from '@/components/motion/Reveal';
import { Sticker } from '@/components/Sticker';
import { getCurrentUser } from '@/lib/auth';
import { describeLockState } from '@/lib/cycles';
import { atRiskMessage, isAtRiskCode, nearMissMessage } from '@/lib/engagement';
import { describeWebhook } from '@/lib/chat-webhook';
import { cn, formatPoints, relativeTime } from '@/lib/ui';
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
  const myRow = myTeam ? rows.find((row) => row.teamId === myTeam.id) ?? null : null;
  const managerNames = league.members.map((m) => m.user.name ?? m.user.handle ?? '?');

  return (
    <div className="pt-2">
      {/*
        The page in reading order, each level a step quieter than the last:
        the header (a header — the one thing on the page that is not a
        tile), the draft as a full-width action while there is one, the
        colour tiles that answer "how am I doing this week", the standings
        as the one primary section, then the two reference lists as quiet
        secondary sections. The first pass laid all of these out as equal
        panes in one grid, and the league's own name was just another box.
      */}
      <div className="flex items-center justify-between gap-3">
        <Link href="/leagues" className="text-xs text-muted">
          ← Leagues
        </Link>
        {/* Settings are the commissioner's alone (the mutation refuses anyone
            else), so the control only renders for them. It is a plain icon
            button, not a badge: a pill is the shape this app reserves for
            things you cannot tap. The role itself is still shown where it
            belongs, on the commissioner's row in the managers list. 44px
            square: WCAG 2.5.8's target size for a standalone control. */}
        {isCommissioner && (
          <Link
            href={`/leagues/${league.id}/settings`}
            prefetch={false}
            aria-label="League settings"
            title="League settings"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-btn border border-hairline bg-surface text-muted transition duration-200 ease-spring hover:bg-surface-raised hover:text-ink motion-safe:hover:scale-105 motion-safe:active:scale-95"
          >
            <GearIcon />
          </Link>
        )}
      </div>

      <header className="relative mt-4 pr-20 sm:pr-32">
        {/* The Beast, at the header's shoulder. Shocked while the draft is
            still open, grinning once the season is under way. */}
        <BeastDoodle
          mood={drafting ? 'shock' : 'grin'}
          className="absolute -right-2 -top-3 h-20 w-20 rotate-6 sm:-right-3 sm:-top-5 sm:h-28 sm:w-28"
        />
        <Sticker tone="lavender" size="lg" tilt="l">
          {league.season.show.name} · {league.season.name}
        </Sticker>
        <h1 className="headline mt-4 text-5xl sm:text-6xl">{league.name}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
          <AvatarStack names={managerNames.slice(0, 4)} total={league.members.length} max={4} />
          <span>
            {league.teams.length} of {league.maxTeams} seats filled
          </span>
          <span>{league.scoringRuleset.name} scoring</span>
        </div>
      </header>

      {drafting && (
        // The one thing to do while the draft is open, so it gets the full
        // width and a button-shaped call to action inside the tile.
        <MotionCard tilt className="card-pop-lavender relative mt-8">
          <Sticker tone="gold" tilt="r" className="absolute -right-2 -top-3">
            Draft
          </Sticker>
          <Link
            href={`/leagues/${league.id}/draft`}
            prefetch={false}
            className="flex flex-col gap-4 rounded-card p-5 sm:flex-row sm:items-center"
          >
            <span className="clay clay-gold h-12 w-12">
              <BoardIcon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="headline block text-2xl">
                {league.draftStatus === 'NOT_STARTED' ? 'Draft not started' : 'Draft in progress'}
              </span>
              <span className="mt-1 block text-xs text-tile-muted">
                {league.teams.length} {league.teams.length === 1 ? 'team' : 'teams'} ·{' '}
                {league.rosterSize} picks each · {league.draftType.toLowerCase()} order
              </span>
            </span>
            <span className="btn btn-sm shrink-0 bg-pop-lavender-ink text-pop-lavender">
              {league.draftStatus === 'NOT_STARTED' && isCommissioner ? 'Start the draft' : 'Open the draft room'} →
            </span>
          </Link>
        </MotionCard>
      )}

      {(myRow || (currentCycle && lockState) || nearMiss || atRisk) && (
        <section className="mt-8" aria-labelledby="glance-heading">
          <h2 id="glance-heading" className="eyebrow">
            At a glance
          </h2>
          {/* `auto-fit` so two tiles share the row and three split it, with
              no hole when one of them is absent. */}
          <RevealGroup className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]" step={60}>
            {myTeam && myRow && (
              <Reveal>
                <MotionCard tilt className="card-pop-mint relative h-full">
                  <Link href={`/teams/${myTeam.id}`} className="flex h-full flex-col rounded-card p-5">
                    <span className="text-2xs font-bold uppercase tracking-wide text-tile-muted">My team</span>
                    <span className="mt-1 block truncate text-base font-semibold">{myTeam.name}</span>
                    <span className="mt-3 block font-display text-6xl leading-none tracking-wide">
                      {myRow.totalPoints}
                    </span>
                    <span className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                      <Sticker tone={myRow.rank === 1 ? 'gold' : 'paper'} size="sm">
                        {myRow.rank === 1 && <Doodle kind="crown" className="-ml-0.5 h-4 w-4" />}#{myRow.rank} of{' '}
                        {rows.length}
                      </Sticker>
                      {/* The sign carries the meaning — colour on a mint block
                          would not clear contrast for either tone. */}
                      <span className="text-2xs font-semibold tabular-nums text-tile-muted">
                        {formatPoints(myRow.lastCyclePoints)} last
                      </span>
                    </span>
                  </Link>
                </MotionCard>
              </Reveal>
            )}

            {currentCycle && lockState && (
              <Reveal
                as="section"
                aria-label="This week"
                className={cn('relative p-5', cycleLocked ? 'card' : 'card-pop-gold')}
              >
                <Sticker tone={cycleLocked ? 'ink' : 'paper'} tilt="r" className="absolute -right-2 -top-3">
                  {cycleLocked ? 'Locked' : 'Open'}
                </Sticker>
                <Doodle
                  kind={cycleLocked ? 'lock' : 'lock-open'}
                  tone={cycleLocked ? 'sky' : 'paper'}
                  className="h-8 w-8 -rotate-6"
                />
                <p className="mt-3 text-2xs font-bold uppercase tracking-wide text-tile-muted">This week</p>
                <h3 className="headline mt-1 text-2xl">{currentCycle.label}</h3>
                <p className="mt-2 text-xs text-tile-muted">
                  {!lockState.showLockAt
                    ? 'Rosters are closed'
                    : cycleLocked
                      ? `Locked ${relativeTime(lockState.lockAt)}`
                      : `Rosters lock ${relativeTime(lockState.lockAt)}`}
                </p>
              </Reveal>
            )}

            {(nearMiss || atRisk) && (
              <Reveal as="section" aria-label="Heads up" className="card relative p-5 sm:col-span-2 lg:col-span-1">
                {/* Inset from the left edge: a tile to its left may carry its
                    own tag on that corner, and two overhanging tags collide. */}
                <Sticker tone={atRisk ? 'red' : 'gold'} tilt="l" className="absolute left-4 -top-3">
                  Heads up
                </Sticker>
                <Doodle kind="alert" tone={atRisk ? 'red' : 'gold'} className="absolute -right-2 -top-3 h-9 w-9 rotate-6" />
                <div className="mt-2 space-y-2">
                  {nearMiss && <p className="text-sm font-medium text-brand-gold-deep">{nearMiss}</p>}
                  {atRisk && <p className="text-sm font-medium text-danger-deep">{atRisk}</p>}
                </div>
              </Reveal>
            )}
          </RevealGroup>
        </section>
      )}

      <Reveal as="section" className="mt-10" aria-labelledby="standings-heading">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 id="standings-heading" className="section-title">
            Standings
          </h2>
          {myTeam && (
            <Link href={`/teams/${myTeam.id}`} className="text-xs text-brand-gold-deep">
              My team →
            </Link>
          )}
        </div>
        <Leaderboard rows={rows} myTeamId={myTeam?.id ?? null} />
      </Reveal>

      {/* Two short reference lists, paired once there is room. Eyebrow
          headings: these are things to look up, not things to look at. */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6">
        <Reveal as="section" className="mt-10" aria-labelledby="managers-heading">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="managers-heading" className="eyebrow">
              Managers <span className="ml-1 tracking-normal text-ink">{league.members.length}</span>
            </h2>
            <span className="text-2xs text-muted">
              {openSeats === 0 ? 'Full' : `${openSeats} ${openSeats === 1 ? 'seat' : 'seats'} open`}
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
                    <Sticker tone="lavender" size="sm" className="shrink-0">
                      Commish
                    </Sticker>
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
                } still open — tap the invite code to copy it, or show the QR code for someone to scan.`}
          </p>
        </Reveal>

        <Reveal as="section" className="mt-10" aria-labelledby="league-heading">
          <h2 id="league-heading" className="eyebrow mb-3">
            League
          </h2>
          <div className="card divide-y divide-hairline">
            <InviteCode code={league.inviteCode} leagueName={league.name} />
            <Row label="Scoring" value={league.scoringRuleset.name} href="/rules" />
            <Row label="Draft" value={`${league.draftType.toLowerCase()} · ${league.rosterSize} rounds`} />
            <Row label="Visibility" value={league.isPublic ? 'Public' : 'Private'} />
            {/* The service name only, never the URL: the URL is the credential. */}
            {describeWebhook(league.chatWebhookUrl) && (
              <Row label="Chat" value={`${describeWebhook(league.chatWebhookUrl)} connected`} />
            )}
          </div>
          {league.scoringRuleset.description && (
            <p className="mt-2 px-1 text-2xs leading-relaxed text-muted">
              {league.scoringRuleset.description}
            </p>
          )}
        </Reveal>
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

function BoardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M8.5 9.5V20M15.5 9.5V20" strokeLinecap="round" />
      <path d="M5.5 13h1M11 13h2M18 13h1M5.5 16.5h1M11 16.5h2" strokeLinecap="round" />
    </svg>
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
