import { PLACEMENT_CODE_BY_LABEL } from '../types';
import type { SeasonMapper, TraitorsSeasonFacts } from '../types';
import { candidateCollector, collectPlayers, pushSurvival } from './shared';

/**
 * Turns parsed The Traitors facts into candidate scoring events.
 *
 * The same discipline as the other mappers: only what the page states.
 * Shields, the murder shortlist, every Round Table ballot, who was murdered
 * and banished, who held a cloak and the end game are all in the tables, so
 * they score on their own. Powers (the dagger, the seer), alliances and the
 * episode title are not, and stay manual.
 */
export const mapTraitorsSeason: SeasonMapper<TraitorsSeasonFacts> = (facts, seasonExternalId) => {
  const { candidates, push } = candidateCollector(seasonExternalId);

  const airedEpisodes = facts.weeks.filter((episode) => episode.aired);

  for (const episode of airedEpisodes) {
    const { weekNumber, weekLabel } = episode;

    for (const player of episode.newTraitors) push('BECAME_TRAITOR', player, weekNumber, weekLabel);
    for (const player of episode.shields) push('SHIELD_WON', player, weekNumber, weekLabel);
    for (const player of episode.shortlisted) push('MURDER_SHORTLISTED', player, weekNumber, weekLabel);

    // Every Traitor in the game shares each murder; a double murder is two.
    episode.murderers.forEach((traitors, i) => {
      for (const traitor of traitors) {
        push('MURDER_COMMITTED', traitor, weekNumber, weekLabel, 'HIGH', [], String(i + 1));
      }
    });

    // One candidate per vote received, so the ledger carries the count; a
    // second round of voting (a tie, the end game) is its own ballot.
    // Keys are stable across re-syncs: a vote received is numbered per target,
    // a vote cast by its round (a voter casts one ballot a round).
    const received = new Map<string, number>();
    for (const ballot of episode.ballots) {
      const count = (received.get(ballot.target.externalId) ?? 0) + 1;
      received.set(ballot.target.externalId, count);
      push('VOTE_RECEIVED', ballot.target, weekNumber, weekLabel, 'HIGH', [], String(count));
      const round = `r${ballot.round}`;
      if (ballot.banished)
        push('VOTED_WITH_BANISHMENT', ballot.voter, weekNumber, weekLabel, 'HIGH', [], round);
      if (ballot.caughtTraitor)
        push('CAUGHT_A_TRAITOR', ballot.voter, weekNumber, weekLabel, 'HIGH', [], round);
    }

    for (const player of episode.murdered) push('MURDERED', player, weekNumber, weekLabel);
    for (const player of episode.banished) push('BANISHED', player, weekNumber, weekLabel);
    const gone = new Set([...episode.murdered, ...episode.banished].map((p) => p.externalId));
    for (const player of episode.eliminated) {
      if (!gone.has(player.externalId)) push('ELIMINATED_INVOLUNTARY', player, weekNumber, weekLabel);
    }
  }

  const players = collectPlayers(facts, (episode) => [
    episode.shields,
    episode.ballots.map((b) => b.voter),
    episode.eliminated,
  ]);
  pushSurvival(facts, players, 'EPISODE_SURVIVED', push);

  // The end game and the finish, pinned to the last aired episode.
  const finale = airedEpisodes.at(-1);
  if (finale) {
    for (const player of facts.endGame) {
      push('REACHED_END_GAME', player, finale.weekNumber, finale.weekLabel);
    }
    for (const entry of facts.placements) {
      const code = PLACEMENT_CODE_BY_LABEL[entry.placeLabel.trim().toLowerCase()];
      // Winners and the runner-up only: The Traitors has no third place to speak of.
      if (code === 'PLACEMENT_WINNER' || code === 'PLACEMENT_RUNNER_UP') {
        push(code, entry.player, finale.weekNumber, finale.weekLabel);
      }
    }
  }

  return candidates;
};
