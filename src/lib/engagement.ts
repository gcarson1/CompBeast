// Comp Beast — Hook-Model engagement triggers
//
// Pure, data-in/message-out functions (no Prisma, no fetch) so they unit test
// like the rest of src/lib/. Callers pass in whatever shape they already have
// from src/server/queries.ts — these types are structural, not imported, to
// avoid a lib -> server import for what is otherwise a leaf module.

import { lower, type ShowLexicon } from './shows/lexicon';

export interface RankedTeam {
  teamId: string;
  teamName: string;
  rank: number;
  totalPoints: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Near-miss framing: only fires within a few points of the team directly
 * ahead, and only names 1st place once you're actually chasing it — a 40th
 * place team "chasing" 39th isn't the hook the blueprint is after.
 */
export function nearMissMessage(rows: RankedTeam[], myTeamId: string, threshold = 5): string | null {
  const mine = rows.find((r) => r.teamId === myTeamId);
  if (!mine || mine.rank <= 1) return null;

  const ahead = rows.filter((r) => r.rank < mine.rank).sort((a, b) => b.rank - a.rank)[0]; // the team immediately above (highest rank number that's still < mine)
  if (!ahead) return null;

  const gap = round2(ahead.totalPoints - mine.totalPoints);
  if (gap <= 0 || gap > threshold) return null;

  const pts = gap === 1 ? 'point' : 'points';
  const target = ahead.rank === 1 ? '1st place' : ahead.teamName;
  return `You're ${gap} ${pts} from ${target}.`;
}

/**
 * Event codes that mean "at risk of elimination this cycle" for the
 * loss-aversion banner. `getTeamAtRiskNames` in src/server/queries.ts is the
 * one reader. Big Brother is the only show with a mid-cycle danger signal —
 * nominations — so the codes are its; a show without one simply never fires
 * the banner.
 */
export const AT_RISK_EVENT_CODES = ['NOMINATED', 'ON_THE_BLOCK', 'REPLACEMENT_NOMINEE'] as const;

/**
 * Loss aversion framing for the contestants a team has at risk this cycle,
 * in the show's own words. Takes already-deduped names (a houseguest
 * nominated then backdoored should only be counted once) so this stays a
 * pure formatter.
 */
export function atRiskMessage(names: string[], lexicon: ShowLexicon): string | null {
  if (names.length === 0) return null;
  const cycle = lower(lexicon.cycleSingular);
  if (names.length === 1) return `${names[0]} is ${lexicon.atRiskLabel} this ${cycle}.`;
  return `${names.length} of your ${lower(lexicon.contestantPlural)} are ${lexicon.atRiskLabel} this ${cycle}.`;
}
