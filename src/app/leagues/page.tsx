import Link from 'next/link';
import { AvatarStack } from '@/components/Avatar';
import { SignedOutLanding, type FeaturedCast } from '@/components/SignedOutLanding';
import { getCurrentUser } from '@/lib/auth';
import {
  getLeaguesForUser,
  getRecentHeadlines,
  getSeasonScoreboard,
  getSeasonsByStatus,
} from '@/server/queries';

export const dynamic = 'force-dynamic';

const DRAFT_LABEL: Record<string, string> = {
  NOT_STARTED: 'Pre-draft',
  IN_PROGRESS: 'Drafting',
  COMPLETED: 'In season',
};

export default async function LeaguesPage() {
  const user = await getCurrentUser();
  if (!user) {
    const featured = await getFeaturedCast();
    const headlines = featured ? await getRecentHeadlines(featured.seasonId) : [];
    return <SignedOutLanding featured={featured} headlines={headlines} />;
  }

  const leagues = await getLeaguesForUser(user.id);

  return (
    <div className="pt-2">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-4xl font-semibold tracking-tight">Leagues</h1>
        <div className="flex gap-2">
          <Link href="/leagues/join" prefetch={false} className="btn-ghost">
            Join
          </Link>
          <Link href="/leagues/new" prefetch={false} className="btn-primary">
            Create
          </Link>
        </div>
      </div>
      <p className="mb-4 text-xs text-muted">
        Total {leagues.length} {leagues.length === 1 ? 'league' : 'leagues'}
      </p>

      <ul className="space-y-3">
        {leagues.map((league) => {
          const memberNames = league.members.map((m) => m.user.name ?? m.user.handle ?? '?');
          return (
            <li key={league.id}>
              <Link href={`/leagues/${league.id}`} className="card block p-4 transition active:scale-[0.99]">
                <div className="flex items-start justify-between gap-3">
                  <span
                    aria-hidden
                    className="grid h-9 w-9 place-items-center rounded-full border border-brand-gold/30 bg-brand-gold-soft font-display text-md leading-none text-brand-gold-deep"
                  >
                    {league.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="pill bg-canvas text-2xs text-muted">
                    {DRAFT_LABEL[league.draftStatus] ?? league.draftStatus}
                  </span>
                </div>

                <h2 className="mt-3 text-lg font-semibold">{league.name}</h2>
                <p className="mt-0.5 text-xs text-muted">
                  {league.season.show.name} · {league.season.name}
                </p>

                <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
                  <AvatarStack names={memberNames} />
                  <span className="text-2xs text-muted">
                    {league._count.teams} teams · {league.scoringRuleset.name}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 rounded-card border border-dashed border-brand-gold-deep/50 bg-brand-gold-soft/30 p-4">
        <BoltIcon className="text-brand-gold-deep" />
        <h3 className="mt-2 text-base font-semibold">Add new or join a league</h3>
        <p className="mt-0.5 text-xs text-muted">
          Start a league for any season, or jump into a friend&apos;s with an invite code.
        </p>
        <div className="mt-3 flex gap-2">
          <Link href="/leagues/join" prefetch={false} className="btn-ghost bg-surface">
            Join
          </Link>
          <Link href="/leagues/new" prefetch={false} className="btn-primary">
            Create
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Picks the first open season that actually has photographed, active cast to
 * show off — ACTIVE seasons first. Data-driven rather than keyed off a slug
 * or show name, so a synthetic/demo season with no real photos is skipped
 * automatically instead of needing a special case.
 */
async function getFeaturedCast(): Promise<(FeaturedCast & { seasonId: string }) | null> {
  const { open } = await getSeasonsByStatus();
  const ordered = [...open.filter((s) => s.status === 'ACTIVE'), ...open.filter((s) => s.status !== 'ACTIVE')];

  for (const season of ordered) {
    const board = await getSeasonScoreboard(season.slug);
    if (!board) continue;

    const cast = board.players
      .filter((p): p is typeof p & { photoUrl: string } => p.isActive && Boolean(p.photoUrl))
      .slice(0, 8)
      .map((p) => ({ name: p.name, photoUrl: p.photoUrl }));

    if (cast.length > 0) {
      return { seasonId: season.id, seasonSlug: board.season.slug, seasonName: board.season.name, cast };
    }
  }

  return null;
}

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" strokeLinejoin="round" />
    </svg>
  );
}
