import { formatPoints, pointsTone } from '@/lib/ui';
import { getRuleBook } from '@/server/queries';

export const dynamic = 'force-dynamic';

const CATEGORY_LABELS: Record<string, string> = {
  COMPETITION_GAMEPLAY: 'Competition & gameplay',
  ELIMINATION_ENDGAME: 'Eviction & endgame',
  SOCIAL_DRAMA: 'Social & drama',
};

export default async function RulesPage() {
  const rulesets = await getRuleBook('big-brother');

  return (
    <div className="pt-2">
      <h1 className="text-[28px] font-semibold tracking-tight">Scoring</h1>
      <p className="mb-4 text-[13px] text-muted">
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
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-[16px] font-semibold">{ruleset.name}</span>
                    {ruleset.isDefault && (
                      <span className="pill bg-lime-soft px-2 py-0.5 text-[10px] text-lime-deep">
                        default
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-[12px] leading-relaxed text-muted">
                    {ruleset.description}
                  </span>
                </span>
                <span className="pill shrink-0 bg-canvas text-[11px] text-muted">
                  {ruleset.eventDefinitions.length}
                </span>
              </summary>

              <div className="border-t border-hairline">
                {[...grouped.entries()].map(([category, rules]) => (
                  <div key={category}>
                    <h3 className="bg-canvas/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {CATEGORY_LABELS[category] ?? category}
                    </h3>
                    <ul className="divide-y divide-hairline">
                      {rules
                        .sort((a, b) => b.points - a.points)
                        .map((rule) => (
                          <li key={rule.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                            <span className="min-w-0 flex-1 truncate text-[13px]">{rule.label}</span>
                            <span
                              className={`text-[13px] font-semibold tabular-nums ${pointsTone(rule.points)}`}
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
