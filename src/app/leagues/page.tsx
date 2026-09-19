import Link from 'next/link';
import { LeagueRail } from '@/components/LeagueRail';
import { LiveSection, type FeaturedCast } from '@/components/LiveSection';
import { SignedOutLanding } from '@/components/SignedOutLanding';
import { getCurrentUser } from '@/lib/auth';
import {
  getHomeLeagues,
  getRecentHeadlines,
  getSeasonScoreboard,
  getSeasonsByStatus,
} from '@/server/queries';

export const dynamic = 'force-dynamic';

/**
 * Home.
 *
 * Signed out this is the pitch; signed in it is the dashboard. Both render
 * the same `<LiveSection />` below the fold — the airing cast, the last
 * scored events and the community timeline — because "what is happening in
 * the house right now" is the reason to open the app in either state, and a
 * signed-in player losing access to it made no sense.
 */
export default async function HomePage() {
  const user = await getCurrentUser();

  const featured = await getFeaturedCast();
  const headlines = featured ? await getRecentHeadlines(featured.seasonId) : [];
  const live = <LiveSection featured={featured} headlines={headlines} />;

  if (!user) return <SignedOutLanding live={live} />;

  const leagues = await getHomeLeagues(user.id);

  return (
    <div className="pt-2">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">Leagues</h1>
        <div className="flex shrink-0 gap-2">
          <Link href="/leagues/join" prefetch={false} className="btn-ghost btn-sm">
            Join
          </Link>
          <Link href="/leagues/new" prefetch={false} className="btn-primary btn-sm">
            Create
          </Link>
        </div>
      </div>

      {leagues.length === 0 ? (
        <EmptyLeagues />
      ) : (
        <LeagueRail
          leagues={leagues}
          caption={`${leagues.length} ${leagues.length === 1 ? 'league' : 'leagues'} · swipe for more`}
        />
      )}

      <div className="mt-10">{live}</div>
    </div>
  );
}

function EmptyLeagues() {
  return (
    <div className="rounded-card border border-dashed border-brand-gold-deep/50 bg-brand-gold-soft/30 p-5">
      <h2 className="text-lg font-semibold">You&apos;re not in a league yet</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Start one for any season that is still open, or join a friend&apos;s with their invite
        code — they can show you a QR code to scan instead.
      </p>
      <div className="mt-4 flex gap-2">
        <Link href="/leagues/join" prefetch={false} className="btn-ghost bg-surface">
          Join a league
        </Link>
        <Link href="/leagues/new" prefetch={false} className="btn-primary">
          Create
        </Link>
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
async function getFeaturedCast(): Promise<FeaturedCast | null> {
  const { open } = await getSeasonsByStatus();
  const ordered = [
    ...open.filter((s) => s.status === 'ACTIVE'),
    ...open.filter((s) => s.status !== 'ACTIVE'),
  ];

  for (const season of ordered) {
    const board = await getSeasonScoreboard(season.slug);
    if (!board) continue;

    const cast = board.players
      .filter((p): p is typeof p & { photoUrl: string } => p.isActive && Boolean(p.photoUrl))
      .slice(0, 8)
      .map((p) => ({ name: p.name, photoUrl: p.photoUrl }));

    if (cast.length > 0) {
      return {
        seasonId: season.id,
        seasonSlug: board.season.slug,
        seasonName: board.season.name,
        cast,
      };
    }
  }

  return null;
}
