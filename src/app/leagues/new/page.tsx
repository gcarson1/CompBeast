import Link from 'next/link';
import { CreateLeagueForm } from '@/components/LeagueForms';
import { prisma } from '@/lib/db';
import { FLAGSHIP_SHOW_SLUG } from '@/lib/shows/registry';

export const dynamic = 'force-dynamic';

export default async function NewLeaguePage({ searchParams }: { searchParams: { season?: string } }) {
  const [found, rulesets] = await Promise.all([
    prisma.season.findMany({
      // Finished seasons are archive-only — their whole cast is already known.
      where: { status: { in: ['UPCOMING', 'ACTIVE'] } },
      orderBy: { year: 'desc' },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        show: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.scoringRuleset.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, showId: true, name: true, description: true, isDefault: true },
    }),
  ]);

  // The flagship show first and the rest by name, each show's seasons
  // together: on air before upcoming, a demo season last.
  const rank = (s: (typeof found)[number]) =>
    (s.status === 'ACTIVE' ? 0 : 1) + (s.slug.startsWith('demo-') ? 2 : 0);
  const seasons = [...found].sort(
    (a, b) =>
      Number(b.show.slug === FLAGSHIP_SHOW_SLUG) - Number(a.show.slug === FLAGSHIP_SHOW_SLUG) ||
      a.show.name.localeCompare(b.show.name) ||
      rank(a) - rank(b),
  );

  if (seasons.length === 0) {
    return (
      <div className="pt-2">
        <Link href="/leagues" className="text-xs text-muted">
          ← Leagues
        </Link>
        <div className="mt-6">
          <h1 className="headline text-4xl">No seasons open</h1>
          <p className="mt-2 max-w-measure text-xs leading-relaxed text-muted">
            Every season we have data for has already finished. You can still browse their results.
          </p>
          <Link href="/seasons" className="btn-primary mt-4">
            Browse seasons
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="stage pt-2">
      <Link href="/leagues" className="text-xs text-muted">
        ← Leagues
      </Link>
      <h1 className="headline mb-6 mt-3 text-4xl">Create a league</h1>
      <CreateLeagueForm
        seasons={seasons.map((s) => ({ id: s.id, name: s.name, showId: s.show.id, showName: s.show.name }))}
        rulesets={rulesets}
        defaultSeasonId={seasons.find((s) => s.slug === searchParams.season)?.id}
      />
    </div>
  );
}
