import type { EventCategory } from '../scoring/types';

/**
 * The shapes a show's rule book is written in, and the one function that
 * reads a ruleset. Kept apart from `catalogue.ts`, which imports every show:
 * a show file needs `RECORDED` from here, and importing it from the
 * catalogue made a cycle that broke the install script under `tsx`.
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
  /**
   * Scored only by a ruleset that names it. A category ruleset (Classic,
   * Balanced, Drama & Social) leaves it out, so adding one of these to the
   * catalogue never changes a ruleset that did not ask for it.
   */
  optIn?: boolean;
  /**
   * The value is set per occurrence rather than fixed — see EVICTION_ORDER.
   * `points` is then the unit, and whoever records the event (the ingestion
   * mapper, or an admin) supplies the actual value.
   */
  isVariable?: boolean;
  description?: string;
}

/** In an explicit ruleset: score a variable event at the value it was recorded with. */
export const RECORDED = 'recorded' as const;

interface RulesetBase {
  slug: string;
  name: string;
  description: string;
  isDefault: boolean;
}

/**
 * A ruleset is one of two shapes. A *category* ruleset takes every event in
 * its categories (bar the opt-in ones), at the catalogue value or the
 * Balanced one. An *explicit* ruleset lists exactly the events it scores and
 * what each is worth — the shape for a league's own house rules, which
 * rarely line up with any category.
 */
export type RulesetSpec = RulesetBase &
  (
    | {
        categories: EventCategory[];
        /** Use `balancedPoints` where a rule defines one. */
        useBalancedPoints: boolean;
        points?: never;
      }
    | {
        /** Event code → points, or `RECORDED` for a variable event. */
        points: Record<string, number | typeof RECORDED>;
        categories?: never;
        useBalancedPoints?: never;
      }
  );

export interface ResolvedRule {
  /** The ruleset's own value, stored as the link's `pointsOverride`; null to use the catalogue's (or the recorded) value. */
  override: number | null;
  /** What the rule is worth when scored: the override, else the catalogue value. */
  points: number;
}

/**
 * Which events a ruleset scores and at what value — the one reading of a
 * `RulesetSpec`, shared by the installer and by the tests that simulate a
 * season against the catalogue, so the two cannot disagree.
 */
export function rulesetRules(ruleset: RulesetSpec, events: EventDefinitionSpec[]): Map<string, ResolvedRule> {
  const rules = new Map<string, ResolvedRule>();

  if (ruleset.points) {
    const byCode = new Map(events.map((event) => [event.code, event]));
    for (const [code, value] of Object.entries(ruleset.points)) {
      const event = byCode.get(code);
      if (!event) throw new Error(`Ruleset "${ruleset.slug}" names unknown event "${code}"`);
      if ((value === RECORDED) !== Boolean(event.isVariable)) {
        throw new Error(
          `Ruleset "${ruleset.slug}": ${code} must be ${event.isVariable ? 'RECORDED (it is variable)' : 'a number'}`,
        );
      }
      rules.set(
        code,
        value === RECORDED ? { override: null, points: event.points } : { override: value, points: value },
      );
    }
    return rules;
  }

  for (const event of events) {
    if (event.optIn || !ruleset.categories.includes(event.category)) continue;
    const override =
      ruleset.useBalancedPoints && event.balancedPoints !== undefined ? event.balancedPoints : null;
    rules.set(event.code, { override, points: override ?? event.points });
  }
  return rules;
}
