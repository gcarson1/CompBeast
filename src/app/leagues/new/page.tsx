import Link from 'next/link';
import { CreateLeagueForm } from '@/components/LeagueForms';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function NewLeaguePage() {
  const [seasons, rulesets] = await Promise.all([
    prisma.season.findMany({
      orderBy: { year: 'desc' },
      select: { id: true, name: true, show: { select: { name: true } } },
    }),
    prisma.scoringRuleset.findMany({
      orderBy: { isDefault: 'desc' },
      select: { id: true, name: true, description: true, isDefault: true },
    }),
  ]);

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
