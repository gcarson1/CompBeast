import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { BeastDoodle } from '@/components/doodles/BeastDoodle';
import { Doodle } from '@/components/doodles/Doodle';
import { Collapsible } from '@/components/Collapsible';
import { LeagueRail } from '@/components/LeagueRail';
import { Reveal } from '@/components/motion/Reveal';
import { LiveSection, type FeaturedCast, type LiveBlockData } from '@/components/LiveSection';
import { getSocialBuzz } from '@/lib/social-feed';
import { SignedOutLanding, type LandingShow } from '@/components/SignedOutLanding';
import { getCurrentUser } from '@/lib/auth';
import { isEmailConfigured } from '@/lib/email/send';
import { HOME_PATH, SITE_DESCRIPTION, SITE_NAME, absoluteUrl } from '@/lib/seo';
import { hashtagFor } from '@/lib/shows/registry';
import {
  getHomeLeagues,
  getRecentHeadlines,
  getRuleBooks,
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
  title: { absolute: `${SITE_NAME}: Free Fantasy Leagues for Reality TV` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: absoluteUrl(HOME_PATH) },
  openGraph: {
    title: `${SITE_NAME}: Free Fantasy Leagues for Reality TV`,
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
 * the same `<LiveSection />` below the fold — for each show, the open
 * season's cast, the last scored events and the community timeline —
 * because "what is happening right now" is the reason to open the app in
 * either state, and a signed-in player losing access to it made no sense.
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
  const ordered = [
    ...open.filter((s) => s.status === 'ACTIVE'),
    ...open.filter((s) => s.status !== 'ACTIVE'),
  ];

  // Started here, awaited in two places. The live block always needs it;
  // the signed-out copy needs it too, *before* the shell goes out, so the
  // seasons the prose names are the seasons whose faces are in the marquee.
  // Signed in, nothing in the shell depends on it and it resolves inside
  // the boundary instead of holding the response.
  const featuredPromise = getFeaturedCasts(ordered);
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
    const [featured, books] = await Promise.all([featuredPromise, getRuleBooks()]);
    // One entry per show that has a rule book, in the rule book's order
    // (flagship first). The season named for each is the one the marquee
    // shows — the first open season with a photographed cast — because the
    // database also holds synthetic demo seasons, and "Demo Season is airing
    // now" is not a claim to put in front of a search engine. A show with
    // no such season is still pitched, just without a season sentence.
    const shows: LandingShow[] = books.map((book) => {
      const lead = featured.find((f) => f.showSlug === book.slug);
      const season = lead ? ordered.find((s) => s.id === lead.seasonId) : undefined;
      return {
        showName: book.name,
        showSlug: book.slug,
        lexicon: book.lexicon,
        rulesets: book.rulesets,
        season: season
          ? {
              slug: season.slug,
              name: season.name,
              status: season.status === 'ACTIVE' ? 'ACTIVE' : 'UPCOMING',
              startsAt: season.startDate,
              contestantCount: season._count.contestants,
            }
          : null,
      };
    });

    return <SignedOutLanding live={live} shows={shows} emailAlerts={isEmailConfigured()} />;
  }

  return (
    <div className="pt-2">
      {/* Screen 1: your leagues and the two ways to get another. */}
      <div className="screen">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h1 className="headline text-4xl">Leagues</h1>
          <div className="flex shrink-0 gap-2">
            <Link href="/leagues/join" prefetch={false} className="btn-ghost btn-sm">
              Join
            </Link>
            <Link href="/leagues/new" prefetch={false} className="btn-primary btn-sm">
              Create
            </Link>
          </div>
        </div>

        <Collapsible title="Your leagues" className="mt-6">
          <Suspense fallback={<RailSkeleton />}>
            <HomeRail userId={user.id} />
          </Suspense>
        </Collapsible>
      </div>

      {/* Screen 2: what is happening in the houses right now. It carries its
          own headings, so it is one screen rather than a folding section. */}
      <Reveal className="screen pt-2">{live}</Reveal>
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

async function LiveBlock({ featured: pending }: { featured: Promise<FeaturedCast[]> }) {
  const featured = await pending;
  const blocks: LiveBlockData[] = await Promise.all(
    featured.map(async (cast) => {
      const hashtag = hashtagFor(cast.showSlug, cast.seasonSlug);
      const [headlines, buzz] = await Promise.all([
        getRecentHeadlines(cast.seasonId),
        getSocialBuzz({ showName: cast.showName, showSlug: cast.showSlug, hashtag }),
      ]);
      return { featured: cast, headlines, buzz, hashtag };
    }),
  );

  return <LiveSection blocks={blocks} />;
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
        <div className="flex gap-4 overflow-hidden pt-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card flex w-64 shrink-0 items-start gap-3 p-3">
              <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-canvas" />
              <div className="min-w-0 flex-1 space-y-2 py-0.5">
                <div className="h-3.5 w-2/3 animate-pulse rounded-pill bg-canvas" />
                <div className="h-3 w-5/6 animate-pulse rounded-pill bg-canvas/70" />
                <div className="h-3 w-1/3 animate-pulse rounded-pill bg-canvas/70" />
              </div>
            </div>
          ))}
        </div>
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
    <div className="card-pop-gold relative mt-6 overflow-visible p-5">
      {/* The mascot leans in from the corner, half off the tile. Only the
          copy makes room for it; the buttons get the full width. */}
      <BeastDoodle className="absolute -right-3 -top-5 h-24 w-24 rotate-6" />
      <Doodle kind="tally" tone="paper" className="absolute right-24 top-4 h-7 w-7 -rotate-6" />
      <div className="pr-20">
        <h2 className="headline text-2xl">You&apos;re not in a league yet</h2>
        <p className="mt-2 max-w-measure text-xs leading-relaxed text-tile-muted">
          Start one for any season that is still open, or join a friend&apos;s with their invite code — they
          can show you a QR code to scan instead.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/leagues/join"
          prefetch={false}
          className="btn border-2 border-pop-gold-ink/20 bg-white/40 text-pop-gold-ink hover:bg-white/60"
        >
          Join a league
        </Link>
        <Link
          href="/leagues/new"
          prefetch={false}
          className="btn bg-pop-gold-ink text-brand-gold-deep hover:bg-black"
        >
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
/**
 * One season per show: the first open one, in the order given (airing before
 * upcoming), whose cast has photographs. A season without faces is not a
 * marquee, and the demo seasons never have any, which is what keeps them off
 * the home page.
 */
async function getFeaturedCasts(seasons: OpenSeason[]): Promise<FeaturedCast[]> {
  const featured: FeaturedCast[] = [];
  for (const season of seasons) {
    if (featured.some((f) => f.showSlug === season.show.slug)) continue;
    const board = await getSeasonScoreboard(season.slug);
    if (!board) continue;

    const cast = board.players
      .filter((p): p is typeof p & { photoUrl: string } => p.isActive && Boolean(p.photoUrl))
      .slice(0, 8)
      .map((p) => ({ name: p.name, photoUrl: p.photoUrl }));

    if (cast.length > 0) {
      featured.push({
        seasonId: season.id,
        seasonSlug: board.season.slug,
        seasonName: board.season.name,
        status: season.status === 'ACTIVE' ? 'ACTIVE' : 'UPCOMING',
        startsAt: season.startDate,
        showName: season.show.name,
        showSlug: season.show.slug,
        cast,
      });
    }
  }
  return featured;
}
