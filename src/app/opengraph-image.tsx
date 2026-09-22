import { OG_SIZE, renderOgCard } from '@/lib/og/card';
import { LEAGUE_LIMITS } from '@/lib/validation';

export const runtime = 'nodejs';
export const alt = 'Comp Beast — free fantasy leagues for reality competition TV';
export const size = OG_SIZE;
export const contentType = 'image/png';

/** The site-wide card: every page without a more specific one shares it. */
export default async function Image() {
  return renderOgCard({
    eyebrow: 'Free fantasy leagues for reality TV',
    title: 'Draft the cast. Own the leaderboard.',
    subtitle:
      'Snake-draft the real cast of Big Brother or Survivor with friends, score every comp win, blindside and elimination as episodes air, and chase a live leaderboard all season.',
    stats: [
      { value: `${LEAGUE_LIMITS.minTeams}–${LEAGUE_LIMITS.maxTeams}`, label: 'teams per league' },
      { value: '3', label: 'scoring rulesets' },
      { value: 'Free', label: 'to play' },
    ],
  });
}
