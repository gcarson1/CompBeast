import type { Metadata } from 'next';
import { ChevronRightIcon } from '@/components/icons';
import { JsonLd } from '@/components/JsonLd';
import { ShowTheme } from '@/components/ShowTheme';
import { Tag } from '@/components/Tag';
import { absoluteUrl, breadcrumbList } from '@/lib/seo';
import { formatPoints, pointsTone } from '@/lib/ui';
import { getRuleBooks } from '@/server/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Fantasy scoring rules',
  description:
    'Every scored event and its point value for each show on Comp Beast, under the Classic, Balanced and Drama & Social rulesets, and Lauren’s Way for Big Brother — competition wins, idols, shields, nominations, votes, murders, banishments, eliminations, jury and finale placements.',
  alternates: { canonical: absoluteUrl('/rules') },
};

const CATEGORY_LABELS: Record<string, string> = {
  COMPETITION_GAMEPLAY: 'Competition & gameplay',
  ELIMINATION_ENDGAME: 'Elimination & endgame',
  SOCIAL_DRAMA: 'Social & drama',
};

export default async function RulesPage() {
  const books = await getRuleBooks();

  return (
    <div className="pt-2">
      <JsonLd data={breadcrumbList([{ name: 'Scoring rules', path: '/rules' }])} />
      <div className="stage">
        <h1 className="headline text-4xl">Scoring</h1>
        <p className="mt-2 max-w-measure text-xs text-muted">
          Every league picks one ruleset for its show. Commissioners can swap rulesets before the draft.
        </p>
      </div>

      {/* One section per show, each in its own colours. The rules are the
          show's own rows, so a show with a thinner rule book simply has a
          shorter section; nothing here knows what any show's events are. */}
      {books.map((book, index) => (
        <ShowTheme key={book.slug} showSlug={book.slug}>
          {/* Every show after the first is a panel, so a scroll that ends near
              the next show's rule book settles on it. The first sits under the
              page title, which the top of the page already covers. */}
          <section className={index === 0 ? 'mt-8' : 'panel mt-14'} aria-labelledby={`rules-${book.slug}`}>
            {/* The show's name is the heading, in the show's colour; the
                words "scoring rules" are there for the outline, not the eye. */}
            <div className="flex items-end justify-between gap-3">
              <h2 id={`rules-${book.slug}`} className="section-title">
                {book.name}
                <span className="sr-only"> scoring rules</span>
              </h2>
              <span className="shrink-0 pb-0.5 text-2xs text-muted">
                {book.rulesets.length} {book.rulesets.length === 1 ? 'ruleset' : 'rulesets'}
              </span>
            </div>

            {/* The rulesets as one ruled section: each a row that opens in
                place, no box around any of them. */}
            <div className="list mt-4">
              {book.rulesets.map((ruleset) => {
                const grouped = new Map<
                  string,
                  Array<{ id: string; label: string; points: number; variable: string | null }>
                >();
                for (const link of ruleset.eventDefinitions) {
                  const def = link.eventDefinition;
                  const points = Number(link.pointsOverride ?? def.points);
                  const bucket = grouped.get(def.category) ?? [];
                  // A variable rule has no single value to print; its
                  // description says how the value is worked out.
                  bucket.push({
                    id: def.id,
                    label: def.label,
                    points,
                    variable: def.isVariable ? (def.description ?? null) : null,
                  });
                  grouped.set(def.category, bucket);
                }

                return (
                  <details key={ruleset.id} className="disclosure group" open={ruleset.isDefault}>
                    {/* The ruleset name is a real heading, not a bold span: the
                        page outline (h1 Scoring → h2 show → h3 ruleset → h4
                        category) is what a screen reader navigates by and what
                        a crawler segments by. */}
                    <summary className="row-link flex cursor-pointer list-none items-start justify-between gap-3 py-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="headline text-xl">{ruleset.name}</h3>
                          {/* Beside the heading, not inside it, so the outline
                              reads "Classic" rather than "Classic default". */}
                          {ruleset.isDefault && (
                            <Tag tone="show" size="sm">
                              Default
                            </Tag>
                          )}
                          {/* Lauren's Way is the league this app replaced, and
                              the one ruleset that is somebody's. */}
                          {ruleset.slug === 'laurens-way' && (
                            <Tag tone="lavender" size="sm">
                              The original
                            </Tag>
                          )}
                        </div>
                        <p className="mt-1 text-2xs leading-relaxed text-muted">{ruleset.description}</p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5 text-2xs tabular-nums text-muted">
                        {ruleset.eventDefinitions.length} rules
                        <ChevronRightIcon
                          size={15}
                          className="transition-transform duration-300 ease-soft group-open:rotate-90"
                        />
                      </span>
                    </summary>

                    <div className="pb-4">
                      {[...grouped.entries()].map(([category, rules]) => (
                        <div key={category} className="mt-2 first:mt-0">
                          <h4 className="eyebrow border-b border-hairline pb-2 pt-2 text-show-deep">
                            {CATEGORY_LABELS[category] ?? category}
                          </h4>
                          <ul className="divide-y divide-hairline">
                            {rules
                              // Biggest first; a sliding rule, which has no one value, last.
                              .sort((a, b) =>
                                Boolean(a.variable) === Boolean(b.variable)
                                  ? b.points - a.points
                                  : a.variable
                                    ? 1
                                    : -1,
                              )
                              .map((rule) => (
                                <li key={rule.id} className="flex items-center justify-between gap-3 py-2.5">
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-xs">{rule.label}</span>
                                    {rule.variable && (
                                      <span className="mt-0.5 block text-2xs leading-snug text-muted">
                                        {rule.variable}
                                      </span>
                                    )}
                                  </span>
                                  <span
                                    className={`shrink-0 text-xs font-semibold tabular-nums ${pointsTone(rule.points)}`}
                                  >
                                    {rule.variable ? 'sliding' : formatPoints(rule.points)}
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
          </section>
        </ShowTheme>
      ))}
    </div>
  );
}
