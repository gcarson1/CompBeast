import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { EmailPreferences } from '@/components/EmailPreferences';
import { FriendsPanel } from '@/components/FriendsPanel';
import { PointHistoryChart } from '@/components/PointHistoryChart';
import { getCurrentUser } from '@/lib/auth';
import { formatPoints, pointsTone } from '@/lib/ui';
import { getEmailPreferences } from '@/server/notification-email';
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
  const current = ordered.find((row) => row.seasonStatus !== 'COMPLETED' && row.history.length > 0);
  const past = ordered.filter((row) => row.seasonStatus === 'COMPLETED');

  return (
    <div className="pt-2">
      <Link href="/leagues" className="text-xs text-muted">
        ← Home
      </Link>

      <div className="mt-3 flex items-center gap-4">
        <Avatar name={displayName} photoUrl={user.avatarUrl} size={56} />
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-semibold tracking-tight">{displayName}</h1>
          <p className="truncate text-xs text-muted">
            {user.handle ? `@${user.handle}` : user.email}
          </p>
        </div>
      </div>

      <section className="mt-6" aria-labelledby="career">
        <h2 id="career" className="sr-only">
          Career totals
        </h2>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Total points" value={String(account.totalPoints)} />
          <Stat label="Leagues" value={String(account.leaguesPlayed)} />
          <Stat
            label="Best finish"
            value={account.bestRank ? `#${account.bestRank}` : '—'}
          />
          <Stat label="Titles" value={String(account.titles)} hint="Seasons won outright" />
        </dl>
      </section>

      {current && (
        <section className="mt-8" aria-labelledby="current-run">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="current-run" className="text-lg font-semibold">
              This season
            </h2>
            <Link
              href={`/leagues/${current.leagueId}`}
              className="shrink-0 text-2xs text-brand-gold-deep"
            >
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
                <span
                  className={`pill shrink-0 text-2xs ${
                    current.rank === 1 ? 'bg-brand-gold text-on-gold' : 'bg-canvas text-muted'
                  }`}
                >
                  #{current.rank} of {current.teamCount}
                </span>
              )}
            </div>
            <PointHistoryChart history={current.history} caption={current.teamName} />
          </div>
        </section>
      )}

      <section className="mt-8" aria-labelledby="seasons">
        <h2 id="seasons" className="mb-3 text-lg font-semibold">
          Season history
        </h2>
        {account.rows.length === 0 ? (
          <div className="rounded-card border border-dashed border-hairline p-5">
            <p className="max-w-measure text-xs leading-relaxed text-muted">
              You have not played a season yet. Join or create a league and your results will
              build up here.
            </p>
            <Link href="/leagues/new" prefetch={false} className="btn-primary btn-sm mt-3">
              Create a league
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-hairline border-y border-hairline">
            {ordered.map((row) => (
              <SeasonRow key={row.teamId} row={row} />
            ))}
          </ul>
        )}
        {past.length === 0 && account.rows.length > 0 && (
          <p className="mt-3 text-2xs text-muted">
            Finished seasons stay here permanently, with the score you ended on.
          </p>
        )}
      </section>

      <section className="mt-10" aria-labelledby="friends">
        <h2 id="friends" className="mb-1 text-lg font-semibold">
          Friends
        </h2>
        <p className="mb-4 max-w-measure text-2xs leading-relaxed text-muted">
          Friends can be invited into a league in one tap, and get an alert with the code already
          filled in.
        </p>
        <FriendsPanel overview={friends} />
      </section>

      {/* id="email" is the anchor every email footer links back to. */}
      <section className="mt-10 scroll-mt-6" id="email" aria-labelledby="email-heading">
        <h2 id="email-heading" className="mb-1 text-lg font-semibold">
          Email alerts
        </h2>
        <p className="mb-4 max-w-measure text-2xs leading-relaxed text-muted">
          Alerts always appear in the app. These decide which of them also reach{' '}
          <span className="text-ink">{user.email}</span>.
        </p>
        <EmailPreferences preferences={emailPreferences} />
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-3">
      <dt className="text-2xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-display text-2xl leading-none tracking-wide">{value}</dd>
      {hint && <p className="mt-1 text-[11px] leading-tight text-muted">{hint}</p>}
    </div>
  );
}

const STATUS_LABEL: Record<SeasonHistoryRow['seasonStatus'], string> = {
  UPCOMING: 'Pre-season',
  ACTIVE: 'Playing',
  COMPLETED: 'Finished',
};

function SeasonRow({ row }: { row: SeasonHistoryRow }) {
  const last = row.history.at(-1);
  return (
    <li>
      <Link
        href={`/teams/${row.teamId}`}
        className="flex items-center gap-3 rounded-btn px-1 py-4 transition hover:bg-surface/60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{row.teamName}</span>
          <span className="mt-0.5 block truncate text-2xs text-muted">
            {row.showName} · {row.seasonName} · {row.leagueName}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block font-display text-xl leading-none tracking-wide">
            {row.totalPoints}
          </span>
          {last && (
            <span className={`mt-1 block text-2xs tabular-nums ${pointsTone(last.cyclePoints)}`}>
              {formatPoints(last.cyclePoints)} last
            </span>
          )}
        </span>

        <span className="w-20 shrink-0 text-right">
          {row.rank > 0 ? (
            <span
              className={`pill text-2xs ${
                row.rank === 1 && row.seasonStatus === 'COMPLETED'
                  ? 'bg-brand-gold text-on-gold'
                  : 'bg-canvas text-muted'
              }`}
            >
              #{row.rank}
            </span>
          ) : (
            <span className="pill bg-canvas text-2xs text-muted">
              {STATUS_LABEL[row.seasonStatus]}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
