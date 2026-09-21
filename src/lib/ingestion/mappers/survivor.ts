import type { SeasonMapper, SurvivorSeasonFacts } from '../types';
import { candidateCollector, collectPlayers, pushPlacementsAndJury, pushSurvival } from './shared';

/**
 * Turns parsed Survivor facts into candidate scoring events.
 *
 * The same discipline as the Big Brother mapper: only what an episode
 * results page states outright. Who found an idol, who orchestrated a
 * blindside, whether a vote was a majority — none of that is on a results
 * grid, so none of it is inferred here; those rules stay manual.
 *
 * No adapter produces `SurvivorSeasonFacts` yet. This mapper and that type
 * are the contract a Survivor results site has to be parsed into; once an
 * adapter exists it registers in pipeline.ts and nothing here changes.
 */
export const mapSurvivorSeason: SeasonMapper<SurvivorSeasonFacts> = (facts, seasonExternalId) => {
  const { candidates, push } = candidateCollector(seasonExternalId);

  const airedEpisodes = facts.weeks.filter((episode) => episode.aired);

  for (const episode of airedEpisodes) {
    const { weekNumber, weekLabel } = episode;

    // Two individual immunity winners in one episode is a split tribal or a
    // parsing artifact; a human should look before it scores.
    const multiImmunity = episode.immunity.length > 1;
    for (const player of episode.immunity) {
      push(
        'IMMUNITY_WIN',
        player,
        weekNumber,
        weekLabel,
        multiImmunity ? 'MEDIUM' : 'HIGH',
        multiImmunity ? [`${episode.immunity.length} immunity winners listed for ${weekLabel}`] : [],
      );
    }

    for (const player of episode.tribalImmunity) {
      push('TRIBAL_IMMUNITY_WIN', player, weekNumber, weekLabel);
    }

    for (const player of episode.reward) {
      push('REWARD_WIN', player, weekNumber, weekLabel);
    }

    for (const { player, negatedVotes } of episode.idolsPlayed) {
      push(negatedVotes ? 'IDOL_PLAYED_SUCCESSFULLY' : 'IDOL_PLAYED_WASTED', player, weekNumber, weekLabel);
    }

    // One candidate per vote received, so the ledger carries the count.
    for (const { player, count } of episode.votes) {
      for (let i = 1; i <= count; i += 1) {
        push('VOTE_RECEIVED', player, weekNumber, weekLabel, 'HIGH', [], String(i));
      }
    }

    const eliminatedIds = new Set(episode.eliminated.map((p) => p.externalId));
    const votedOutIds = new Set(episode.votes.filter((v) => v.count > 0).map((v) => v.player.externalId));

    const multiEliminated = episode.eliminated.length > 1;
    for (const player of episode.eliminated) {
      // Someone who left without a single vote against them was not voted
      // out — they quit, were evacuated, or were removed. Only a source that
      // records votes can tell the two apart, so an episode with no vote data
      // at all is flagged rather than assumed.
      const hasVoteData = episode.votes.length > 0;
      const wasVotedOut = votedOutIds.has(player.externalId);
      const code = hasVoteData && !wasVotedOut ? 'ELIMINATED_INVOLUNTARY' : 'VOTED_OUT';
      const reasons: string[] = [];
      let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';
      if (multiEliminated) {
        confidence = 'MEDIUM';
        reasons.push(`${episode.eliminated.length} eliminations listed for ${weekLabel}`);
      }
      if (!hasVoteData) {
        confidence = 'MEDIUM';
        reasons.push('No vote totals for this episode — could be a quit or evacuation');
      }
      push(code, player, weekNumber, weekLabel, confidence, reasons);

      // Every vote on one name is a unanimous boot, but only when the source
      // recorded the whole tribal.
      if (hasVoteData && wasVotedOut && episode.votes.every((v) => v.count === 0 || eliminatedIds.has(v.player.externalId))) {
        push('VOTED_OUT_UNANIMOUS', player, weekNumber, weekLabel);
      }
    }
  }

  const players = collectPlayers(facts, (episode) => [
    episode.immunity,
    episode.tribalImmunity,
    episode.reward,
    episode.idolsPlayed.map((i) => i.player),
    episode.votes.map((v) => v.player),
    episode.eliminated,
  ]);
  pushSurvival(facts, players, 'EPISODE_SURVIVED', push);
  pushPlacementsAndJury(facts, players, push);

  return candidates;
};
