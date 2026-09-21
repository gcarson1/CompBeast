import { OG_SIZE, renderOgCard } from '@/lib/og/card';
import { formatPoints } from '@/lib/ui';
import { getSeasonScoreboard } from '@/server/queries';

export const runtime = 'nodejs';
export const alt = 'Season fantasy scores on Comp Beast';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: { slug: string } }) {
  const data = await getSeasonScoreboard(params.slug);
  if (!data) {
    return renderOgCard({ eyebrow: 'Comp Beast', title: 'Season not found' });
  }
  const { season, players } = data;
  const live = season.status !== 'COMPLETED';
  const leader = players[0];
  return renderOgCard({
    eyebrow: `${season.showName} · ${season.year} · ${live ? 'airing now' : 'finished'}`,
    title: season.name,
    subtitle: `Every houseguest ranked by fantasy points${live ? ' as the season airs' : ', beside where they actually placed'}.`,
    stats: [
      { value: String(players.length), label: 'houseguests' },
      ...(leader
        ? [{ value: formatPoints(leader.points), label: `${leader.name.split(' ')[0]} leads` }]
        : []),
      {
        value: String(players.filter((p) => p.isActive).length),
        label: live ? 'still in the house' : 'made the finale',
      },
    ],
  });
}
