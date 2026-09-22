import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Avatar } from '@/components/Avatar';
import { JsonLd } from '@/components/JsonLd';
import { PlayerTabs } from '@/components/PlayerTabs';
import { ShowTheme } from '@/components/ShowTheme';
import { Sticker } from '@/components/Sticker';
import { getCurrentUser } from '@/lib/auth';
import { absoluteUrl, breadcrumbList } from '@/lib/seo';
import { eliminationLabel, lower } from '@/lib/shows/lexicon';
import { formatPoints } from '@/lib/ui';
import { getContestantLeaguesForViewer, getContestantProfile } from '@/server/queries';

export const dynamic = 'force-dynamic';

// Shared between `generateMetadata` and the render via React's per-request
// cache — one profile query per request. No loading boundary sits above
// this route, so an unknown id is a real 404 (see the season page).
const loadPlayer = cache((contestantId: string) => getContestantProfile(contestantId));

export async function generateMetadata({ params }: { params: { contestantId: string } }): Promise<Metadata> {
  const player = await loadPlayer(params.contestantId);
  if (!player) notFound();

  const status = lower(
    player.isActive ? player.showLexicon.activeLabel : eliminationLabel(player.showLexicon, player.metadata),
  );
  return {
    title: `${player.name} — ${player.season.name} fantasy points`,
    description: `${player.name}'s Comp Beast fantasy scoring on ${player.season.name} (${player.season.show.name}): ${formatPoints(
      player.totalPoints,
    )} points from ${player.events.length} scored ${player.events.length === 1 ? 'event' : 'events'}, ${status}.`,
    alternates: { canonical: absoluteUrl(`/players/${player.id}`) },
  };
}

export default async function PlayerPage({ params }: { params: { contestantId: string } }) {
  const [player, user] = await Promise.all([loadPlayer(params.contestantId), getCurrentUser()]);
  if (!player) notFound();

  const meta = player.metadata as { occupation?: string; hometown?: string; age?: number } | null;
  // Only what the source actually knows. Ingested casts often arrive with
  // none of these, and a row of three dashes reads as a page that broke.
  const facts = [
    meta?.age ? { label: 'Age', value: String(meta.age) } : null,
    meta?.hometown ? { label: 'From', value: meta.hometown.split(',')[0] } : null,
    meta?.occupation ? { label: 'Job', value: meta.occupation } : null,
  ].filter((fact): fact is { label: string; value: string } => fact !== null);
  // The viewer's own leagues only — this page is public and indexed.
  const leagues = await getContestantLeaguesForViewer(player.id, user?.id ?? null);
  const lexicon = player.showLexicon;

  return (
    <ShowTheme showSlug={player.season.show.slug}>
      <div className="pt-2">
        <JsonLd
          data={breadcrumbList([
            { name: 'Seasons', path: '/seasons' },
            { name: player.season.name, path: `/seasons/${player.season.slug}` },
            { name: player.name, path: `/players/${player.id}` },
          ])}
        />
        {/* Screen 1: who they are and what they have scored. */}
        <div className="screen">
          <Link href={`/seasons/${player.season.slug}`} className="text-xs text-muted">
            ← {player.season.name}
          </Link>

          <header className="relative mt-4 flex items-center gap-4">
            <Avatar name={player.name} photoUrl={player.photoUrl} size={72} dimmed={!player.isActive} />
            <div className="min-w-0 flex-1">
              <h1 className="headline truncate text-4xl">{player.name}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <Sticker tone={player.isActive ? 'mint' : 'ink'} size="sm">
                  {player.isActive
                    ? lexicon.activeLabel
                    : `${eliminationLabel(lexicon, player.metadata)} · ${player.eliminatedCycle?.label ?? '—'}`}
                </Sticker>
                <span className="truncate">
                  {player.season.show.name} · {player.season.name}
                </span>
              </p>
            </div>
          </header>

          <div className="card-pop-gold relative mt-6 p-5">
            <p className="text-2xs font-bold uppercase tracking-wide text-tile-muted">Season points</p>
            <p className="mt-1 font-display text-6xl leading-none tracking-wide">
              {formatPoints(player.totalPoints)}
            </p>
            {facts.length > 0 && (
              <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-tile-line pt-4">
                {facts.map((fact) => (
                  <Fact key={fact.label} label={fact.label} value={fact.value} />
                ))}
              </dl>
            )}
          </div>
        </div>

        {/* Screen 2: the detail, behind tabs. */}
        <div className="screen pt-2">
          <PlayerTabs
            events={player.events}
            gameLog={player.gameLog}
            leagues={leagues}
            signedIn={Boolean(user)}
            lexicon={lexicon}
          />
        </div>
      </div>
    </ShowTheme>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs font-bold uppercase tracking-wide text-tile-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold">{value}</dd>
    </div>
  );
}
