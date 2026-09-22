import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { BadgeShelf, Medal } from '@/components/BadgeShelf';
import { Collapsible, RowGroup } from '@/components/Collapsible';
import { DeleteAccountPanel } from '@/components/DeleteAccountPanel';
import { EmailPreferences } from '@/components/EmailPreferences';
import { FriendsPanel } from '@/components/FriendsPanel';
import { PointHistoryChart } from '@/components/PointHistoryChart';
import { CrownIcon, TallyMark } from '@/components/icons';
import { RevealGroup } from '@/components/motion/Reveal';
import { PushToggle } from '@/components/PushToggle';
import { Tag, rankTone } from '@/components/Tag';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { BADGES, earnedBadges, highestBadge } from '@/lib/badges';
import { cn, formatPoints, pointsTone } from '@/lib/ui';
import { getEmailPreferences } from '@/server/notification-email';
import { pushPublicKey } from '@/server/notification-push';
import { getAccountOverview, type SeasonHistoryRow } from '@/server/queries';
import { getFriendOverview } from '@/server/social';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/leagues');

  const [account, friends, emailPreferences, leaguesCommissioned] = await Promise.all([
    getAccountOverview(user.id),
    getFriendOverview(user.id),
    getEmailPreferences(user.id),
    prisma.league.count({ where: { commissionerId: user.id } }),
  ]);

  const displayName = user.name ?? user.handle ?? 'Manager';
  // Active seasons first — the thing you are currently playing is the thing
  // you opened this page to look at.
  const ordered = [...account.rows].sort(
    (a, b) =>
      Number(b.seasonStatus === 'ACTIVE') - Number(a.seasonStatus === 'ACTIVE') ||
      b.totalPoints - a.totalPoints,
  );
  // A closed league is never "this season", whatever its season is doing.
  const current = ordered.find(
    (row) => !row.archived && row.seasonStatus !== 'COMPLETED' && row.history.length > 0,
  );
  const past = ordered.filter((row) => row.seasonStatus === 'COMPLETED');
  const badge = highestBadge(account.totalPoints);
  const vapidKey = pushPublicKey();

  return (
    <div className="pt-2">
      {/* Who you are and what you have scored. Not a panel: the top of the
          page is already where a scroll comes to rest. */}
      <div className="stage">
        <Link href="/leagues" className="text-xs text-muted">
          ← Home
        </Link>

        <div className="mt-4 flex items-center gap-4">
          <span className="relative shrink-0">
            <Avatar name={displayName} photoUrl={user.avatarUrl} size={64} />
            {/* The highest badge, pinned to the avatar's corner as a small
                medal; named again in text right after. */}
            {badge && <Medal badge={badge} size="sm" className="absolute -bottom-1 -right-2" />}
          </span>
          <div className="min-w-0">
            <h1 className="headline truncate text-3xl">{displayName}</h1>
            <p className="mt-1.5 flex min-w-0 items-center gap-2 text-xs text-muted">
              <span className="truncate">{user.handle ? `@${user.handle}` : user.email}</span>
              {badge && (
                <Tag tone="gold" size="sm">
                  {badge.name}
                </Tag>
              )}
            </p>
          </div>
        </div>

        {/* Career totals as a bento: the headline number on a gold block two
          tiles wide, the three supporting counts beside it. */}
        <section className="mt-6" aria-labelledby="career">
          <h2 id="career" className="sr-only">
            Career totals
          </h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Total points" value={String(account.totalPoints)} lead className="col-span-2" />
            <Stat label="Leagues" value={String(account.leaguesPlayed)} />
            <Stat
              label="Best finish"
              value={account.bestRank ? `#${account.bestRank}` : '—'}
              valueClassName={account.bestRank === 1 ? 'text-brand-gold-deep' : undefined}
            />
            {/* Full width on a phone so the row below the gold block is not a
              lone tile; one column once the five fit on a line. */}
            <Stat
              label="Titles"
              value={String(account.titles)}
              hint="Seasons won outright"
              valueClassName={account.titles > 0 ? 'text-brand-gold-deep' : undefined}
              className="col-span-2 sm:col-span-1"
            />
          </dl>
        </section>
      </div>

      <RevealGroup step={80}>
        <Collapsible
          title="Badges"
          className="mt-10"
          aside={`${earnedBadges(account.totalPoints).length} of ${BADGES.length}`}
        >
          <BadgeShelf points={account.totalPoints} />
        </Collapsible>

        {current && (
          <Collapsible
            title="This season"
            className="mt-10"
            aside={
              <Link href={`/leagues/${current.leagueId}`} className="text-brand-gold-deep">
                {current.leagueName} →
              </Link>
            }
          >
            <div className="card p-4">
              <div className="mb-4 flex items-end justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-2xs text-muted">{current.teamName}</span>
                  <span className="font-display text-5xl leading-none tracking-wide">
                    {current.totalPoints}
                  </span>
                </span>
                {current.rank > 0 && (
                  <Tag tone={rankTone(current.rank)} size="sm">
                    {current.rank === 1 && <CrownIcon size={13} className="-ml-0.5" />}#{current.rank} of{' '}
                    {current.teamCount}
                  </Tag>
                )}
              </div>
              <PointHistoryChart history={current.history} caption={current.teamName} />
            </div>
          </Collapsible>
        )}

        <Collapsible title="Season history" className="mt-10" aside={`${account.rows.length}`}>
          {account.rows.length === 0 ? (
            <div className="rounded-card border border-dashed border-hairline p-5">
              <p className="max-w-measure text-xs leading-relaxed text-muted">
                You have not played a season yet. Join or create a league and your results will build up here.
              </p>
              <Link href="/leagues/new" prefetch={false} className="btn-primary btn-sm mt-3">
                Create a league
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-hairline border-y border-hairline">
              {ordered.map((row) => (
                <SeasonRow key={row.id} row={row} />
              ))}
            </ul>
          )}
          {past.length === 0 && account.rows.length > 0 && (
            <p className="mt-3 text-2xs text-muted">
              Finished seasons stay here permanently, with the score you ended on — even if the league is
              deleted later.
            </p>
          )}
        </Collapsible>

        {/* The settings you rarely touch, as one folded list. Friends opens
              itself when someone is waiting on an answer — that is the one
              thing here that asks something of you. */}
        <RowGroup className="mt-10">
          <Collapsible
            variant="row"
            title="Friends"
            defaultOpen={friends.incoming.length > 0}
            aside={`${friends.friends.length}${friends.incoming.length > 0 ? ` · ${friends.incoming.length} waiting` : ''}`}
          >
            <p className="mb-4 max-w-measure text-2xs leading-relaxed text-muted">
              Friends can be invited into a league in one tap, and get an alert with the code already filled
              in.
            </p>
            <FriendsPanel overview={friends} />
          </Collapsible>

          {/* Hidden entirely when the deployment has no VAPID keys — like the
                email switches, a control that governs nothing is worse than none. */}
          {vapidKey && (
            <Collapsible variant="row" title="Push alerts" defaultOpen={false}>
              <p className="mb-4 max-w-measure text-2xs leading-relaxed text-muted">
                The same alerts as the bell, delivered to this device even when Comp Beast is closed. Turn it
                on separately on each phone or computer you use.
              </p>
              <PushToggle publicKey={vapidKey} />
            </Collapsible>
          )}

          {/* id="email" is the anchor every email footer links back to; the
                row opens itself when the page lands on that hash. */}
          <Collapsible id="email" variant="row" title="Email alerts" defaultOpen={false}>
            <p className="mb-4 max-w-measure text-2xs leading-relaxed text-muted">
              Alerts always appear in the app. These decide which of them also reach{' '}
              <span className="text-ink">{user.email}</span>.
            </p>
            <EmailPreferences preferences={emailPreferences} />
          </Collapsible>
        </RowGroup>
      </RevealGroup>

      <DeleteAccountPanel leaguesCommissioned={leaguesCommissioned} />
    </div>
  );
}

/**
 * One career number. The `lead` one — lifetime points — is the page's one
 * block of gold, two tiles wide, with the wordmark's tally in its corner;
 * the rest are dark tiles, and a number worth celebrating (a title, a
 * first-place finish) is picked out in gold type rather than a new colour.
 */
function Stat({
  label,
  value,
  hint,
  lead = false,
  valueClassName,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  lead?: boolean;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn(lead ? 'card-pop-gold overflow-hidden' : 'card', 'relative p-4', className)}>
      {lead && (
        <TallyMark className="absolute -bottom-5 -right-2 h-28 w-28 text-pop-gold-ink opacity-[0.09]" />
      )}
      <dt className="text-2xs font-bold uppercase tracking-[0.14em] text-tile-muted">{label}</dt>
      <dd
        className={cn(
          'relative mt-1.5 font-display leading-none tracking-wide',
          lead ? 'text-6xl' : 'text-3xl',
          valueClassName,
        )}
      >
        {value}
      </dd>
      {hint && <p className="mt-1.5 text-2xs leading-tight text-tile-muted">{hint}</p>}
    </div>
  );
}

const STATUS_LABEL: Record<SeasonHistoryRow['seasonStatus'], string> = {
  UPCOMING: 'Pre-season',
  ACTIVE: 'Playing',
  COMPLETED: 'Finished',
};

/**
 * A line from a league that still exists links to the team page. Once the
 * league has been deleted there is nothing to link to, so the same layout
 * renders as plain text with a "League closed" tag — the numbers are the
 * frozen final line from `CareerRecord`, which is the whole point of it.
 */
function SeasonRow({ row }: { row: SeasonHistoryRow }) {
  const last = row.history.at(-1);
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{row.teamName}</span>
        <span className="mt-0.5 block truncate text-2xs text-muted">
          {row.showName} · {row.seasonName} · {row.leagueName}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="block font-display text-xl leading-none tracking-wide">{row.totalPoints}</span>
        {last && (
          <span className={`mt-1 block text-2xs tabular-nums ${pointsTone(last.cyclePoints)}`}>
            {formatPoints(last.cyclePoints)} last
          </span>
        )}
      </span>

      <span className="flex min-w-[4.5rem] shrink-0 flex-col items-end">
        {row.rank > 0 ? (
          <Tag tone={row.settled ? rankTone(row.rank) : 'ink'} size="sm">
            #{row.rank}
          </Tag>
        ) : (
          <Tag tone="outline" size="sm">
            {STATUS_LABEL[row.seasonStatus]}
          </Tag>
        )}
        {row.archived && <span className="mt-1 block text-2xs leading-tight text-muted">League closed</span>}
      </span>
    </>
  );

  if (row.archived || !row.teamId) {
    return <li className="flex items-center gap-3 px-1 py-4">{body}</li>;
  }

  return (
    <li>
      <Link
        href={`/teams/${row.teamId}`}
        className="flex items-center gap-3 rounded-btn px-1 py-4 transition hover:bg-surface/60"
      >
        {body}
      </Link>
    </li>
  );
}
