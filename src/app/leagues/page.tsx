import Link from 'next/link';
import { SignInButton } from '@clerk/nextjs';
import { Avatar, AvatarStack } from '@/components/Avatar';
import { getCurrentUser } from '@/lib/auth';
import { getLeaguesForUser, getSeasonScoreboard, getSeasonsByStatus } from '@/server/queries';

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
    return <SignedOutLanding featured={featured} />;
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
        <BoltIcon className="text-brand-gold-deep" />
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

interface FeaturedCast {
  seasonSlug: string;
  seasonName: string;
  cast: Array<{ name: string; photoUrl: string }>;
}

/**
 * Picks the first open season that actually has photographed, active cast to
 * show off — ACTIVE seasons first. Data-driven rather than keyed off a slug
 * or show name, so a synthetic/demo season with no real photos is skipped
 * automatically instead of needing a special case.
 */
async function getFeaturedCast(): Promise<FeaturedCast | null> {
  const { open } = await getSeasonsByStatus();
  const ordered = [...open.filter((s) => s.status === 'ACTIVE'), ...open.filter((s) => s.status !== 'ACTIVE')];

  for (const season of ordered) {
    const board = await getSeasonScoreboard(season.slug);
    if (!board) continue;

    const cast = board.players
      .filter((p): p is typeof p & { photoUrl: string } => p.isActive && Boolean(p.photoUrl))
      .slice(0, 8)
      .map((p) => ({ name: p.name, photoUrl: p.photoUrl }));

    if (cast.length > 0) return { seasonSlug: board.season.slug, seasonName: board.season.name, cast };
  }

  return null;
}

function SignedOutLanding({ featured }: { featured: FeaturedCast | null }) {
  return (
    <div className="pt-6 text-center">
      <h1 className="mt-4 font-display text-[42px] leading-[0.95] tracking-wide">
        DRAFT THE HOUSE.
        <br />
        <span className="text-brand-gold">OWN THE LEADERBOARD.</span>
      </h1>

      <p className="mx-auto mt-4 max-w-xs text-[14px] leading-relaxed text-muted">
        Fantasy leagues for reality TV. Draft real houseguests, score every HOH, veto, and
        blindside, and chase the board live as episodes air.
      </p>

      <SignInButton mode="modal">
        <button type="button" className="btn-primary mt-6 w-full py-3.5 text-[16px]">
          Sign In
        </button>
      </SignInButton>

      {featured && (
        <div className="mt-10 text-left">
          <div className="flex items-center justify-between">
            <span className="pill bg-brand-gold-soft text-[11px] text-brand-gold-deep">Airing now</span>
            <Link href={`/seasons/${featured.seasonSlug}`} className="text-[12px] text-brand-gold-deep">
              {featured.seasonName} →
            </Link>
          </div>
          <div className="no-scrollbar mt-3 flex gap-4 overflow-x-auto pb-1">
            {featured.cast.map((c) => (
              <div key={c.name} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                <Avatar name={c.name} photoUrl={c.photoUrl} size={56} />
                <span className="w-full truncate text-center text-[10px] text-muted">
                  {c.name.split(' ')[0]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10 space-y-3 text-left">
        <FeatureRow
          icon={<DraftIcon />}
          title="Draft real houseguests"
          body="Snake-draft the live cast before the season locks in."
        />
        <FeatureRow
          icon={<BoltIcon className="h-5 w-5" />}
          title="Score every move"
          body="HOH wins, vetos, blindsides, and blowups all count toward your team."
        />
        <FeatureRow
          icon={<RankIcon />}
          title="Live leaderboard"
          body="Ranks update episode by episode, all season long."
        />
      </div>

      <div className="mt-8 flex items-center justify-center gap-3 text-[13px] text-brand-gold-deep">
        <Link href="/seasons">Browse seasons</Link>
        <span className="text-muted">·</span>
        <Link href="/rules">See scoring rules</Link>
      </div>
    </div>
  );
}

function FeatureRow({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="card flex items-start gap-3 p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-gold-soft text-brand-gold-deep">
        {icon}
      </span>
      <span>
        <span className="block text-[14px] font-semibold">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-muted">{body}</span>
      </span>
    </div>
  );
}

function DraftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2" strokeLinecap="round" />
    </svg>
  );
}

function RankIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 20v-6M12 20V9M18 20V4" strokeLinecap="round" />
    </svg>
  );
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
