import type { EventCategory } from '../scoring/types';
import { BIG_BROTHER_EVENTS, BIG_BROTHER_RULESETS } from './big-brother';
import { BIG_BROTHER_LEXICON, SURVIVOR_LEXICON, type ShowLexicon } from './lexicon';
import { SURVIVOR_EVENTS, SURVIVOR_RULESETS } from './survivor';

/**
 * The shows the seed knows how to install.
 *
 * This is the only module that sees every show's rule catalogue at once, and
 * the seed is its only consumer. The UI and the scoring engine read
 * EventDefinition rows; they never import from here, which is what keeps a
 * show's rules a data change rather than a code change everywhere else.
 */

export interface EventDefinitionSpec {
  code: string;
  label: string;
  category: EventCategory;
  /** Point value used by the "Classic" ruleset. */
  points: number;
  /**
   * Alternate value for the lower-variance "Balanced" ruleset. Several rules
   * were authored as "+10 or +5"; rather than forcing one, both live here and
   * each ruleset picks via pointsOverride.
   */
  balancedPoints?: number;
  isRepeatable?: boolean;
  isPerCycleAward?: boolean;
  description?: string;
}

export interface RulesetSpec {
  slug: string;
  name: string;
  description: string;
  isDefault: boolean;
  categories: EventCategory[];
  /** Use `balancedPoints` where a rule defines one. */
  useBalancedPoints: boolean;
}

export interface ShowSpec {
  slug: string;
  name: string;
  lexicon: ShowLexicon;
  events: EventDefinitionSpec[];
  rulesets: RulesetSpec[];
}

export const SHOW_CATALOGUE: ShowSpec[] = [
  {
    slug: 'big-brother',
    name: 'Big Brother',
    lexicon: BIG_BROTHER_LEXICON,
    events: BIG_BROTHER_EVENTS,
    rulesets: BIG_BROTHER_RULESETS,
  },
  {
    slug: 'survivor',
    name: 'Survivor',
    lexicon: SURVIVOR_LEXICON,
    events: SURVIVOR_EVENTS,
    rulesets: SURVIVOR_RULESETS,
  },
];
