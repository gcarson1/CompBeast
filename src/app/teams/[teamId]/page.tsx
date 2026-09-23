import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { Avatar } from '@/components/Avatar';
import { Collapsible } from '@/components/Collapsible';
import { CrownIcon } from '@/components/icons';
import { StatStrip } from '@/components/StatStrip';
import { ShowTheme } from '@/components/ShowTheme';
import { Tag, rankTone } from '@/components/Tag';
import { getCurrentUser } from '@/lib/auth';
import { isTraitor } from '@/lib/shows/affiliation';
import { eliminationLabel, lower } from '@/lib/shows/lexicon';
import { formatPoints, pointsTone } from '@/lib/ui';
import { canViewLeague, getTeamDetail } from '@/server/queries';

export const dynamic = 'force-dynamic';

// Shared with `generateMetadata` via React's per-request cache. As on the
// league page, the metadata sets the tab title and `noindex`; an unknown id
// under this route's loading boundary still answers 200, tolerated for the
// same reasons given there.
const loadTeam = cache((teamId: string) => getTeamDetail(teamId));

export async function generateMetadata({ params }: { params: { teamId: string } }): Promise<Metadata> {
  const detail = await loadTeam(params.teamId);
  if (!detail) notFound();
  return { title: detail.team.name, robots: { index: false, follow: false } };
}

export default async function TeamPage({ params }: { params: { teamId: string } }) {
  const [detail, user] = await Promise.all([loadTeam(params.teamId), getCurrentUser()]);
  if (!detail) notFound();

  const { team, score, roster, showSlug, showLexicon: lexicon } = detail;
  // A private league's rosters are its members'. The league page explains
  // why and offers the way in, so send them there rather than 404-ing a
  // link a friend sent them.
  if (!(await canViewLeague(team.leagueId, user?.id ?? null))) redirect(`/leagues/${team.leagueId}`);

  const rank = score?.rank ?? 0;
  const stillIn = roster.filter((player) => player.isActive).length;

  return (
    <ShowTheme showSlug={showSlug}>
      <div className="pt-2">
        {/* Screen 1: whose team, and how it is doing. Starts at the top of the
            page so the back link is inside it — see the account page. */}
        <div className="stage">
          <Link href={`/leagues/${team.leagueId}`} className="text-xs text-muted">
            ← League
          </Link>

          <header className="mt-4 flex items-center gap-4">
            <span className="relative shrink-0">
              <Avatar name={team.ownerName ?? team.name} size={64} />
              {/* The leader's crown, on a gold coin at the avatar's shoulder.
                  Decoration: "#1" is written right beside it. */}
              {rank === 1 && (
                <span
                  aria-hidden
                  className="absolute -right-1.5 -top-1.5 grid h-7 w-7 place-items-center rounded-full bg-gradient-to-b from-brand-gold-deep to-brand-gold text-on-gold shadow-[0_0_0_3px_theme(colors.canvas),0_6px_14px_-4px_rgba(245,158,11,0.7)]"
                >
                  <CrownIcon size={15} />
                </span>
              )}
            </span>
            <div className="min-w-0">
              <h1 className="headline truncate text-4xl">{team.name}</h1>
              <p className="mt-2 flex min-w-0 items-center gap-2 text-xs text-muted">
                {rank > 0 && (
                  <Tag tone={rankTone(rank)} size="sm">
                    #{rank}
                  </Tag>
                )}
                <span className="truncate">{team.ownerName ?? 'Unclaimed'}</span>
              </p>
            </div>
          </header>

          <StatStrip
            className="mt-6"
            items={[
              { label: 'Total', value: `${score?.totalPoints ?? 0}` },
              { label: 'Rank', value: rank ? `#${rank}` : '—' },
              {
                label: `Last ${lower(lexicon.cycleSingular)}`,
                value: formatPoints(score?.lastCyclePoints ?? 0),
                tone: pointsTone(score?.lastCyclePoints ?? 0),
              },
            ]}
          />
        </div>

        <div>
          <Collapsible
            title="Roster"
            className="mt-10"
            aside={roster.length > 0 ? `${stillIn}/${roster.length} still in` : undefined}
          >
            {roster.length === 0 ? (
              // Before the draft a team is a name and a seat. An empty list here
              // read as a rendering fault; the draft room is the way to fill it.
              <div className="list-empty">
                <p className="max-w-measure text-xs leading-relaxed text-muted">
                  No {lower(lexicon.contestantPlural)} yet — this team fills in as the draft is made.
                </p>
                <Link
                  href={`/leagues/${team.leagueId}/draft`}
                  prefetch={false}
                  className="btn-ghost btn-sm mt-3"
                >
                  Open the draft room
                </Link>
              </div>
            ) : (
              <ul className="list">
                {roster.map((player) => (
                  <li key={player.contestantId}>
                    <Link
                      href={`/players/${player.contestantId}`}
                      className="row-link flex items-center gap-3 py-3"
                    >
                      <Avatar
                        name={player.name}
                        photoUrl={player.photoUrl}
                        size={42}
                        dimmed={!player.isActive}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-base font-semibold">{player.name}</span>
                          {isTraitor(player.metadata) && (
                            <Tag tone="red" size="sm">
                              Traitor
                            </Tag>
                          )}
                        </span>
                        <span className="mt-0.5 block text-2xs text-muted">
                          {player.isActive
                            ? lexicon.activeLabel
                            : `${eliminationLabel(lexicon, player.metadata)} · ${player.eliminatedLabel ?? '—'}`}
                        </span>
                      </span>
                      <span className={`text-md font-semibold tabular-nums ${pointsTone(player.points)}`}>
                        {formatPoints(player.points)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Collapsible>

          {score && score.cycles.length > 0 && (
            <Collapsible title="Week by week" className="mt-10">
              <div className="list">
                {/*
              Newest week first. Copied before reversing because `reverse()`
              mutates, and this same array is read elsewhere with `.at(-1)` to
              mean "the latest cycle" — reversing it in place would quietly
              turn the at-risk banner into an at-risk-three-weeks-ago banner.
              That is also why this is not done in the query.
            */}
                {[...score.cycles].reverse().map((cycle) => (
                  <details key={cycle.cycleId} className="disclosure group">
                    <summary className="row-link flex cursor-pointer list-none items-center justify-between py-3.5 text-muted hover:text-ink">
                      <span className="text-base font-medium text-ink">{cycle.label}</span>
                      <span className="flex items-center gap-2">
                        <span className={`text-base font-semibold tabular-nums ${pointsTone(cycle.points)}`}>
                          {formatPoints(cycle.points)}
                        </span>
                        <ChevronIcon />
                      </span>
                    </summary>
                    <ul className="mb-3.5 space-y-1.5 border-l-2 border-show-accent/50 pl-3">
                      {/* Lines arrive oldest-first by occurredAt; the last thing
                      that happened belongs at the top of the week too. */}
                      {[...cycle.lines].reverse().map((line) => (
                        <li key={line.scoredEventId} className="flex items-center justify-between gap-3">
                          <span className="min-w-0 flex-1 truncate text-xs text-muted">{line.label}</span>
                          <span className={`text-xs font-medium tabular-nums ${pointsTone(line.points)}`}>
                            {formatPoints(line.points)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </Collapsible>
          )}
        </div>
      </div>
    </ShowTheme>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className="transition group-open:rotate-180"
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
