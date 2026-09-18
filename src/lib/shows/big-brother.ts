import type { EventCategory } from '../scoring/types';

/**
 * Big Brother rule catalogue.
 *
 * This file is the *only* place Big Brother's rules are expressed. Nothing in
 * the scoring engine, the API layer, or the UI imports from it — the seed
 * script turns it into EventDefinition rows and everything downstream reads
 * those rows. Supporting Survivor means adding a sibling file, not touching
 * any of the code that consumes it.
 */

export interface EventDefinitionSpec {
  code: string;
  label: string;
  category: EventCategory;
  /** Point value used by the "Classic" ruleset. */
  points: number;
  /**
   * Alternate value for the lower-variance "Balanced" ruleset. Several rules
   * in the league spec were authored as "+10 or +5"; rather than forcing one,
   * both live here and each ruleset picks via pointsOverride.
   */
  balancedPoints?: number;
  isRepeatable?: boolean;
  isPerCycleAward?: boolean;
  description?: string;
}

export const BIG_BROTHER_EVENTS: EventDefinitionSpec[] = [
  // --- Competition & gameplay ----------------------------------------------
  {
    code: 'HOH_WIN',
    label: 'Win Head of Household',
    category: 'COMPETITION_GAMEPLAY',
    points: 10,
    balancedPoints: 5,
    description: 'Won the Head of Household competition for the week.',
  },
  {
    code: 'VETO_WIN',
    label: 'Win Power of Veto',
    category: 'COMPETITION_GAMEPLAY',
    points: 5,
    balancedPoints: 3,
    description: 'Won the Power of Veto competition.',
  },
  {
    code: 'VETO_USED_ON_SELF',
    label: 'Use the veto on yourself',
    category: 'COMPETITION_GAMEPLAY',
    points: 3,
    description: 'Pulled yourself off the block with the Power of Veto.',
  },
  {
    code: 'VETO_USED_ON_OTHER',
    label: 'Use the veto on another player',
    category: 'COMPETITION_GAMEPLAY',
    points: 2,
    description: 'Saved another houseguest with the Power of Veto.',
  },
  {
    code: 'NOMINATED',
    label: 'Nominated for eviction',
    category: 'COMPETITION_GAMEPLAY',
    points: -5,
    description: 'Named as an initial nominee at the nomination ceremony.',
  },
  {
    code: 'ON_THE_BLOCK',
    label: 'On the block',
    category: 'COMPETITION_GAMEPLAY',
    points: -2,
    description: 'Sat on the block at any point during the week.',
  },
  {
    code: 'REPLACEMENT_NOMINEE',
    label: 'Replacement nominee / backdoored',
    category: 'COMPETITION_GAMEPLAY',
    points: -3,
    description: 'Put up as a replacement nominee after the veto ceremony.',
  },
  {
    code: 'SURVIVED_BLOCK',
    label: 'Survive the block',
    category: 'COMPETITION_GAMEPLAY',
    points: 2,
    description: 'Sat at the eviction and was not evicted.',
  },
  {
    code: 'SURVIVED_BLOCK_ZERO_VOTES',
    label: 'Survive the block with zero votes',
    category: 'COMPETITION_GAMEPLAY',
    points: 3,
    description: 'Survived eviction without receiving a single vote.',
  },
  {
    code: 'REENTRY_COMP_WIN',
    label: 'Win a re-entry competition',
    category: 'COMPETITION_GAMEPLAY',
    points: 6,
    description: 'Returned to the house by winning a battle-back or re-entry comp.',
  },
  {
    code: 'BLOCKBUSTER_WIN',
    label: 'Win BB Blockbuster',
    category: 'COMPETITION_GAMEPLAY',
    points: 4,
    description: 'Won the BB Blockbuster competition and saved yourself.',
  },
  {
    code: 'SPECIAL_POWER_WIN',
    label: 'Win an advantage or special power',
    category: 'COMPETITION_GAMEPLAY',
    points: 3,
    description: 'Earned a game-altering power, advantage, or secret ability.',
  },
  {
    code: 'REWARD_COMP_WIN',
    label: 'Win a reward competition',
    category: 'COMPETITION_GAMEPLAY',
    points: 3,
    description: 'Won a non-safety competition or prize.',
  },
  {
    code: 'SPECIAL_COMP_WIN',
    label: 'Win a special competition',
    category: 'COMPETITION_GAMEPLAY',
    points: 2,
    description: 'Won a named special competition such as OTEV or the Wall.',
  },
  {
    code: 'BLOCKBUSTER_FACE_VOTE_LOSS',
    label: 'Lose a BB Blockbuster face vote',
    category: 'COMPETITION_GAMEPLAY',
    points: -1,
    description: 'Selected by the house to compete in the Blockbuster and lost.',
  },
  {
    code: 'PUNISHMENT',
    label: 'Receive a punishment or disadvantage',
    category: 'COMPETITION_GAMEPLAY',
    points: -3,
    description: 'Saddled with a punishment, penalty, or in-game disadvantage.',
  },
  {
    code: 'BATTLE_OF_THE_BLOCK_WIN',
    label: 'Win Battle of the Block',
    category: 'COMPETITION_GAMEPLAY',
    points: 3,
    description: 'Legacy format: won Battle of the Block and came off the block.',
  },

  // --- Eviction & endgame ---------------------------------------------------
  {
    code: 'WEEK_SURVIVED',
    label: 'Survive the week',
    category: 'ELIMINATION_ENDGAME',
    points: 5,
    isPerCycleAward: true,
    description: 'Still in the house at the end of the week. Awarded automatically each cycle.',
  },
  {
    code: 'EVICTED',
    label: 'Evicted',
    category: 'ELIMINATION_ENDGAME',
    points: -2,
    isRepeatable: false,
    description: 'Voted out of the house.',
  },
  {
    code: 'EVICTED_UNANIMOUS',
    label: 'Evicted unanimously',
    category: 'ELIMINATION_ENDGAME',
    points: -3,
    isRepeatable: false,
    description: 'Evicted by a unanimous house vote.',
  },
  {
    code: 'EVICTED_BACKDOORED',
    label: 'Backdoored or blindsided out',
    category: 'ELIMINATION_ENDGAME',
    points: -5,
    isRepeatable: false,
    description: 'Evicted after being backdoored or blindsided.',
  },
  {
    code: 'EVICTED_INVOLUNTARY',
    label: 'Removed from the game',
    category: 'ELIMINATION_ENDGAME',
    points: -10,
    isRepeatable: false,
    description: 'Left the game involuntarily — expelled, removed, or medically withdrawn.',
  },
  {
    code: 'REACHED_JURY',
    label: 'Reach the jury',
    category: 'ELIMINATION_ENDGAME',
    points: 15,
    balancedPoints: 5,
    isRepeatable: false,
    description: 'Made it far enough to become a member of the jury.',
  },
  {
    code: 'FINAL_HOH_WIN',
    label: 'Win the final Head of Household',
    category: 'ELIMINATION_ENDGAME',
    points: 2,
    description: 'Won the final HOH and chose who to take to the end.',
  },
  {
    code: 'JURY_VOTE_RECEIVED',
    label: 'Receive a jury vote',
    category: 'ELIMINATION_ENDGAME',
    points: 10,
    description: 'Received a vote to win from a jury member. Scored once per vote.',
  },
  {
    code: 'PLACEMENT_WINNER',
    label: 'Win the season',
    category: 'ELIMINATION_ENDGAME',
    points: 75,
    balancedPoints: 5,
    isRepeatable: false,
    description: 'Crowned the winner of Big Brother.',
  },
  {
    code: 'PLACEMENT_RUNNER_UP',
    label: 'Finish 2nd',
    category: 'ELIMINATION_ENDGAME',
    points: 40,
    balancedPoints: 15,
    isRepeatable: false,
    description: 'Runner-up at the finale.',
  },
  {
    code: 'PLACEMENT_THIRD',
    label: 'Finish 3rd',
    category: 'ELIMINATION_ENDGAME',
    points: 10,
    isRepeatable: false,
    description: 'Third place at the finale.',
  },

  // --- Social & drama -------------------------------------------------------
  {
    code: 'ALLIANCE_FORMED',
    label: 'Form a named alliance',
    category: 'SOCIAL_DRAMA',
    points: 2,
    description: 'Founded an alliance that got a name on the broadcast.',
  },
  {
    code: 'SHOWMANCE_STARTED',
    label: 'Start a showmance',
    category: 'SOCIAL_DRAMA',
    points: 2,
    description: 'Entered a showmance.',
  },
  {
    code: 'ALLIANCE_COLLAPSED',
    label: 'Alliance collapses',
    category: 'SOCIAL_DRAMA',
    points: -1,
    description: 'An alliance you belonged to fell apart.',
  },
  {
    code: 'CONFRONTATION_WIN',
    label: 'Win a hostile confrontation',
    category: 'SOCIAL_DRAMA',
    points: 5,
    description: 'Came out on top of a blowup, fight, or heated confrontation.',
  },
  {
    code: 'CRIED',
    label: 'Cry on camera',
    category: 'SOCIAL_DRAMA',
    points: -2,
    description: 'Cried on the broadcast or the live feeds.',
  },
  {
    code: 'SHOWMANCE_ON_BLOCK',
    label: 'Showmance on the block',
    category: 'SOCIAL_DRAMA',
    points: -3,
    description: 'Your showmance partner sat on the block.',
  },
];

export interface RulesetSpec {
  slug: string;
  name: string;
  description: string;
  isDefault: boolean;
  categories: EventCategory[];
  /** Use `balancedPoints` where a rule defines one. */
  useBalancedPoints: boolean;
}

export const BIG_BROTHER_RULESETS: RulesetSpec[] = [
  {
    slug: 'classic-measurable',
    name: 'Classic',
    description:
      'Competition results and eviction outcomes only. Everything is verifiable from the broadcast, so there is nothing for the league to argue about.',
    isDefault: true,
    categories: ['COMPETITION_GAMEPLAY', 'ELIMINATION_ENDGAME'],
    useBalancedPoints: false,
  },
  {
    slug: 'balanced-measurable',
    name: 'Balanced',
    description:
      'The same measurable events with the variance turned down. Comp wins and the finale matter less, so a single lucky draft pick cannot run away with the season.',
    isDefault: false,
    categories: ['COMPETITION_GAMEPLAY', 'ELIMINATION_ENDGAME'],
    useBalancedPoints: true,
  },
  {
    slug: 'drama-social',
    name: 'Drama & Social',
    description:
      'Everything in Classic plus alliances, showmances, blowups, and tears. Rewards the houseguests who make good television, not just the ones who win comps.',
    isDefault: false,
    categories: ['COMPETITION_GAMEPLAY', 'ELIMINATION_ENDGAME', 'SOCIAL_DRAMA'],
    useBalancedPoints: false,
  },
];

export const BIG_BROTHER_LEXICON = {
  cycleSingular: 'Week',
  cyclePlural: 'Weeks',
  contestantSingular: 'Houseguest',
  contestantPlural: 'Houseguests',
  eliminationVerb: 'Evicted',
};
