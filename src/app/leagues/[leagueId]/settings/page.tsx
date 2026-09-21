import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { DeleteLeaguePanel, LeagueSettingsForm } from '@/components/LeagueSettingsForm';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function LeagueSettingsPage({ params }: { params: { leagueId: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/leagues');

  const league = await prisma.league.findUnique({
    where: { id: params.leagueId },
    select: {
      id: true,
      name: true,
      commissionerId: true,
      scoringRulesetId: true,
      rosterSize: true,
      maxTeams: true,
      isPublic: true,
      lockOffsetMinutes: true,
      chatWebhookUrl: true,
      draftStatus: true,
      season: { select: { showId: true, name: true, show: { select: { name: true } } } },
      _count: { select: { teams: true, members: true } },
    },
  });
  if (!league) notFound();

  // Commissioner-only, checked here as well as in the mutation. Rendering the
  // delete panel to someone who cannot use it is its own kind of bug.
  if (league.commissionerId !== user.id) redirect(`/leagues/${league.id}`);

  const rulesets = await prisma.scoringRuleset.findMany({
    // Same show only — a ruleset from another show has no event definitions
    // this season's cast can score against.
    where: { showId: league.season.showId },
    orderBy: { isDefault: 'desc' },
    select: { id: true, name: true, description: true },
  });

  return (
    <div className="pt-2">
      <Link href={`/leagues/${league.id}`} className="text-xs text-muted">
        ← {league.name}
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">League settings</h1>
      <p className="mb-6 mt-0.5 text-xs text-muted">
        {league.season.show.name} · {league.season.name}
      </p>

      <LeagueSettingsForm
        values={{
          leagueId: league.id,
          name: league.name,
          scoringRulesetId: league.scoringRulesetId,
          rosterSize: league.rosterSize,
          maxTeams: league.maxTeams,
          isPublic: league.isPublic,
          lockOffsetMinutes: league.lockOffsetMinutes,
          chatWebhookUrl: league.chatWebhookUrl,
          draftStarted: league.draftStatus !== 'NOT_STARTED',
          teamCount: league._count.teams,
        }}
        rulesets={rulesets}
      />

      <DeleteLeaguePanel leagueId={league.id} leagueName={league.name} memberCount={league._count.members} />
    </div>
  );
}
