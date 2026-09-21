import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { BadgeShelf } from '@/components/BadgeShelf';
import { EmailPreferences } from '@/components/EmailPreferences';
import { FriendsPanel } from '@/components/FriendsPanel';
import { PointHistoryChart } from '@/components/PointHistoryChart';
import { Doodle, type DoodleKind } from '@/components/doodles/Doodle';
import { Reveal, RevealGroup } from '@/components/motion/Reveal';
import { PushToggle } from '@/components/PushToggle';
import { Sticker } from '@/components/Sticker';
import { getCurrentUser } from '@/lib/auth';
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

  const [account, friends, emailPreferences] = await Promise.all([
    getAccountOverview(user.id),
    getFriendOverview(user.id),
    getEmailPreferences(user.id),
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
      <Link href="/leagues" className="text-xs text-muted">
        ← Home
      </Link>

      <div className="mt-3 flex items-center gap-4">
        <span className="relative shrink-0">
          <Avatar name={displayName} photoUrl={user.avatarUrl} size={56} />
          {/* The highest badge, stuck to the avatar's corner; named again
              in text right after, so the sticker is never the only copy. */}
          {badge && <Doodle kind="star" className="absolute -right-2.5 -top-2.5 h-7 w-7 rotate-[18deg]" />}
        </span>
        <div className="min-w-0">
          <h1 className="headline truncate text-3xl">{displayName}</h1>
          <p className="mt-1.5 flex min-w-0 items-center gap-2 text-xs text-muted">
            <span className="truncate">{user.handle ? `@${user.handle}` : user.email}</span>
            {badge && (
              <Sticker tone="gold" size="sm" className="shrink-0">
                {badge.name}
              </Sticker>
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
          <Stat
            label="Total points"
            value={String(account.totalPoints)}
            tone="gold"
            glyph="tally"
            className="col-span-2"
          />
          <Stat label="Leagues" value={String(account.leaguesPlayed)} />
          <Stat
            label="Best finish"
            value={account.bestRank ? `#${account.bestRank}` : '—'}
            tone={account.bestRank === 1 ? 'mint' : undefined}
            glyph={account.bestRank === 1 ? 'crown' : undefined}
          />
          {/* Full width on a phone so the row below the gold block is not a
              lone tile; one column once the five fit on a line. */}
          <Stat
            label="Titles"
            value={String(account.titles)}
            hint="Seasons won outright"
            tone={account.titles > 0 ? 'lavender' : undefined}
            glyph={account.titles > 0 ? 'star' : undefined}
            className="col-span-2 sm:col-span-1"
          />
        </dl>
      </section>

      <RevealGroup step={80}>
        <Reveal as="section" className="mt-8" aria-labelledby="badges">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="badges" className="section-title">
              Badges
            </h2>
            <span className="text-2xs text-muted">
              {earnedBadges(account.totalPoints).length} of {BADGES.length}
            </span>
          </div>
          <BadgeShelf points={account.totalPoints} />
        </Reveal>

        {current && (
          <Reveal as="section" className="mt-8" aria-labelledby="current-run">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="current-run" className="section-title">
                This season
              </h2>
              <Link href={`/leagues/${current.leagueId}`} className="shrink-0 text-2xs text-brand-gold-deep">
                {current.leagueName} →
              </Link>
            </div>
            <div className="card p-4">
              <div className="mb-4 flex items-end justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-2xs text-muted">{current.teamName}</span>
                  <span className="font-display text-5xl leading-none tracking-wide">
                    {current.totalPoints}
                  </span>
                </span>
                {current.rank > 0 && (
                  <Sticker tone={current.rank === 1 ? 'gold' : 'ink'} size="sm" className="shrink-0">
                    {current.rank === 1 && <Doodle kind="crown" className="-ml-0.5 h-4 w-4" />}#{current.rank}{' '}
                    of {current.teamCount}
                  </Sticker>
                )}
              </div>
              <PointHistoryChart history={current.history} caption={current.teamName} />
            </div>
          </Reveal>
        )}

        <Reveal as="section" className="mt-8" aria-labelledby="seasons">
          <h2 id="seasons" className="eyebrow mb-3">
            Season history
          </h2>
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
        </Reveal>

        <Reveal as="section" className="mt-10" aria-labelledby="friends">
          <h2 id="friends" className="eyebrow mb-1">
            Friends
          </h2>
          <p className="mb-4 max-w-measure text-2xs leading-relaxed text-muted">
            Friends can be invited into a league in one tap, and get an alert with the code already filled in.
          </p>
          <FriendsPanel overview={friends} />
        </Reveal>

        {/* Hidden entirely when the deployment has no VAPID keys — like the
            email switches, a control that governs nothing is worse than none. */}
        {vapidKey && (
          <Reveal as="section" className="mt-10" aria-labelledby="push-heading">
            <h2 id="push-heading" className="eyebrow mb-1">
              Push alerts
            </h2>
            <p className="mb-4 max-w-measure text-2xs leading-relaxed text-muted">
              The same alerts as the bell, delivered to this device even when Comp Beast is closed. Turn it on
              separately on each phone or computer you use.
            </p>
            <PushToggle publicKey={vapidKey} />
          </Reveal>
        )}

        {/* id="email" is the anchor every email footer links back to. */}
        <Reveal as="section" className="mt-10 scroll-mt-6" id="email" aria-labelledby="email-heading">
          <h2 id="email-heading" className="eyebrow mb-1">
            Email alerts
          </h2>
          <p className="mb-4 max-w-measure text-2xs leading-relaxed text-muted">
            Alerts always appear in the app. These decide which of them also reach{' '}
            <span className="text-ink">{user.email}</span>.
          </p>
          <EmailPreferences preferences={emailPreferences} />
        </Reveal>
      </RevealGroup>
    </div>
  );
}

// Spelled out for Tailwind's content scan.
const STAT_TONE = {
  gold: 'card-pop-gold',
  mint: 'card-pop-mint',
  lavender: 'card-pop-lavender',
} as const;

function Stat({
  label,
  value,
  hint,
  tone,
  glyph,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  /** A colour block for the number worth celebrating; the rest stay dark. */
  tone?: keyof typeof STAT_TONE;
  /** The sticker in the corner of a colour block. */
  glyph?: DoodleKind;
  className?: string;
}) {
  const wide = className?.includes('col-span-2');
  return (
    <div className={cn(tone ? STAT_TONE[tone] : 'card', 'relative p-4', className)}>
      {glyph && <Doodle kind={glyph} tone="paper" className="absolute right-3 top-3 h-7 w-7 rotate-6" />}
      <dt className="text-2xs font-bold uppercase tracking-wide text-tile-muted">{label}</dt>
      <dd
        className={cn('mt-1 font-display leading-none tracking-wide', wide && tone ? 'text-6xl' : 'text-3xl')}
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

      <span className="w-20 shrink-0 text-right">
        {row.rank > 0 ? (
          <Sticker tone={row.rank === 1 && row.settled ? 'gold' : 'ink'} size="sm">
            #{row.rank}
          </Sticker>
        ) : (
          <Sticker tone="ink" size="sm">
            {STATUS_LABEL[row.seasonStatus]}
          </Sticker>
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
