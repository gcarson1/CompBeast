import type { Metadata } from 'next';
import { JsonLd } from '@/components/JsonLd';
import { absoluteUrl, breadcrumbList } from '@/lib/seo';
import { formatPoints, pointsTone } from '@/lib/ui';
import { getRuleBook } from '@/server/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Big Brother fantasy scoring rules',
  description:
    'Every scored Big Brother event and its point value under the Classic, Balanced and Drama & Social rulesets — HOH and veto wins, nominations, evictions, jury and finale placements.',
  alternates: { canonical: absoluteUrl('/rules') },
};

const CATEGORY_LABELS: Record<string, string> = {
  COMPETITION_GAMEPLAY: 'Competition & gameplay',
  ELIMINATION_ENDGAME: 'Eviction & endgame',
  SOCIAL_DRAMA: 'Social & drama',
};

export default async function RulesPage() {
  const rulesets = await getRuleBook('big-brother');

  return (
    <div className="pt-2">
      <JsonLd data={breadcrumbList([{ name: 'Scoring rules', path: '/rules' }])} />
      <h1 className="text-4xl font-semibold tracking-tight">Scoring</h1>
      <p className="mb-4 text-xs text-muted">
        Every league picks one ruleset. Commissioners can swap rulesets before the draft.
      </p>

      <div className="space-y-4">
        {rulesets.map((ruleset) => {
          const grouped = new Map<string, Array<{ id: string; label: string; points: number }>>();
          for (const link of ruleset.eventDefinitions) {
            const def = link.eventDefinition;
            const points = Number(link.pointsOverride ?? def.points);
            const bucket = grouped.get(def.category) ?? [];
            bucket.push({ id: def.id, label: def.label, points });
            grouped.set(def.category, bucket);
          }

          return (
            <details key={ruleset.id} className="card group overflow-hidden" open={ruleset.isDefault}>
              {/* The ruleset name is a real heading, not a bold span: the
                  page outline (h1 Scoring → h2 ruleset → h3 category) is what
                  a screen reader navigates by and what a crawler segments by,
                  and a span styled like a heading is invisible to both. */}
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-md font-semibold">{ruleset.name}</h2>
                    {/* Beside the heading, not inside it, so the outline reads
                        "Classic" rather than "Classic default". */}
                    {ruleset.isDefault && (
                      <span className="pill bg-brand-gold-soft px-2 py-0.5 text-2xs font-medium text-brand-gold-deep">
                        default
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-2xs leading-relaxed text-muted">{ruleset.description}</p>
                </div>
                <span className="pill shrink-0 bg-canvas text-2xs text-muted">
                  {ruleset.eventDefinitions.length}
                </span>
              </summary>

              <div className="border-t border-hairline">
                {[...grouped.entries()].map(([category, rules]) => (
                  <div key={category}>
                    <h3 className="bg-canvas/60 px-4 py-2 text-2xs font-semibold uppercase tracking-wide text-muted">
                      {CATEGORY_LABELS[category] ?? category}
                    </h3>
                    <ul className="divide-y divide-hairline">
                      {rules
                        .sort((a, b) => b.points - a.points)
                        .map((rule) => (
                          <li key={rule.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                            <span className="min-w-0 flex-1 truncate text-xs">{rule.label}</span>
                            <span
                              className={`text-xs font-semibold tabular-nums ${pointsTone(rule.points)}`}
                            >
                              {formatPoints(rule.points)}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
