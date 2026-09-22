import type { PrismaClient } from '@prisma/client';
import type { ShowSpec } from './catalogue';

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

    const included = spec.events.filter((e) => rulesetSpec.categories.includes(e.category));
    for (const event of included) {
      const eventDefinitionId = eventDefinitions.get(event.code)!;
      const override =
        rulesetSpec.useBalancedPoints && event.balancedPoints !== undefined ? event.balancedPoints : null;
      await prisma.scoringRulesetEventDefinition.upsert({
        where: {
          scoringRulesetId_eventDefinitionId: { scoringRulesetId: ruleset.id, eventDefinitionId },
        },
        update: { pointsOverride: override },
        create: { scoringRulesetId: ruleset.id, eventDefinitionId, pointsOverride: override },
      });
    }
    console.log(`  ${spec.name}: ruleset "${rulesetSpec.name}" → ${included.length} rules`);
  }

  return { show, eventDefinitions, rulesets };
}
