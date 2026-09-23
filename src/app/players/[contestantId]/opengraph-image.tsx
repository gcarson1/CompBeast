import { OG_SIZE, renderOgCard } from '@/lib/og/card';
import { eliminationLabel } from '@/lib/shows/lexicon';
import { themeFor } from '@/lib/shows/registry';
import { formatPoints } from '@/lib/ui';
import { getContestantProfile } from '@/server/queries';

export const runtime = 'nodejs';
export const alt = 'Fantasy points on Comp Beast';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: { contestantId: string } }) {
  const player = await getContestantProfile(params.contestantId);
  if (!player) {
    return renderOgCard({ eyebrow: 'Comp Beast', title: 'Player not found' });
  }
  return renderOgCard({
    theme: themeFor(player.season.show.slug),
    eyebrow: `${player.season.show.name} · ${player.season.name}`,
    title: player.name,
    subtitle: player.isActive
      ? `${player.showLexicon.activeLabel}.`
      : `${eliminationLabel(player.showLexicon, player.metadata)}${player.eliminatedCycle ? ` · ${player.eliminatedCycle.label}` : ''}.`,
    stats: [
      { value: formatPoints(player.totalPoints), label: 'fantasy points' },
      { value: String(player.events.length), label: 'scored events' },
      {
        value: String(player.gameLog.length),
        label: `${player.showLexicon.cyclePlural.toLowerCase()} scored`,
      },
    ],
  });
}
