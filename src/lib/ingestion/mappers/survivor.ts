import type { SeasonMapper, SurvivorSeasonFacts } from '../types';
import { candidateCollector, collectPlayers, pushPlacementsAndJury, pushSurvival } from './shared';

/**
 * Turns parsed Survivor facts into candidate scoring events.
 *
 * The same discipline as the Big Brother mapper: only what an episode
 * results page states outright. Who found an idol, who orchestrated a
 * blindside, whether a vote was a majority — none of that is on a results
 * grid, so none of it is inferred here; those rules stay manual.
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

    if (episode.fireMakingWinner) {
      push('FIRE_MAKING_WIN', episode.fireMakingWinner, weekNumber, weekLabel);
    }

    const votedIds = new Set(episode.exits.filter((e) => e.how === 'voted').map((e) => e.player.externalId));
    const multiExit = episode.exits.length > 1;
    for (const { player, how } of episode.exits) {
      const reasons: string[] = [];
      let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';
      if (multiExit && how === 'voted') {
        // A double boot is real and common, but so is a parse that read one
        // tribal as two; a human glance settles it.
        confidence = 'MEDIUM';
        reasons.push(`${episode.exits.length} departures listed for ${weekLabel}`);
      }

      switch (how) {
        case 'voted':
          push('VOTED_OUT', player, weekNumber, weekLabel, confidence, reasons);
          // Every vote cast landed on them: unanimous. Only when the votes
          // are on the page — an empty tally proves nothing.
          if (
            episode.votes.length > 0 &&
            votedIds.size === 1 &&
            episode.votes.every((v) => v.count === 0 || v.player.externalId === player.externalId)
          ) {
            push('VOTED_OUT_UNANIMOUS', player, weekNumber, weekLabel);
          }
          break;
        case 'fire':
          push('FIRE_MAKING_LOSS', player, weekNumber, weekLabel);
          break;
        case 'evacuated':
        case 'quit':
          push('ELIMINATED_INVOLUNTARY', player, weekNumber, weekLabel);
          break;
        default:
          push('VOTED_OUT', player, weekNumber, weekLabel, 'LOW', [
            `The source does not say how ${player.name} left in ${weekLabel}`,
          ]);
      }
    }
  }

  // Making the merge is stated by the page: the first episode played as one
  // tribe, and everyone not yet gone when it began.
  if (facts.mergeEpisode !== null) {
    const mergeEpisode = airedEpisodes.find((e) => e.weekNumber === facts.mergeEpisode);
    if (mergeEpisode) {
      const goneBefore = new Set(
        airedEpisodes
          .filter((e) => e.weekNumber < mergeEpisode.weekNumber)
          .flatMap((e) => e.eliminated.map((p) => p.externalId)),
      );
      const everyone = collectPlayers(facts, (e) => [
        e.immunity,
        e.tribalImmunity,
        e.reward,
        e.votes.map((v) => v.player),
        e.eliminated,
      ]);
      for (const [id, player] of everyone) {
        if (!goneBefore.has(id)) push('MADE_MERGE', player, mergeEpisode.weekNumber, mergeEpisode.weekLabel);
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
