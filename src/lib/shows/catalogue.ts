import { BIG_BROTHER_EVENTS, BIG_BROTHER_RULESETS } from './big-brother';
import { BIG_BROTHER_LEXICON, SURVIVOR_LEXICON, TRAITORS_LEXICON, type ShowLexicon } from './lexicon';
import type { EventDefinitionSpec, RulesetSpec } from './spec';
import { SURVIVOR_EVENTS, SURVIVOR_RULESETS } from './survivor';
import { TRAITORS_EVENTS, TRAITORS_RULESETS } from './traitors';

export { RECORDED, rulesetRules } from './spec';
export type { EventDefinitionSpec, ResolvedRule, RulesetSpec } from './spec';

/**
 * The shows the seed knows how to install.
 *
 * This is the only module that sees every show's rule catalogue at once, and
 * the seed is its only consumer. The UI and the scoring engine read
 * EventDefinition rows; they never import from here, which is what keeps a
 * show's rules a data change rather than a code change everywhere else.
 */

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
  {
    slug: 'traitors',
    name: 'The Traitors',
    lexicon: TRAITORS_LEXICON,
    events: TRAITORS_EVENTS,
    rulesets: TRAITORS_RULESETS,
  },
];
