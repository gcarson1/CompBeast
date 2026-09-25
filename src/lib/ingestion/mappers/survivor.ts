import type { SeasonMapper, SurvivorSeasonFacts } from '../types';
import {
  candidateCollector,
  collectPlayers,
  pushJury,
  pushPlacements,
  pushSurvival,
  settledCycles,
} from './shared';

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

    // Two immunity winners in one episode is a split tribal council, which
    // the source states as plainly as a single one — no review needed. (The
    // Big Brother mapper flags a double HOH because its grid can only mean
    // that or a misread; a Survivor summary row is one group's result.)
    for (const player of episode.immunity) {
      push('IMMUNITY_WIN', player, weekNumber, weekLabel);
    }

    for (const player of episode.tribalImmunity) {
      push('TRIBAL_IMMUNITY_WIN', player, weekNumber, weekLabel);
    }

    for (const player of episode.reward) {
      push('REWARD_WIN', player, weekNumber, weekLabel);
    }

    for (const player of episode.tribalReward) {
      push('TRIBAL_REWARD_WIN', player, weekNumber, weekLabel);
    }

    for (const player of episode.correctVoters) {
      push('VOTED_WITH_MAJORITY', player, weekNumber, weekLabel);
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
    // Two departures in one episode is a split tribal or a double boot,
    // each in its own voting-history column; the source is not guessing and
    // neither is this.
    for (const { player, how } of episode.exits) {
      switch (how) {
        case 'voted':
          push('VOTED_OUT', player, weekNumber, weekLabel);
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
          // Losing fire at final four is a fourth-place finish, which the
          // placement already says; there is no penalty on top.
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
    episode.tribalReward,
    episode.idolsPlayed.map((i) => i.player),
    episode.votes.map((v) => v.player),
    episode.eliminated,
  ]);
  // An episode is over at its tribal council. One whose row has its
  // challenges but not yet its vote is still being written up.
  const settled = settledCycles(facts, (episode) =>
    episode.exits.some((exit) => exit.how === 'voted' || exit.how === 'fire'),
  );
  pushSurvival(facts, players, 'EPISODE_SURVIVED', push, settled);
  pushJury(facts, players, push);
  pushPlacements(facts, push);

  // The final tribal council: the jury table names the finalists and how
  // many votes each drew. Pinned to the last aired episode, like placements.
  const finale = airedEpisodes.at(-1);
  if (finale && facts.juryVotes.length > 0) {
    for (const { player, count } of facts.juryVotes) {
      push('MADE_FINAL_TRIBAL', player, finale.weekNumber, finale.weekLabel);
      for (let i = 1; i <= count; i += 1) {
        push('JURY_VOTE_RECEIVED', player, finale.weekNumber, finale.weekLabel, 'HIGH', [], String(i));
      }
    }
  }

  return candidates;
};
