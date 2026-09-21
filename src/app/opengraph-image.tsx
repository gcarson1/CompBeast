import { OG_SIZE, renderOgCard } from '@/lib/og/card';
import { LEAGUE_LIMITS } from '@/lib/validation';

export const runtime = 'nodejs';
export const alt = 'Comp Beast — free fantasy leagues for Big Brother';
export const size = OG_SIZE;
export const contentType = 'image/png';

/** The site-wide card: every page without a more specific one shares it. */
export default async function Image() {
  return renderOgCard({
    eyebrow: 'Free fantasy leagues for Big Brother',
    title: 'Draft the house. Own the leaderboard.',
    subtitle:
      'Snake-draft real houseguests with friends, score every HOH, veto, nomination and eviction as episodes air, and chase a live leaderboard all season.',
    stats: [
      { value: `${LEAGUE_LIMITS.minTeams}–${LEAGUE_LIMITS.maxTeams}`, label: 'teams per league' },
      { value: '3', label: 'scoring rulesets' },
      { value: 'Free', label: 'to play' },
    ],
  });
}
