import type { EventDefinitionSpec, RulesetSpec } from './spec';

/**
 * Survivor rule catalogue.
 *
 * Same contract as big-brother.ts: this is the only place Survivor's rules
 * are expressed, the seed turns it into EventDefinition rows, and nothing
 * else imports it. Codes that mean the same thing on every show — reaching
 * the jury, jury votes, final placements — reuse Big Brother's names on
 * purpose, so cross-show surfaces (the landing page, badges, career totals)
 * can look a concept up by code without a per-show table.
 *
 * The point values were set against real seasons, not by feel. The
 * published community models (Purple Rock's Pick-4, Fantasizr, the FanDuel
 * sheet, fantasysurvivorgame.com) agree on the shape: individual immunity
 * is the biggest weekly event, tribe wins are worth a fraction of it, the
 * merge and the jury are milestone bonuses, and the finish is worth a few
 * immunity wins — not a season. They differ on survival points and on
 * penalties. This catalogue takes the consensus and adds what a fantasy
 * sport needs: something for every rostered player to earn every week
 * (surviving the episode, voting with the majority) so standings move week
 * to week, and a finish that rewards winning without deciding the league at
 * the draft.
 *
 * Measured over Survivor 49 and 50 with random snake drafts: under the
 * previous, Big Brother-derived values the team that drafted the Sole
 * Survivor won 71–85% of four-team leagues and the finale was about half
 * of the winner's points. Under these values it is 39–68% depending on
 * how dominant the winner actually was, the finale is 27–40%, and fantasy
 * rank still tracks real placement at ρ ≈ 0.95 — a challenge beast who
 * places third can outscore a quiet finalist, which is the fun.
 */

export const SURVIVOR_EVENTS: EventDefinitionSpec[] = [
  // --- Challenges & gameplay ------------------------------------------------
  {
    code: 'IMMUNITY_WIN',
    label: 'Win individual immunity',
    category: 'COMPETITION_GAMEPLAY',
    points: 10,
    balancedPoints: 6,
    description: 'Won the individual immunity challenge and was safe at tribal council.',
  },
  {
    code: 'TRIBAL_IMMUNITY_WIN',
    label: 'Win tribal immunity',
    category: 'COMPETITION_GAMEPLAY',
    points: 4,
    description: 'Your tribe won immunity and skipped tribal council. Scored for every member.',
  },
  {
    code: 'REWARD_WIN',
    label: 'Win or share a reward',
    category: 'COMPETITION_GAMEPLAY',
    points: 4,
    description: 'Won an individual reward, or was picked to share one.',
  },
  {
    code: 'TRIBAL_REWARD_WIN',
    label: 'Win a tribal reward',
    category: 'COMPETITION_GAMEPLAY',
    points: 2,
    description: 'Your tribe won a reward challenge. Scored for every member.',
  },
  {
    code: 'VOTED_WITH_MAJORITY',
    label: 'Vote with the majority',
    category: 'COMPETITION_GAMEPLAY',
    points: 2,
    description: 'Your vote landed on the castaway who went home.',
  },
  {
    code: 'VOTE_RECEIVED',
    label: 'Receive a vote at tribal',
    category: 'COMPETITION_GAMEPLAY',
    points: -1,
    description: 'A vote cast against you at tribal council. Scored once per vote.',
  },
  {
    code: 'IDOL_FOUND',
    label: 'Find a hidden immunity idol',
    category: 'COMPETITION_GAMEPLAY',
    points: 6,
    description: 'Found a hidden immunity idol, at camp or by completing a journey.',
  },
  {
    code: 'IDOL_PLAYED_SUCCESSFULLY',
    label: 'Play an idol that cancels votes',
    category: 'COMPETITION_GAMEPLAY',
    points: 8,
    balancedPoints: 5,
    description: 'Played a hidden immunity idol at tribal council and it negated at least one vote.',
  },
  {
    code: 'IDOL_PLAYED_WASTED',
    label: 'Waste an idol',
    category: 'COMPETITION_GAMEPLAY',
    points: -3,
    description: 'Played an idol that cancelled no votes.',
  },
  {
    code: 'ADVANTAGE_FOUND',
    label: 'Find an advantage',
    category: 'COMPETITION_GAMEPLAY',
    points: 3,
    description: 'Found or earned an advantage — an extra vote, a steal-a-vote, a block-a-vote, a safety.',
  },
  {
    code: 'ADVANTAGE_PLAYED',
    label: 'Play an advantage',
    category: 'COMPETITION_GAMEPLAY',
    points: 3,
    description: 'Used an advantage at tribal council.',
  },
  {
    code: 'SHOT_IN_THE_DARK_SUCCESS',
    label: 'Land a Shot in the Dark',
    category: 'COMPETITION_GAMEPLAY',
    points: 8,
    balancedPoints: 5,
    description: 'Gave up a vote for the Shot in the Dark and drew safety.',
  },
  {
    code: 'FIRE_MAKING_WIN',
    label: 'Win the fire-making challenge',
    category: 'COMPETITION_GAMEPLAY',
    points: 6,
    balancedPoints: 4,
    description: 'Won fire-making at final four and took a seat at the final tribal council.',
  },
  {
    code: 'MADE_MERGE',
    label: 'Make the merge',
    category: 'COMPETITION_GAMEPLAY',
    points: 8,
    balancedPoints: 5,
    isRepeatable: false,
    description: 'Still in the game when the tribes merged.',
  },

  // --- Tribal council & endgame --------------------------------------------
  {
    code: 'EPISODE_SURVIVED',
    label: 'Survive the episode',
    category: 'ELIMINATION_ENDGAME',
    points: 3,
    isPerCycleAward: true,
    description: 'Still in the game when the episode ended. Awarded automatically once its vote is in.',
  },
  {
    code: 'VOTED_OUT',
    label: 'Voted out',
    category: 'ELIMINATION_ENDGAME',
    points: -3,
    isRepeatable: false,
    description: 'The tribe has spoken.',
  },
  {
    code: 'VOTED_OUT_UNANIMOUS',
    label: 'Voted out unanimously',
    category: 'ELIMINATION_ENDGAME',
    points: -2,
    isRepeatable: false,
    description: 'Every vote at tribal council had your name on it. Scored on top of being voted out.',
  },
  {
    code: 'VOTED_OUT_WITH_IDOL',
    label: 'Go home with an idol in your pocket',
    category: 'ELIMINATION_ENDGAME',
    points: -5,
    isRepeatable: false,
    description: 'Voted out while holding an unplayed hidden immunity idol.',
  },
  {
    code: 'ELIMINATED_INVOLUNTARY',
    label: 'Left the game',
    category: 'ELIMINATION_ENDGAME',
    points: -3,
    isRepeatable: false,
    description: 'Left the game without a vote — quit, medically evacuated, or removed.',
  },
  {
    code: 'REACHED_JURY',
    label: 'Reach the jury',
    category: 'ELIMINATION_ENDGAME',
    points: 6,
    balancedPoints: 4,
    isRepeatable: false,
    description:
      'Still in the game when the jury began. Paid to everyone at once, the episode the first juror is voted out — the finalists included.',
  },
  {
    code: 'MADE_FINAL_TRIBAL',
    label: 'Make the final tribal council',
    category: 'ELIMINATION_ENDGAME',
    points: 10,
    balancedPoints: 6,
    isRepeatable: false,
    description: 'Sat in front of the jury on the last night.',
  },
  {
    code: 'JURY_VOTE_RECEIVED',
    label: 'Receive a jury vote',
    category: 'ELIMINATION_ENDGAME',
    points: 3,
    balancedPoints: 2,
    description: 'Received a vote to win at the final tribal council. Scored once per vote.',
  },
  {
    code: 'PLACEMENT_WINNER',
    label: 'Win the season',
    category: 'ELIMINATION_ENDGAME',
    points: 20,
    balancedPoints: 10,
    isRepeatable: false,
    description: 'Named Sole Survivor.',
  },
  {
    code: 'PLACEMENT_RUNNER_UP',
    label: 'Finish 2nd',
    category: 'ELIMINATION_ENDGAME',
    points: 12,
    balancedPoints: 6,
    isRepeatable: false,
    description: 'Runner-up at the final tribal council.',
  },
  {
    code: 'PLACEMENT_THIRD',
    label: 'Finish 3rd',
    category: 'ELIMINATION_ENDGAME',
    points: 5,
    balancedPoints: 3,
    isRepeatable: false,
    description: 'Third place at the final tribal council.',
  },

  // --- Social & drama -------------------------------------------------------
  {
    code: 'BLINDSIDE_ORCHESTRATED',
    label: 'Orchestrate a blindside',
    category: 'SOCIAL_DRAMA',
    points: 6,
    description: 'Credited on the broadcast with engineering a blindside.',
  },
  {
    code: 'EPISODE_TITLE_QUOTE',
    label: 'Say the episode title',
    category: 'SOCIAL_DRAMA',
    points: 2,
    description: 'The line the episode was named after was yours.',
  },
  {
    code: 'ALLIANCE_FORMED',
    label: 'Form a named alliance',
    category: 'SOCIAL_DRAMA',
    points: 2,
    description: 'Founded an alliance that got a name on the broadcast.',
  },
  {
    code: 'ALLIANCE_COLLAPSED',
    label: 'Alliance collapses',
    category: 'SOCIAL_DRAMA',
    points: -1,
    description: 'An alliance you belonged to fell apart.',
  },
  {
    code: 'IDOL_BLUFF',
    label: 'Bluff with a fake idol',
    category: 'SOCIAL_DRAMA',
    points: 4,
    description: 'Planted or played a fake idol and somebody bought it.',
  },
  {
    code: 'CONFRONTATION_WIN',
    label: 'Win a blowup at camp',
    category: 'SOCIAL_DRAMA',
    points: 4,
    description: 'Came out on top of a fight, a call-out, or a tribal council argument.',
  },
  {
    code: 'CRIED',
    label: 'Cry on camera',
    category: 'SOCIAL_DRAMA',
    points: -2,
    description: 'Cried on the broadcast.',
  },
];

export const SURVIVOR_RULESETS: RulesetSpec[] = [
  {
    slug: 'classic-measurable',
    name: 'Classic',
    description:
      'Challenge results, votes, idols and placements only. Everything is verifiable from the broadcast, so there is nothing for the league to argue about.',
    isDefault: true,
    categories: ['COMPETITION_GAMEPLAY', 'ELIMINATION_ENDGAME'],
    useBalancedPoints: false,
  },
  {
    slug: 'balanced-measurable',
    name: 'Balanced',
    description:
      'The same measurable events with the variance turned down. Immunity runs and the finale matter less, so a single lucky draft pick cannot run away with the season.',
    isDefault: false,
    categories: ['COMPETITION_GAMEPLAY', 'ELIMINATION_ENDGAME'],
    useBalancedPoints: true,
  },
  {
    slug: 'drama-social',
    name: 'Drama & Social',
    description:
      'Everything in Classic plus blindsides, alliances, bluffs, tears and the episode title. Rewards the castaways who make good television, not just the ones who win challenges.',
    isDefault: false,
    categories: ['COMPETITION_GAMEPLAY', 'ELIMINATION_ENDGAME', 'SOCIAL_DRAMA'],
    useBalancedPoints: false,
  },
];

export { SURVIVOR_LEXICON } from './lexicon';
