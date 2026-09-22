import type { PrismaClient } from '@prisma/client';
import { rulesetRules, type ShowSpec } from './catalogue';

/**
 * Installs one show from the catalogue: the Show row, its rule dictionary and
 * its rulesets. Idempotent, so running it again refreshes labels and point
 * values without touching any league's recorded history. The seed uses it
 * for every show before adding demo data; `scripts/install-shows.ts` uses it
 * on its own, which is how a show reaches a deployed database that must not
 * receive the demo seasons.
 */
export async function installShow(prisma: PrismaClient, spec: ShowSpec) {
  const lexicon = { ...spec.lexicon };
  const show = await prisma.show.upsert({
    where: { slug: spec.slug },
    update: { name: spec.name, lexicon },
    create: {
      slug: spec.slug,
      name: spec.name,
      format: 'TRADITIONAL_FANTASY_SPORT',
      lexicon,
    },
  });

  const eventDefinitions = new Map<string, string>();
  for (const event of spec.events) {
    const data = {
      label: event.label,
      category: event.category,
      points: event.points,
      isRepeatable: event.isRepeatable ?? true,
      isPerCycleAward: event.isPerCycleAward ?? false,
      isVariable: event.isVariable ?? false,
      description: event.description,
    };
    const def = await prisma.eventDefinition.upsert({
      where: { showId_code: { showId: show.id, code: event.code } },
      update: data,
      create: { showId: show.id, code: event.code, ...data },
    });
    eventDefinitions.set(event.code, def.id);
  }
  console.log(`  ${spec.name}: ${eventDefinitions.size} event definitions`);

  const rulesets = new Map<string, string>();
  for (const rulesetSpec of spec.rulesets) {
    const ruleset = await prisma.scoringRuleset.upsert({
      where: { showId_slug: { showId: show.id, slug: rulesetSpec.slug } },
      update: {
        name: rulesetSpec.name,
        description: rulesetSpec.description,
        isDefault: rulesetSpec.isDefault,
      },
      create: {
        showId: show.id,
        slug: rulesetSpec.slug,
        name: rulesetSpec.name,
        description: rulesetSpec.description,
        isDefault: rulesetSpec.isDefault,
      },
    });
    rulesets.set(rulesetSpec.slug, ruleset.id);

    const rules = rulesetRules(rulesetSpec, spec.events);
    const linkedIds: string[] = [];
    for (const [code, { override }] of rules) {
      const eventDefinitionId = eventDefinitions.get(code)!;
      linkedIds.push(eventDefinitionId);
      await prisma.scoringRulesetEventDefinition.upsert({
        where: {
          scoringRulesetId_eventDefinitionId: { scoringRulesetId: ruleset.id, eventDefinitionId },
        },
        update: { pointsOverride: override },
        create: { scoringRulesetId: ruleset.id, eventDefinitionId, pointsOverride: override },
      });
    }
    // A rule the ruleset no longer has leaves it, so the database follows the
    // catalogue in both directions rather than only ever gaining rules.
    await prisma.scoringRulesetEventDefinition.deleteMany({
      where: { scoringRulesetId: ruleset.id, eventDefinitionId: { notIn: linkedIds } },
    });
    console.log(`  ${spec.name}: ruleset "${rulesetSpec.name}" → ${rules.size} rules`);
  }

  // Events the catalogue no longer has. One that was never scored simply
  // goes; one with history stays as a row — the ledger's snapshots point at
  // it — but leaves every ruleset, so it neither scores nor shows again.
  const catalogued = new Set(spec.events.map((e) => e.code));
  const stale = await prisma.eventDefinition.findMany({
    where: { showId: show.id, code: { notIn: [...catalogued] } },
    select: { id: true, code: true, _count: { select: { scoredEvents: true } } },
  });
  for (const definition of stale) {
    if (definition._count.scoredEvents === 0) {
      await prisma.eventDefinition.delete({ where: { id: definition.id } });
      console.log(`  ${spec.name}: removed ${definition.code}`);
    } else {
      await prisma.scoringRulesetEventDefinition.deleteMany({ where: { eventDefinitionId: definition.id } });
      console.log(`  ${spec.name}: retired ${definition.code} (kept for its history)`);
    }
  }

  return { show, eventDefinitions, rulesets };
}
