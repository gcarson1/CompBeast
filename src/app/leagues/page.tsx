import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { LeagueRail } from '@/components/LeagueRail';
import { LIVE_HASHTAG, LiveSection, type FeaturedCast } from '@/components/LiveSection';
import { getSocialBuzz } from '@/lib/social-feed';
import { SignedOutLanding, type LandingSeason } from '@/components/SignedOutLanding';
import { getCurrentUser } from '@/lib/auth';
import { isEmailConfigured } from '@/lib/email/send';
import { HOME_PATH, SITE_DESCRIPTION, SITE_NAME, absoluteUrl } from '@/lib/seo';
import {
  getHomeLeagues,
  getRecentHeadlines,
  getRuleBook,
  getSeasonScoreboard,
  getSeasonsByStatus,
} from '@/server/queries';

export const dynamic = 'force-dynamic';

/**
 * `title.absolute` because this *is* the site: "Comp Beast · Comp Beast" from
 * the layout's template would be the one place the template reads wrong.
 * The canonical is the full URL rather than `/` — `/` redirects here, and
 * every signal pointed at the domain should settle on the page that answers.
 */
export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME}: Free Fantasy Leagues for Big Brother` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: absoluteUrl(HOME_PATH) },
  openGraph: {
    title: `${SITE_NAME}: Free Fantasy Leagues for Big Brother`,
    description: SITE_DESCRIPTION,
    url: absoluteUrl(HOME_PATH),
    // Named explicitly: a page-level `openGraph` replaces the inherited one
    // wholesale, which would drop the site card app/opengraph-image.tsx draws.
    images: [{ url: absoluteUrl('/opengraph-image'), width: 1200, height: 630 }],
  },
};

type OpenSeason = Awaited<ReturnType<typeof getSeasonsByStatus>>['open'][number];

/**
 * Home.
 *
 * Signed out this is the pitch; signed in it is the dashboard. Both render
 * the same `<LiveSection />` below the fold — the airing cast, the last
 * scored events and the community timeline — because "what is happening in
 * the house right now" is the reason to open the app in either state, and a
 * signed-in player losing access to it made no sense.
 *
 * What renders *in the shell* is chosen deliberately. There is no loading
 * boundary above this page (see PageSkeleton.tsx), so everything awaited here
 * is in the first bytes a crawler reads: the pitch, the scoring table and
 * the FAQ for a visitor who is signed out; the title and the actions for one
 * who is signed in. The two things that are slow — the league rail, which
 * fans out a query per league, and the live block, whose buzz feed can wait
 * six seconds on a cold cache — sit in their own Suspense boundaries and
 * stream in behind it.
 */
export default async function HomePage() {
  const user = await getCurrentUser();
  const { open } = await getSeasonsByStatus();
  // ACTIVE ahead of UPCOMING, so the copy talks about the season on air.
  const ordered = [...open.filter((s) => s.status === 'ACTIVE'), ...open.filter((s) => s.status !== 'ACTIVE')];

  // Started here, awaited in two places. The live block always needs it;
  // the signed-out copy needs it too, *before* the shell goes out, so the
  // season the prose names is the season whose faces are in the marquee.
  // Signed in, nothing in the shell depends on it and it resolves inside
  // the boundary instead of holding the response.
  const featuredPromise = getFeaturedCast(ordered);
  // Signed in, nothing touches this until the boundary renders. Marking it
  // handled now keeps a fast database failure from surfacing as an unhandled
  // rejection in the meantime; the `await` inside the boundary still throws
  // to the error boundary.
  featuredPromise.catch(() => {});

  const live = (
    <Suspense fallback={<LiveSkeleton />}>
      <LiveBlock featured={featuredPromise} />
    </Suspense>
  );

  if (!user) {
    const featured = await featuredPromise;
    // The same selection the marquee makes — the first open season with a
    // photographed cast — because the database also holds a synthetic demo
    // season that is ACTIVE, and "Demo Season is airing now" is not a claim
    // to put in front of a search engine. Only when no season qualifies does
    // the copy fall back to whatever is first, which is also what the
    // marquee's absence already says on such a database.
    const lead = ordered.find((s) => s.id === featured?.seasonId) ?? ordered[0];
    const season: LandingSeason | null = lead
      ? {
          slug: lead.slug,
          name: lead.name,
          status: lead.status === 'ACTIVE' ? 'ACTIVE' : 'UPCOMING',
          contestantCount: lead._count.contestants,
          showName: lead.show.name,
          showSlug: lead.show.slug,
        }
      : null;
    const rulesets = await getRuleBook(season?.showSlug ?? 'big-brother');

    return (
      <SignedOutLanding
        live={live}
        season={season}
        rulesets={rulesets}
        emailAlerts={isEmailConfigured()}
      />
    );
  }

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

      <Suspense fallback={<RailSkeleton />}>
        <HomeRail userId={user.id} />
      </Suspense>

      <div className="mt-10">{live}</div>
    </div>
  );
}

async function HomeRail({ userId }: { userId: string }) {
  const leagues = await getHomeLeagues(userId);

  if (leagues.length === 0) return <EmptyLeagues />;

  return (
    <LeagueRail
      leagues={leagues}
      caption={`${leagues.length} ${leagues.length === 1 ? 'league' : 'leagues'} · swipe for more`}
    />
  );
}

async function LiveBlock({ featured: pending }: { featured: Promise<FeaturedCast | null> }) {
  const featured = await pending;
  const [headlines, buzz] = await Promise.all([
    featured ? getRecentHeadlines(featured.seasonId) : Promise.resolve([]),
    getSocialBuzz({
      showName: featured?.showName ?? 'Big Brother',
      showSlug: featured?.showSlug ?? 'big-brother',
      hashtag: LIVE_HASHTAG,
    }),
  ]);

  return <LiveSection featured={featured} headlines={headlines} buzz={buzz} />;
}

/**
 * Shaped like the block it stands in for — a row of faces, one card, a
 * short list — so the page does not jump when the real thing streams in.
 * `role="status"` with a label and no text: a reader that never runs the
 * swap-in script should not find the word "Loading" in the middle of an
 * otherwise complete page.
 */
function LiveSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading live updates">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="h-7 w-24 animate-pulse rounded-pill bg-surface" />
          <div className="h-4 w-28 animate-pulse rounded-pill bg-surface/70" />
        </div>
        <div className="flex gap-4 overflow-hidden">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex w-16 shrink-0 flex-col items-center gap-1.5 py-1">
              <div className="h-14 w-14 animate-pulse rounded-full bg-surface" />
              <div className="h-3 w-10 animate-pulse rounded-pill bg-surface/70" />
            </div>
          ))}
        </div>
      </div>
      <div className="card p-4">
        <div className="h-3 w-24 animate-pulse rounded-pill bg-canvas" />
        <div className="mt-3 h-4 w-3/4 animate-pulse rounded-pill bg-canvas" />
      </div>
      <div className="divide-y divide-hairline border-y border-hairline">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 px-1 py-3.5">
            <div className="h-4 w-11/12 animate-pulse rounded-pill bg-surface" />
            <div className="h-3 w-1/3 animate-pulse rounded-pill bg-surface/70" />
          </div>
        ))}
      </div>
    </div>
  );
}

function RailSkeleton() {
  return (
    <div role="status" aria-label="Loading your leagues">
      <div className="flex gap-3 overflow-hidden">
        {[0, 1].map((i) => (
          <div key={i} className="card w-72 shrink-0 p-4">
            <div className="h-4 w-2/3 animate-pulse rounded-pill bg-canvas" />
            <div className="mt-2 h-3 w-1/2 animate-pulse rounded-pill bg-canvas/70" />
            <div className="mt-5 h-8 w-20 animate-pulse rounded-pill bg-canvas" />
            <div className="mt-4 h-3 w-full animate-pulse rounded-pill bg-canvas/70" />
          </div>
        ))}
      </div>
      <div className="mt-2 h-3 w-32 animate-pulse rounded-pill bg-surface/70" />
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
 * show off — the caller passes ACTIVE seasons first. Data-driven rather than
 * keyed off a slug or show name, so a synthetic/demo season with no real
 * photos is skipped automatically instead of needing a special case.
 */
async function getFeaturedCast(seasons: OpenSeason[]): Promise<FeaturedCast | null> {
  for (const season of seasons) {
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
        showName: season.show.name,
        showSlug: season.show.slug,
        cast,
      };
    }
  }

  return null;
}
