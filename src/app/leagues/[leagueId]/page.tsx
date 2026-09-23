import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { SignInButton } from '@clerk/nextjs';
import { Avatar, AvatarStack } from '@/components/Avatar';
import { Collapsible, RowGroup } from '@/components/Collapsible';
import {
  AlertIcon,
  ArrowRightIcon,
  BoardIcon,
  CrownIcon,
  GearIcon,
  LockIcon,
  LockOpenIcon,
  TallyMark,
} from '@/components/icons';
import { InviteCode } from '@/components/InviteCode';
import { InviteFriends } from '@/components/InviteFriends';
import { Leaderboard } from '@/components/Leaderboard';
import { LeagueFeed } from '@/components/LeagueFeed';
import { MotionCard } from '@/components/motion/MotionCard';
import { Reveal, RevealGroup } from '@/components/motion/Reveal';
import { ShowTheme } from '@/components/ShowTheme';
import { Tag, rankTone } from '@/components/Tag';
import { getCurrentUser } from '@/lib/auth';
import { describeLockState } from '@/lib/cycles';
import { atRiskMessage, nearMissMessage } from '@/lib/engagement';
import { lexiconFor, lower } from '@/lib/shows/lexicon';
import { describeWebhook } from '@/lib/chat-webhook';
import { cn, formatPoints, pointsTone, relativeTime } from '@/lib/ui';
import { getInvitableFriends } from '@/server/social';
import {
  getCurrentCycle,
  getLeagueLeaderboard,
  getLeagueMessages,
  getLeagueOverview,
  getTeamAtRiskNames,
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

  const isMember = Boolean(user && league.members.some((m) => m.user.id === user.id));
  // A private league is its members'. Everyone else gets the name and a way
  // in, not the standings — the same line the API routes draw (see
  // `canViewLeague`). Before anything else is queried, so the gate is also
  // the cheapest render of this page.
  if (!league.isPublic && !isMember) {
    return <PrivateLeagueGate league={league} signedIn={Boolean(user)} />;
  }

  const myTeam = league.teams.find((t) => t.owner.id === user?.id);
  const [{ rows }, currentCycle, messages, atRiskNames, invitableFriends] = await Promise.all([
    getLeagueLeaderboard(league.id),
    getCurrentCycle(league.season.id),
    getLeagueMessages(league.id, user?.id ?? null),
    myTeam ? getTeamAtRiskNames(myTeam.id) : Promise.resolve([]),
    // Only members can invite, so only members pay for the query.
    user && isMember ? getInvitableFriends(user.id, league.id) : Promise.resolve([]),
  ]);

  const isCommissioner = user?.id === league.commissionerId;
  const drafting = league.draftStatus !== 'COMPLETED';
  // This league's deadline, not the season's — see src/lib/cycles.ts.
  const lockState = currentCycle ? describeLockState(currentCycle, league.lockOffsetMinutes) : null;
  const cycleLocked = lockState?.locked ?? false;

  const nearMiss = myTeam ? nearMissMessage(rows, myTeam.id) : null;
  const lexicon = lexiconFor(league.season.show.slug, league.season.show.lexicon);
  const atRisk = atRiskMessage(atRiskNames, lexicon);
  const openSeats = Math.max(0, league.maxTeams - league.teams.length);
  const myRow = myTeam ? (rows.find((row) => row.teamId === myTeam.id) ?? null) : null;
  const managerNames = league.members.map((m) => m.user.name ?? m.user.handle ?? '?');

  const preDraft = league.draftStatus === 'NOT_STARTED';
  // Reference material, as one folded list: who is in, the league's details
  // (with the invite code), and — before the draft — inviting friends.
  // Before the draft, while the league is still filling, the details open.
  const referenceRows = (
    <RowGroup className="mt-10">
      <Collapsible
        variant="row"
        title="Managers"
        defaultOpen={false}
        aside={`${league.members.length} · ${openSeats === 0 ? 'full' : `${openSeats} open`}`}
      >
        <ul className="divide-y divide-hairline border-t border-hairline">
          {league.members.map((member) => {
            const team = league.teams.find((t) => t.owner?.id === member.user.id);
            const isYou = member.user.id === user?.id;
            return (
              <li key={member.user.id} className="flex items-center gap-3 py-3">
                <Avatar
                  name={member.user.name ?? member.user.handle ?? '?'}
                  photoUrl={member.user.avatarUrl}
                  size={38}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">
                    {team?.name ?? 'No team yet'}
                    {isYou && (
                      <Tag tone="mint" size="sm" className="ml-2 align-[1px]">
                        You
                      </Tag>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-2xs text-muted">
                    {member.user.name ?? member.user.handle ?? 'Unknown manager'}
                  </span>
                </span>
                {member.role === 'COMMISSIONER' && (
                  <Tag tone="lavender" size="sm">
                    Commish
                  </Tag>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-2xs leading-relaxed text-muted">
          {openSeats === 0
            ? 'Every seat is taken — this league is full.'
            : `${openSeats} ${
                openSeats === 1 ? 'seat is' : 'seats are'
              } still open — tap the invite code to copy it, or show the QR code for someone to scan.`}
        </p>
      </Collapsible>
      <Collapsible
        variant="row"
        title="League details"
        defaultOpen={preDraft && openSeats > 0}
        aside={<span className="font-mono tracking-widest">{league.inviteCode}</span>}
      >
        <div className="divide-y divide-hairline border-t border-hairline">
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
          <p className="mt-2 text-2xs leading-relaxed text-muted">{league.scoringRuleset.description}</p>
        )}
      </Collapsible>
      {isMember && preDraft && (
        <InviteFriends leagueId={league.id} friends={invitableFriends} seatsLeft={openSeats} />
      )}
    </RowGroup>
  );

  return (
    <ShowTheme showSlug={league.season.show.slug}>
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
        {/* Who this league is, and the one thing to do in it. Not a panel:
            the top of the page is already where a scroll comes to rest. */}
        <div className="stage">
          <div className="flex min-h-11 items-center justify-between gap-3">
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

          <header className="mt-3">
            <ShowLine show={league.season.show.name} season={league.season.name} />
            <h1 className="headline mt-3 text-5xl sm:text-6xl">{league.name}</h1>
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
            <MotionCard tilt className="card-feature mt-8">
              <TallyMark className="absolute -bottom-5 -right-3 h-32 w-32 text-show-accent opacity-[0.12]" />
              <Link
                href={`/leagues/${league.id}/draft`}
                prefetch={false}
                className="relative flex flex-col gap-4 rounded-card p-4 sm:flex-row sm:items-center"
              >
                <span className="flex items-center justify-between gap-3 sm:contents">
                  <span className="icon-well">
                    <BoardIcon size={22} />
                  </span>
                  <Tag tone={preDraft ? 'outline' : 'show'} live={!preDraft} className="sm:hidden">
                    {preDraft ? 'Pre-draft' : 'Live'}
                  </Tag>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="headline block text-2xl">
                    {preDraft ? 'Draft not started' : 'Draft in progress'}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {league.teams.length} {league.teams.length === 1 ? 'team' : 'teams'} · {league.rosterSize}{' '}
                    picks each · {league.draftType.toLowerCase()} order
                  </span>
                </span>
                <span className="btn btn-sm shrink-0 bg-show-accent text-on-gold shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] hover:brightness-110">
                  {preDraft && isCommissioner ? 'Start the draft' : 'Open the draft room'}
                  <ArrowRightIcon size={16} />
                </span>
              </Link>
            </MotionCard>
          )}
        </div>

        {(myRow || (currentCycle && lockState) || nearMiss || atRisk) && (
          <Collapsible title="At a glance" titleClassName="eyebrow" className="mt-10">
            {/* `auto-fit` so two tiles share the row and three split it, with
              no hole when one of them is absent. */}
            <RevealGroup
              className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]"
              step={60}
            >
              {myTeam && myRow && (
                <Reveal>
                  <MotionCard tilt className="relative h-full">
                    <Link href={`/teams/${myTeam.id}`} className="flex h-full flex-col rounded-card p-4">
                      <span className="flex items-center justify-between gap-3">
                        <span className="eyebrow">My team</span>
                        <Tag tone={rankTone(myRow.rank)} size="sm">
                          {myRow.rank === 1 && <CrownIcon size={13} className="-ml-0.5" />}#{myRow.rank} of{' '}
                          {rows.length}
                        </Tag>
                      </span>
                      <span className="mt-2 block truncate text-base font-semibold">{myTeam.name}</span>
                      <span className="mt-auto flex items-end justify-between gap-3 pt-3">
                        <span className="font-display text-5xl leading-none tracking-wide">
                          {myRow.totalPoints}
                        </span>
                        <span
                          className={cn(
                            'pb-1 text-xs font-semibold tabular-nums',
                            pointsTone(myRow.lastCyclePoints),
                          )}
                        >
                          {formatPoints(myRow.lastCyclePoints)} last {lower(lexicon.cycleSingular)}
                        </span>
                      </span>
                    </Link>
                  </MotionCard>
                </Reveal>
              )}

              {currentCycle && lockState && (
                <Reveal
                  as="section"
                  aria-label={`This ${lower(lexicon.cycleSingular)}`}
                  className={cn('relative overflow-hidden p-4', cycleLocked ? 'card' : 'card-pop-gold')}
                >
                  {!cycleLocked && (
                    <TallyMark className="absolute -bottom-4 -right-2 h-24 w-24 text-pop-gold-ink opacity-[0.08]" />
                  )}
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-2xs font-bold uppercase tracking-[0.18em] text-tile-muted">
                      This {lower(lexicon.cycleSingular)}
                    </span>
                    <span className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wide">
                      {cycleLocked ? <LockIcon size={15} /> : <LockOpenIcon size={15} />}
                      {cycleLocked ? 'Locked' : 'Open'}
                    </span>
                  </span>
                  <h3 className="headline mt-2 text-2xl">{currentCycle.label}</h3>
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
                <Reveal
                  as="section"
                  aria-label="Heads up"
                  // A ruled note, not a third box: the warning reads as a line
                  // of commentary under the numbers.
                  className={cn(
                    'relative border-l-2 py-1 pl-3 sm:col-span-2 lg:col-span-1 lg:self-center',
                    atRisk ? 'border-danger' : 'border-brand-gold',
                  )}
                >
                  <span
                    className={cn(
                      'flex items-center gap-2 text-2xs font-bold uppercase tracking-[0.18em]',
                      atRisk ? 'text-danger-deep' : 'text-brand-gold-deep',
                    )}
                  >
                    <AlertIcon size={16} />
                    Heads up
                  </span>
                  <div className="mt-1.5 space-y-1.5">
                    {nearMiss && <p className="text-sm font-medium text-brand-gold-deep">{nearMiss}</p>}
                    {atRisk && <p className="text-sm font-medium text-danger-deep">{atRisk}</p>}
                  </div>
                </Reveal>
              )}
            </RevealGroup>
          </Collapsible>
        )}

        <Collapsible
          title="Standings"
          className="mt-10"
          aside={
            myTeam && (
              <Link href={`/teams/${myTeam.id}`} className="text-xs text-brand-gold-deep">
                My team →
              </Link>
            )
          }
        >
          <Leaderboard rows={rows} myTeamId={myTeam?.id ?? null} />
        </Collapsible>

        {/* Before the draft the league is still being filled, so the
            reference rows — with the invite code open — come before the
            feed; once it is under way the feed is what people come back
            for, and the rows fold away beneath it. */}
        {preDraft && referenceRows}
        <LeagueFeed
          leagueId={league.id}
          messages={messages}
          canPost={isMember}
          isCommissioner={isCommissioner}
        />
        {!preDraft && referenceRows}
      </div>
    </ShowTheme>
  );
}
/**
 * What a non-member sees of a private league: enough to know they have the
 * right link, and the one thing they can do about it. The invite code is the
 * credential, so the way in is the join form, never a request button here.
 */
function PrivateLeagueGate({
  league,
  signedIn,
}: {
  league: { name: string; season: { name: string; show: { name: string; slug: string } } };
  signedIn: boolean;
}) {
  return (
    <ShowTheme showSlug={league.season.show.slug}>
      <div className="stage pt-2">
        <Link href="/leagues" className="text-xs text-muted">
          ← Leagues
        </Link>
        <header className="mt-5">
          <ShowLine show={league.season.show.name} season={league.season.name} />
          <h1 className="headline mt-3 text-5xl sm:text-6xl">{league.name}</h1>
        </header>

        <section className="card-feature mt-8 p-4" aria-labelledby="private-heading">
          <span className="flex items-center justify-between gap-3">
            <span className="icon-well">
              <LockIcon size={22} />
            </span>
            <Tag tone="outline">Private</Tag>
          </span>
          <h2 id="private-heading" className="headline mt-4 text-2xl">
            This league is members only
          </h2>
          <p className="mt-2 max-w-measure text-sm leading-relaxed text-muted">
            {signedIn
              ? 'Standings, rosters and the feed are visible to the people in it. If you were invited, join with the invite code and this page opens up.'
              : 'Standings, rosters and the feed are visible to the people in it. Sign in if you are already a member, or join with the invite code you were sent.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {!signedIn && (
              <SignInButton mode="modal">
                <button type="button" className="btn-primary">
                  Sign in
                </button>
              </SignInButton>
            )}
            <Link href="/leagues/join" prefetch={false} className={signedIn ? 'btn-primary' : 'btn-ghost'}>
              Join with a code
            </Link>
          </div>
        </section>
      </div>
    </ShowTheme>
  );
}

/**
 * The line above a league's name: which show, in the show's colour, and
 * which season, in words.
 */
function ShowLine({ show, season }: { show: string; season: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Tag tone="show" size="lg">
        {show}
      </Tag>
      <span className="text-xs font-medium text-muted">{season}</span>
    </p>
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
    <Link href={href} className="row-link flex items-center justify-between py-3">
      {content}
    </Link>
  ) : (
    <div className="flex items-center justify-between py-3">{content}</div>
  );
}
