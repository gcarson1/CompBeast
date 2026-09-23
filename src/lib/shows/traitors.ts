import type { EventDefinitionSpec, RulesetSpec } from './spec';

/**
 * The Traitors rule catalogue (the American edition, on Peacock and NBC).
 *
 * Same contract as survivor.ts: the only place the show's rules are
 * expressed, installed by the seed and the build, imported by nothing else.
 * Codes that mean the same thing on every show — a vote received, surviving
 * an episode, the placements, the social events — reuse the existing names
 * so cross-show surfaces can look a concept up by code.
 *
 * The shape follows the game. A Faithful scores by lasting, by voting the
 * way the castle goes and above all by catching a Traitor; a Traitor scores
 * by being chosen, by every murder made while they hold the cloak, and by
 * surviving the Round Table; everyone scores for a shield and pays for the
 * votes against them. A murder costs less than a banishment: being murdered
 * is the Traitors' choice, being banished is the castle's verdict on your
 * game. The end game and the win are milestones worth a few good weeks, not
 * a season.
 *
 * The values were measured against seasons 1 to 4 (`traitors-model.test.ts`).
 * The first pass, with a +5 cloak and +2 a murder, made a Traitor worth two
 * to four Faithfuls — and a draft happens before anyone knows who the
 * Traitors are, so that is a lottery, not a game. With the cloak at +3, a
 * murder at +1 and catching a Traitor at +5, a Traitor averages 1.2–1.5× a
 * Faithful (season 1, where the Faithful almost never caught one, is the
 * outlier), fantasy rank tracks the real finish at ρ ≈ 0.9–0.95, the finale
 * is a quarter to a third of a winner's points, and the team that drafted a
 * winner takes a random four-team league 31–52% of the time.
 */

export const TRAITORS_EVENTS: EventDefinitionSpec[] = [
  // --- Missions & the Round Table -------------------------------------------
  {
    code: 'SHIELD_WON',
    label: 'Win a shield',
    category: 'COMPETITION_GAMEPLAY',
    points: 4,
    balancedPoints: 3,
    description: "Won a shield in the day's mission — safe from murder that night.",
  },
  {
    code: 'CAUGHT_A_TRAITOR',
    label: 'Vote out a Traitor',
    category: 'COMPETITION_GAMEPLAY',
    points: 5,
    balancedPoints: 3,
    description: 'Your Round Table vote landed on a Traitor who was banished.',
  },
  {
    code: 'VOTED_WITH_BANISHMENT',
    label: 'Vote with the banishment',
    category: 'COMPETITION_GAMEPLAY',
    points: 2,
    description: 'Your Round Table vote landed on the player who was banished.',
  },
  {
    code: 'VOTE_RECEIVED',
    label: 'Receive a banishment vote',
    category: 'COMPETITION_GAMEPLAY',
    points: -1,
    description: 'A vote cast against you at the Round Table. Scored once per vote.',
  },
  {
    code: 'MURDER_SHORTLISTED',
    label: 'Make the murder shortlist',
    category: 'COMPETITION_GAMEPLAY',
    points: -1,
    description: 'Named on the Traitors’ shortlist of who to murder next.',
  },
  {
    code: 'BECAME_TRAITOR',
    label: 'Chosen as a Traitor',
    category: 'COMPETITION_GAMEPLAY',
    points: 3,
    balancedPoints: 2,
    description: 'Given a cloak — picked as a Traitor at the start, or recruited later.',
  },
  {
    code: 'MURDER_COMMITTED',
    label: 'Share in a murder',
    category: 'COMPETITION_GAMEPLAY',
    points: 1,
    description: 'A Faithful was murdered while you were a Traitor. Scored for every Traitor in the game.',
  },
  {
    code: 'POWER_WON',
    label: 'Win a dagger, seer or other power',
    category: 'COMPETITION_GAMEPLAY',
    points: 4,
    description: 'Earned a game-altering power such as the dagger or the seer.',
  },

  // --- Murder, banishment & the end game ------------------------------------
  {
    code: 'EPISODE_SURVIVED',
    label: 'Survive the episode',
    category: 'ELIMINATION_ENDGAME',
    points: 2,
    isPerCycleAward: true,
    description: 'Still in the castle at the end of the episode. Awarded automatically.',
  },
  {
    code: 'MURDERED',
    label: 'Murdered',
    category: 'ELIMINATION_ENDGAME',
    points: -3,
    isRepeatable: false,
    description: 'Murdered by the Traitors in the night.',
  },
  {
    code: 'BANISHED',
    label: 'Banished',
    category: 'ELIMINATION_ENDGAME',
    points: -4,
    isRepeatable: false,
    description: 'Voted out at the Round Table or in the end game.',
  },
  {
    code: 'ELIMINATED_INVOLUNTARY',
    label: 'Left the game',
    category: 'ELIMINATION_ENDGAME',
    points: -3,
    isRepeatable: false,
    description: 'Walked out, or left for any reason other than murder or banishment.',
  },
  {
    code: 'REACHED_END_GAME',
    label: 'Reach the end game',
    category: 'ELIMINATION_ENDGAME',
    points: 8,
    balancedPoints: 5,
    isRepeatable: false,
    description: 'Made it to the final fire-side vote.',
  },
  {
    code: 'PLACEMENT_WINNER',
    label: 'Win the season',
    category: 'ELIMINATION_ENDGAME',
    points: 15,
    balancedPoints: 8,
    isRepeatable: false,
    description: 'Took home the prize — alone as a Traitor, or split among the Faithful who made it.',
  },
  {
    code: 'PLACEMENT_RUNNER_UP',
    label: 'Finish runner-up',
    category: 'ELIMINATION_ENDGAME',
    points: 6,
    balancedPoints: 4,
    isRepeatable: false,
    description: 'Made the end game as a Faithful and watched a Traitor take the pot.',
  },

  // --- Social & drama ------------------------------------------------------
  {
    code: 'EPISODE_TITLE_QUOTE',
    label: 'Say the episode title',
    category: 'SOCIAL_DRAMA',
    points: 2,
    description: 'The episode is named after something you said.',
  },
  {
    code: 'ALLIANCE_FORMED',
    label: 'Form a named alliance',
    category: 'SOCIAL_DRAMA',
    points: 2,
    description: 'Founded an alliance that got a name on the broadcast.',
  },
  {
    code: 'CONFRONTATION_WIN',
    label: 'Win a Round Table showdown',
    category: 'SOCIAL_DRAMA',
    points: 3,
    description: 'Came out on top of an accusation or a blowup at the Round Table.',
  },
  {
    code: 'CRIED',
    label: 'Cry on camera',
    category: 'SOCIAL_DRAMA',
    points: -1,
    description: 'Cried on the broadcast.',
  },
];

export const TRAITORS_RULESETS: RulesetSpec[] = [
  {
    slug: 'classic-measurable',
    name: 'Classic',
    description:
      'Shields, Round Table votes, murders, banishments and the end game only. Everything is verifiable from the broadcast, so there is nothing for the league to argue about.',
    isDefault: true,
    categories: ['COMPETITION_GAMEPLAY', 'ELIMINATION_ENDGAME'],
    useBalancedPoints: false,
  },
  {
    slug: 'balanced-measurable',
    name: 'Balanced',
    description:
      'The same measurable events with the variance turned down. The cloak, shields and the finale matter less, so drafting a Traitor is not the whole game.',
    isDefault: false,
    categories: ['COMPETITION_GAMEPLAY', 'ELIMINATION_ENDGAME'],
    useBalancedPoints: true,
  },
  {
    slug: 'drama-social',
    name: 'Drama & Social',
    description:
      'Everything in Classic plus alliances, Round Table showdowns, tears and the episode title. Rewards the players who make good television, not just the ones who last.',
    isDefault: false,
    categories: ['COMPETITION_GAMEPLAY', 'ELIMINATION_ENDGAME', 'SOCIAL_DRAMA'],
    useBalancedPoints: false,
  },
];

export { TRAITORS_LEXICON } from './lexicon';
