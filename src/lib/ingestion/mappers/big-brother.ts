import type { CandidateEvent, Confidence, RawPlayerRef, RawSeasonFacts } from '../types';

/**
 * Turns parsed Big Brother facts into candidate scoring events.
 *
 * Only emits events the source states plainly. Things it cannot know from a
 * results grid — whether a veto was used on self or another, whether an
 * eviction was unanimous, who formed which alliance — are deliberately absent
 * and stay manual. Guessing at them would put fabricated points on real
 * scoreboards.
 */

interface MapOptions {
  /** Place labels at or above this finish are treated as having made jury. */
  jurySize?: number;
}

const PLACEMENT_BY_LABEL: Record<string, string> = {
  winner: 'PLACEMENT_WINNER',
  'runner-up': 'PLACEMENT_RUNNER_UP',
  'runner up': 'PLACEMENT_RUNNER_UP',
  '2nd place': 'PLACEMENT_RUNNER_UP',
  '3rd place': 'PLACEMENT_THIRD',
};

function ref(
  seasonExternalId: string,
  weekLabel: string,
  code: string,
  player: RawPlayerRef,
): string {
  return `${seasonExternalId}:${weekLabel.toLowerCase()}:${code}:${player.externalId}`;
}

export function mapBigBrotherSeason(
  facts: RawSeasonFacts,
  seasonExternalId: string,
  options: MapOptions = {},
): CandidateEvent[] {
  const { jurySize = 9 } = options;
  const candidates: CandidateEvent[] = [];

  const push = (
    code: string,
    player: RawPlayerRef,
    weekNumber: number | null,
    weekLabel: string,
    confidence: Confidence = 'HIGH',
    reasons: string[] = [],
  ) => {
    candidates.push({
      sourceRef: ref(seasonExternalId, weekLabel, code, player),
      eventCode: code,
      player,
      weekNumber,
      weekLabel,
      confidence,
      reasons,
    });
  };

  // Everyone who appears anywhere in the season, so "survived the week" can be
  // derived without assuming the cast list is complete.
  const evictedByWeek = new Map<number, Set<string>>();
  for (const week of facts.weeks) {
    evictedByWeek.set(week.weekNumber, new Set(week.evicted.map((p) => p.externalId)));
  }

  for (const week of facts.weeks) {
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

    const evictedIds = new Set(week.evicted.map((p) => p.externalId));

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

    const multiEvicted = week.evicted.length > 1;
    for (const player of week.evicted) {
      push(
        'EVICTED',
        player,
        weekNumber,
        weekLabel,
        multiEvicted ? 'MEDIUM' : 'HIGH',
        multiEvicted ? [`${week.evicted.length} evictions listed for ${weekLabel}`] : [],
      );

      // Evicted without ever being nominated that week means a backdoor, but
      // it can equally mean the grid omitted a replacement nomination, so this
      // is flagged rather than trusted.
      if (!week.nominees.some((n) => n.externalId === player.externalId)) {
        push('EVICTED_BACKDOORED', player, weekNumber, weekLabel, 'LOW', [
          'Evicted without appearing in that week\'s nominees — possible backdoor, or missing nomination data',
        ]);
      }
    }
  }

  // "Survived the week" for everyone still in the house at the end of a week.
  const allPlayers = new Map<string, RawPlayerRef>();
  for (const member of facts.cast) allPlayers.set(member.externalId, member);
  for (const week of facts.weeks) {
    for (const column of [week.hoh, week.veto, week.nominees, week.evicted]) {
      for (const player of column) if (!allPlayers.has(player.externalId)) allPlayers.set(player.externalId, player);
    }
  }

  const gone = new Set<string>();
  for (const week of [...facts.weeks].sort((a, b) => a.weekNumber - b.weekNumber)) {
    for (const player of week.evicted) gone.add(player.externalId);
    for (const [externalId, player] of allPlayers) {
      if (gone.has(externalId)) continue;
      push('WEEK_SURVIVED', player, week.weekNumber, week.weekLabel);
    }
  }

  // Final placements, from the eviction order table.
  const finalWeek = facts.weeks.at(-1);
  const finalWeekLabel = finalWeek?.weekLabel ?? 'season';
  const finalWeekNumber = finalWeek?.weekNumber ?? null;

  for (const entry of facts.evictionOrder) {
    const code = PLACEMENT_BY_LABEL[entry.placeLabel.trim().toLowerCase()];
    if (code) {
      push(code, entry.player, finalWeekNumber, finalWeekLabel);
    }

    if (entry.order <= jurySize) {
      push('REACHED_JURY', entry.player, finalWeekNumber, finalWeekLabel, 'MEDIUM', [
        `Inferred from finishing ${entry.order} of ${facts.evictionOrder.length}; jury size assumed to be ${jurySize}`,
      ]);
    }
  }

  return candidates;
}
