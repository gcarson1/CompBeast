import Link from 'next/link';
import { CreateLeagueForm } from '@/components/LeagueForms';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function NewLeaguePage() {
  const [seasons, rulesets] = await Promise.all([
    prisma.season.findMany({
      // Finished seasons are archive-only — their whole cast is already known.
      where: { status: { in: ['UPCOMING', 'ACTIVE'] } },
      orderBy: { year: 'desc' },
      select: { id: true, name: true, show: { select: { name: true } } },
    }),
    prisma.scoringRuleset.findMany({
      orderBy: { isDefault: 'desc' },
      select: { id: true, name: true, description: true, isDefault: true },
    }),
  ]);

  if (seasons.length === 0) {
    return (
      <div className="pt-2">
        <Link href="/leagues" className="text-[13px] text-muted">
          ← Leagues
        </Link>
        <div className="card mt-6 p-6 text-center">
          <h1 className="text-[17px] font-semibold">No seasons open</h1>
          <p className="mt-1 text-[13px] text-muted">
            Every season we have data for has already finished. You can still browse their results.
          </p>
          <Link href="/seasons" className="btn-primary mt-4 inline-flex">
            Browse seasons
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-2">
      <Link href="/leagues" className="text-[13px] text-muted">
        ← Leagues
      </Link>
      <h1 className="mb-5 mt-2 text-[26px] font-semibold tracking-tight">Create a league</h1>
      <CreateLeagueForm
        seasons={seasons.map((s) => ({ id: s.id, name: s.name, showName: s.show.name }))}
        rulesets={rulesets}
      />
    </div>
  );
}
