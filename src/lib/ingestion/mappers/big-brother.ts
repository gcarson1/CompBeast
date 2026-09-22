import type { BigBrotherSeasonFacts, SeasonMapper } from '../types';
import {
  candidateCollector,
  collectPlayers,
  pushEvictionOrder,
  pushPlacementsAndJury,
  pushSurvival,
} from './shared';

/**
 * Turns parsed Big Brother facts into candidate scoring events.
 *
 * Only emits events the source states plainly. Things it cannot know from a
 * results grid — whether a veto was used on self or another, whether an
 * eviction was unanimous, who formed which alliance — are deliberately absent
 * and stay manual. Guessing at them would put fabricated points on real
 * scoreboards.
 */
export const mapBigBrotherSeason: SeasonMapper<BigBrotherSeasonFacts> = (facts, seasonExternalId) => {
  const { candidates, push } = candidateCollector(seasonExternalId);

  // Scoring a scheduled week would hand out survival points for a week
  // nobody has played yet.
  const airedWeeks = facts.weeks.filter((week) => week.aired);

  for (const week of airedWeeks) {
    const { weekNumber, weekLabel } = week;

    // A week with two HOHs is usually a double eviction or a parsing artifact.
    // Either way a human should look at it before it scores.
    const multiHoh = week.hoh.length > 1;
    for (const player of week.hoh) {
      push(
        'HOH_WIN',
        player,
        weekNumber,
        weekLabel,
        multiHoh ? 'MEDIUM' : 'HIGH',
        multiHoh ? [`${week.hoh.length} HOH winners listed for ${weekLabel}`] : [],
      );
    }

    const multiVeto = week.veto.length > 1;
    for (const player of week.veto) {
      push(
        'VETO_WIN',
        player,
        weekNumber,
        weekLabel,
        multiVeto ? 'MEDIUM' : 'HIGH',
        multiVeto ? [`${week.veto.length} veto winners listed for ${weekLabel}`] : [],
      );
    }

    const evictedIds = new Set(week.eliminated.map((p) => p.externalId));

    for (const player of week.nominees) {
      push('NOMINATED', player, weekNumber, weekLabel);
      push('ON_THE_BLOCK', player, weekNumber, weekLabel);

      // A nominee who was not evicted survived the block. The source does not
      // say whether the vote was unanimous, so SURVIVED_BLOCK_ZERO_VOTES is
      // never inferred here.
      if (!evictedIds.has(player.externalId)) {
        push('SURVIVED_BLOCK', player, weekNumber, weekLabel);
      }
    }

    const multiEvicted = week.eliminated.length > 1;
    for (const player of week.eliminated) {
      push(
        'EVICTED',
        player,
        weekNumber,
        weekLabel,
        multiEvicted ? 'MEDIUM' : 'HIGH',
        multiEvicted ? [`${week.eliminated.length} evictions listed for ${weekLabel}`] : [],
      );

      // Evicted without ever being nominated that week means a backdoor, but
      // it can equally mean the grid omitted a replacement nomination, so this
      // is flagged rather than trusted.
      if (!week.nominees.some((n) => n.externalId === player.externalId)) {
        const reasons = [
          "Evicted without appearing in that week's nominees — possible backdoor, or missing nomination data",
        ];
        push('EVICTED_BACKDOORED', player, weekNumber, weekLabel, 'LOW', reasons);
        // The same inference says they were put up after the veto. Lauren's
        // Way counts a replacement nomination as a nomination; like the
        // backdoor, it waits for a reviewer rather than scoring on a guess.
        push('REPLACEMENT_NOMINEE', player, weekNumber, weekLabel, 'LOW', reasons);
      }
    }
  }

  const players = collectPlayers(facts, (week) => [week.hoh, week.veto, week.nominees, week.eliminated]);
  pushSurvival(facts, players, 'WEEK_SURVIVED', push);
  pushPlacementsAndJury(facts, players, push);
  pushEvictionOrder(facts, players, 'EVICTION_ORDER', push);

  return candidates;
};
