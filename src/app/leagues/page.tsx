import Link from 'next/link';
import { AvatarStack } from '@/components/Avatar';
import { getCurrentUser } from '@/lib/auth';
import { getLeaguesForUser } from '@/server/queries';

export const dynamic = 'force-dynamic';

const DRAFT_LABEL: Record<string, string> = {
  NOT_STARTED: 'Pre-draft',
  IN_PROGRESS: 'Drafting',
  COMPLETED: 'In season',
};

export default async function LeaguesPage() {
  const user = await getCurrentUser();
  if (!user) {
    return <EmptyState title="Sign in to play" body="Connect an account to create or join a league." />;
  }

  const leagues = await getLeaguesForUser(user.id);

  return (
    <div className="pt-2">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-[28px] font-semibold tracking-tight">Leagues</h1>
        <div className="flex gap-2">
          <Link href="/leagues/join" className="btn-ghost">
            Join
          </Link>
          <Link href="/leagues/new" className="btn-primary">
            Create
          </Link>
        </div>
      </div>
      <p className="mb-4 text-[13px] text-muted">
        Total {leagues.length} {leagues.length === 1 ? 'league' : 'leagues'}
      </p>

      <ul className="space-y-3">
        {leagues.map((league) => {
          const memberNames = league.members.map((m) => m.user.name ?? m.user.handle ?? '?');
          return (
            <li key={league.id}>
              <Link href={`/leagues/${league.id}`} className="card block p-4 transition active:scale-[0.99]">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#f5a524] to-[#f0574e] text-sm font-bold text-white">
                    {league.name.slice(0, 1)}
                  </span>
                  <span className="pill bg-canvas text-[12px] text-muted">
                    {DRAFT_LABEL[league.draftStatus] ?? league.draftStatus}
                  </span>
                </div>

                <h2 className="mt-3 text-[17px] font-semibold">{league.name}</h2>
                <p className="mt-0.5 text-[13px] text-muted">
                  {league.season.show.name} · {league.season.name}
                </p>

                <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
                  <AvatarStack names={memberNames} />
                  <span className="text-[12px] text-muted">
                    {league._count.teams} teams · {league.scoringRuleset.name}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 rounded-card border border-dashed border-brand-gold-deep/50 bg-brand-gold-soft/30 p-4">
        <BoltIcon />
        <h3 className="mt-2 text-[15px] font-semibold">Add new or join a league</h3>
        <p className="mt-0.5 text-[13px] text-muted">
          Start a league for any season, or jump into a friend&apos;s with an invite code.
        </p>
        <div className="mt-3 flex gap-2">
          <Link href="/leagues/join" className="btn-ghost bg-surface">
            Join
          </Link>
          <Link href="/leagues/new" className="btn-primary">
            Create
          </Link>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="card mt-8 p-6 text-center">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      <p className="mt-1 text-[13px] text-muted">{body}</p>
    </div>
  );
}

function BoltIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="1.8">
      <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" strokeLinejoin="round" />
    </svg>
  );
}
