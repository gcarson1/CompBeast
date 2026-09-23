import Link from 'next/link';
import { SignInButton } from '@clerk/nextjs';
import type { ReactNode } from 'react';
import { ArrowRightIcon, TallyMark } from '@/components/icons';
import { JsonLd } from '@/components/JsonLd';
import { premiereLabel } from '@/components/LiveSection';
import { Collapsible } from '@/components/Collapsible';
import { SeasonPlate } from '@/components/SeasonPlate';
import { ShowTheme } from '@/components/ShowTheme';
import { Tag } from '@/components/Tag';
import { DEFAULT_LOCK_OFFSET_MINUTES, MAX_LOCK_OFFSET_MINUTES } from '@/lib/cycles';
import {
  HOME_PATH,
  SITE_DESCRIPTION,
  SITE_NAME,
  absoluteUrl,
  organizationId,
  tvSeriesNode,
  websiteId,
} from '@/lib/seo';
import { lower, type ShowLexicon } from '@/lib/shows/lexicon';
import { HEADLINE_EVENT_COUNT, showcaseEventsFor } from '@/lib/shows/registry';
import { formatPoints, pointsTone } from '@/lib/ui';
import { LEAGUE_LIMITS } from '@/lib/validation';
import type { getRuleBook } from '@/server/queries';

type RuleBook = Awaited<ReturnType<typeof getRuleBook>>;

/** One show as the landing page pitches it: its words, its rules, its open season. */
export interface LandingShow {
  showName: string;
  showSlug: string;
  lexicon: ShowLexicon;
  rulesets: RuleBook;
  /** The season the copy names — the airing one, else the next — or null. */
  season: {
    slug: string;
    name: string;
    status: 'ACTIVE' | 'UPCOMING';
    startsAt: Date | null;
    contestantCount: number;
  } | null;
}

/**
 * The signed-out pitch.
 *
 * A server component, on purpose. The previous version was a Framer Motion
 * client component whose `initial={{ opacity: 0 }}` reached the browser as
 * `style="opacity:0"` on the hero — the page's largest paint — so nothing was
 * visible until the JavaScript had downloaded and hydrated. The entrance is
 * now a CSS animation (`animate-rise`), the sign-in button is the only
 * client island, and everything below the fold ships as plain HTML.
 *
 * The page pitches the platform first and each show on its own terms. The
 * hero, how-it-works, league sizes and comparison are about Comp Beast and
 * say "cast", "contestant", "episode"; the live block, the show tiles and
 * the scoring section are one block per show, in that show's colour and
 * vocabulary, so no show is the default and none is an afterthought.
 *
 * The page is written for two readers at once. A person skimming on a phone
 * gets the display headline and one paragraph per section. A crawler or a
 * language model gets the same paragraphs as self-contained answers: each
 * one opens its section, says the whole thing in 40–60 words, and is dense
 * with the names it needs to know what this is about — Comp Beast, the
 * shows, their competitions and their vocabulary — because that is how a
 * model decides whether a page answers the question it was asked.
 *
 * Every number on the page is read from the same place the app enforces it:
 * the scoring tables and the point values in the prose come from the live
 * rule books, the league sizes from the validation schema, the lock times
 * from `cycles.ts`. The FAQ is one array rendered twice, as text and as
 * FAQPage JSON-LD, so the schema cannot say something the page does not.
 *
 * Copy is left-aligned throughout. Centring a whole page is the fastest way
 * to make it read as generated: it gives every block the same axis, so
 * nothing leads, and it forces the eye to re-find the start of each line.
 */
export function SignedOutLanding({
  live,
  shows,
  emailAlerts,
}: {
  /** The open seasons' casts, last scored events and buzz panels — passed in
   *  so the signed-in home renders the identical block. */
  live: ReactNode;
  shows: LandingShow[];
  /** Whether alerts can also go out by email in this deployment. */
  emailAlerts: boolean;
}) {
  const facts = deriveFacts(shows);
  const faq = buildFaq(facts, emailAlerts);

  return (
    <div className="pt-6">
      <JsonLd data={applicationNode(facts)} />
      <JsonLd data={faqNode(faq)} />

      {/* The pitch and the way in. Not a panel: the top of the page is
          already where a scroll comes to rest. */}
      <div className="stage">
        {/* The wordmark's tally, enormous and faint, behind the headline: the
            one piece of set dressing on the page, and it is the logo. */}
        <TallyMark className="absolute -right-5 -top-4 h-56 w-56 text-brand-gold opacity-[0.07] sm:-right-10 sm:h-80 sm:w-80" />

        <header className="relative">
          {/* Still a CSS entrance and still visible in the HTML — nothing in
              the hero may start at opacity 0 (see the `rise` keyframe). */}
          <p className="flex animate-rise flex-wrap items-center gap-x-3 gap-y-2">
            <Tag tone="gold">Free to play</Tag>
            <span className="text-2xs font-bold uppercase tracking-[0.16em] text-muted">
              {facts.shows.map((show) => show.showName).join(' · ')}
            </span>
          </p>

          <h1 className="mt-5 animate-rise font-display text-5xl leading-[0.92] tracking-wide [animation-delay:60ms] sm:text-[64px] lg:text-[76px]">
            DRAFT THE CAST.
            <br />
            <span className="wordmark-gold box-decoration-clone">OWN THE LEADERBOARD.</span>
          </h1>

          {/* The lede sits on a measure, not on the container's width: the display
            face wants the full column, body copy does not. The two different
            widths are what give the block its asymmetry. */}
          <p className="mt-5 max-w-measure animate-rise text-md leading-relaxed text-muted [animation-delay:120ms]">
            {SITE_DESCRIPTION}
          </p>

          <div className="mt-7 flex animate-rise flex-wrap items-center gap-3 [animation-delay:180ms]">
            <SignInButton mode="modal">
              <button type="button" className="btn-primary px-6 py-3.5 text-md">
                Start playing
                <ArrowRightIcon size={18} />
              </button>
            </SignInButton>
            <Link href="/rules" className="btn-ghost py-3.5">
              Scoring rules
            </Link>
          </div>

          {/* What is on right now, as a line of broadcast bugs: a breathing
              red dot for a season on air, an outlined one for the next. */}
          {facts.onAir.length > 0 && (
            <ul className="mt-8 flex animate-rise flex-wrap gap-x-5 gap-y-2 text-xs text-muted [animation-delay:240ms]">
              {facts.onAir.map((item) => (
                <li key={item.text} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={
                      item.live ? 'tag-dot text-danger-deep' : 'h-1.5 w-1.5 rounded-full border border-muted'
                    }
                  />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          )}
        </header>
      </div>

      {/* Proof that it is live: one panel for every show (see LiveSection). */}
      <div className="mt-14">{live}</div>

      <Section id="shows" title="Pick your show" lede={facts.showsLede}>
        {/* One tile per show, each in its own colour: the two brands get
            equal billing, and the platform's gold stays for the platform. */}
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {facts.shows.map((show) => (
            <li key={show.showSlug}>
              <ShowTheme showSlug={show.showSlug}>
                <div className="card-feature card-lift flex h-full flex-col p-4">
                  <TallyMark className="absolute -right-3 -top-4 h-24 w-24 text-show-accent opacity-[0.1]" />
                  <div className="relative flex items-start justify-between gap-3">
                    {show.season ? (
                      <SeasonPlate showSlug={show.showSlug} seasonSlug={show.season.slug} />
                    ) : (
                      <span />
                    )}
                    {show.season?.status === 'ACTIVE' ? (
                      <Tag tone="red" live size="sm">
                        Airing now
                      </Tag>
                    ) : (
                      <Tag tone="outline" size="sm">
                        {show.season ? 'Up next' : 'Off season'}
                      </Tag>
                    )}
                  </div>
                  <h3 className="headline mt-3 text-3xl text-show-deep">{show.showName}</h3>
                  <p className="mt-2 max-w-measure text-xs leading-relaxed text-muted">{show.pitch}</p>
                  <dl className="relative mt-3 grid grid-cols-2 gap-3 border-t border-hairline pt-3 text-2xs">
                    <div>
                      <dt className="font-semibold uppercase tracking-wide text-muted">Season</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-ink">{show.season?.name ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold uppercase tracking-wide text-muted">Cast</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-ink">
                        {show.season?.contestantCount
                          ? `${show.season.contestantCount} ${lower(show.lexicon.contestantPlural)}`
                          : '—'}
                      </dd>
                    </div>
                  </dl>
                  <div className="relative mt-auto flex flex-wrap gap-2 pt-3">
                    {show.season && (
                      <Link href={`/seasons/${show.season.slug}`} className="btn-ghost btn-sm">
                        Meet the cast
                      </Link>
                    )}
                    <Link href="/rules" className="btn-ghost btn-sm">
                      {show.showName} rules
                    </Link>
                  </div>
                </div>
              </ShowTheme>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="how-it-works" title="How it works" lede={facts.howItWorks}>
        {/* Three claims as a numbered, hairline-separated list on a narrow/wide
            column split — deliberately not a three-up card grid. Cards here
            would be three equal boxes of two sentences each, which is the
            shape every generated landing page reaches for, and it flattens the
            claims into decoration instead of letting them read in order. */}
        <ol className="mt-5 divide-y divide-hairline border-y border-hairline">
          {CLAIMS.map((claim) => (
            <li
              key={claim.step}
              className="grid grid-cols-[2.5rem_1fr] gap-x-4 py-5 sm:grid-cols-[4rem_1fr] sm:gap-x-6"
            >
              {/* Decorative for a screen reader — the list is already
                  ordered, so announcing "01" before every heading is noise —
                  but it is still text someone reads, so it holds AA. Gold at
                  40% measured 2.3:1 on canvas; 70% is 4.6:1 and still reads
                  as a quiet numeral rather than competing with the heading. */}
              <span aria-hidden className="font-display text-xl leading-none text-brand-gold/70">
                {claim.step}
              </span>
              <div>
                <h3 className="text-base font-semibold">{claim.title}</h3>
                <p className="mt-1 max-w-measure text-sm leading-relaxed text-muted">{claim.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {facts.shows.some((s) => s.scoring) && (
        <Section id="scoring" title="How scoring works" lede={facts.scoringLede}>
          {/* A flex gap, not `space-y`: each figure sits inside a <ShowTheme>,
              which is `display: contents`, and a margin on it does nothing. */}
          <div className="mt-5 flex flex-col gap-8">
            {facts.shows
              .filter((show) => show.scoring)
              .map((show) => (
                <ShowTheme key={show.showSlug} showSlug={show.showSlug}>
                  <figure>
                    <figcaption className="mb-3">
                      <Tag tone="show" size="sm">
                        {show.showName}
                      </Tag>
                      <p className="mt-2 max-w-measure text-sm leading-relaxed text-muted">
                        {show.scoring!.lede}
                      </p>
                    </figcaption>
                    {/* `table-fixed`: a phone is 335px wide inside the gutters,
                        and left to auto-layout the last column fell off the
                        edge behind a scrollbar nobody sees. The event column
                        takes 40% while a show has three rulesets and 30% once
                        it has four (Big Brother, with Lauren's Way); the
                        ruleset names are set in normal case with tight side
                        padding so "Balanced" fits and "Lauren's Way" wraps
                        between its words rather than through them. */}
                    <div className="border-y border-hairline">
                      <table className="w-full table-fixed text-xs">
                        <caption className="sr-only">
                          Point values for selected events on {show.showName} under each Comp Beast ruleset
                        </caption>
                        <colgroup>
                          <col className={show.scoring!.columns.length > 3 ? 'w-[30%]' : 'w-[40%]'} />
                          {show.scoring!.columns.map((column) => (
                            <col key={column.id} />
                          ))}
                        </colgroup>
                        <thead>
                          <tr className="border-b border-hairline text-2xs text-muted">
                            <th
                              scope="col"
                              className="py-2.5 pr-3 text-left font-semibold uppercase tracking-wide"
                            >
                              Event
                            </th>
                            {show.scoring!.columns.map((column) => (
                              <th
                                key={column.id}
                                scope="col"
                                className="py-2.5 pl-0.5 pr-2 text-right align-bottom font-semibold leading-tight last:pr-0"
                              >
                                {column.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-hairline">
                          {show.scoring!.rows.map((row) => (
                            <tr key={row.label}>
                              <th
                                scope="row"
                                className="py-2.5 pr-3 text-left font-medium leading-snug text-ink"
                              >
                                {row.label}
                              </th>
                              {row.points.map((points, i) => (
                                <td
                                  key={show.scoring!.columns[i].id}
                                  className={`py-2.5 pl-0.5 pr-2 text-right font-semibold tabular-nums last:pr-0 ${
                                    points === null ? 'text-muted' : pointsTone(points)
                                  }`}
                                >
                                  {points === null ? '—' : formatPoints(points)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </figure>
                </ShowTheme>
              ))}
            <p className="text-2xs text-muted">
              A dash means the ruleset does not score that event.{' '}
              {/* Underlined because it sits inside running text; colour
                  alone is not a distinguishable link (WCAG 1.4.1). */}
              <Link
                href="/rules"
                className="text-brand-gold-deep underline decoration-brand-gold-deep/40 underline-offset-2"
              >
                See every rule for every show →
              </Link>
            </p>
          </div>
        </Section>
      )}

      <Section id="league-setup" title="League sizes, drafts and roster locks" lede={facts.leagueSetup}>
        {/* The numbers as one scoreboard ruled into cells by hairlines (the
            gap shows the rule through), on the page rather than in a tile, so
            four figures read as one set of facts rather than four toys. */}
        <dl className="mt-5 grid grid-cols-2 gap-px border-y border-hairline bg-hairline sm:grid-cols-4">
          {facts.stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center bg-canvas px-2 py-5 text-center">
              <dd className="order-1 font-display text-4xl leading-none tracking-wide text-brand-gold-deep">
                {stat.value}
              </dd>
              <dt className="order-2 mt-2 text-2xs font-bold uppercase leading-snug tracking-[0.12em] text-muted">
                {stat.label}
              </dt>
            </div>
          ))}
        </dl>
      </Section>

      {/* Folded: a dense table for the reader who is weighing it up. The
          lede above it says the whole thing in one paragraph. */}
      <Section
        id="compare"
        title={`${SITE_NAME} vs. a spreadsheet league`}
        lede={facts.comparison}
        defaultOpen={false}
      >
        <div className="mt-5 border-y border-hairline">
          <table className="w-full table-fixed text-xs">
            <caption className="sr-only">
              Running a fantasy league on {SITE_NAME} compared with a spreadsheet and a group chat
            </caption>
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-[44%]" />
              <col className="w-[32%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-hairline text-2xs uppercase tracking-wide text-muted">
                <th scope="col" className="py-2.5 pr-3 text-left font-semibold">
                  <span className="sr-only">Feature</span>
                </th>
                <th scope="col" className="px-2 py-2.5 text-left font-semibold text-brand-gold-deep">
                  {SITE_NAME}
                </th>
                <th scope="col" className="py-2.5 pl-2 text-left font-semibold">
                  Spreadsheet + group chat
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline align-top">
              {facts.comparisonRows.map((row) => (
                <tr key={row.feature}>
                  <th scope="row" className="py-3 pr-3 text-left font-medium leading-snug text-ink">
                    {row.feature}
                  </th>
                  <td className="px-2 py-3 leading-snug text-ink">{row.compBeast}</td>
                  <td className="py-3 pl-2 leading-snug text-muted">{row.spreadsheet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="faq" title="Frequently asked questions">
        {/* An accordion: every answer is in the HTML for a crawler and the
            FAQPage schema, and one question at a time for a person. */}
        <ul className="divide-y divide-hairline border-y border-hairline">
          {faq.map((item) => (
            <li key={item.question}>
              <Collapsible
                variant="row"
                title={item.question}
                titleClassName="text-base"
                headingLevel={3}
                defaultOpen={false}
              >
                <p className="max-w-measure text-sm leading-relaxed text-muted">{item.answer}</p>
              </Collapsible>
            </li>
          ))}
        </ul>
      </Section>

      <nav aria-label="More" className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-xs">
        <Link href="/seasons" className="text-brand-gold-deep">
          Browse every season
        </Link>
        <Link href="/rules" className="text-brand-gold-deep">
          Full scoring rules
        </Link>
      </nav>
    </div>
  );
}

/**
 * A section is a heading, one paragraph that answers it, and the detail —
 * and it folds, so the page reads as its headings first. Every section is
 * open by default: this is the page a crawler reads, and a person who scrolls
 * gets the whole argument without a tap. `Collapsible` labels the section by
 * its heading, which is what makes it a landmark a screen reader can jump to.
 */
function Section({
  id,
  title,
  lede,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  lede?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Collapsible id={id} title={title} className="mt-14" bodyClassName="pt-1" defaultOpen={defaultOpen}>
      {lede && <p className="mt-2 max-w-measure text-sm leading-relaxed text-muted">{lede}</p>}
      {children}
    </Collapsible>
  );
}

const CLAIMS = [
  {
    step: '01',
    title: 'Draft the real cast',
    body: 'Snake-draft the season’s contestants before the roster locks.',
  },
  {
    step: '02',
    title: 'Score every move',
    body: 'Competition wins, blindsides, eliminations and blowups all count toward your team.',
  },
  {
    step: '03',
    title: 'Live leaderboard',
    body: 'Ranks update episode by episode, all season long.',
  },
];

/** A show's one-line pitch on its tile — its vocabulary, not the platform's. */
const SHOW_PITCHES: Record<string, string> = {
  'big-brother':
    'Head of Household, the veto, nominations, evictions and the jury — every week in the house scored as it airs, straight from the results.',
  survivor:
    'Immunity, rewards, idols, tribal council and the merge — every episode on the island scored as it airs, from the voting history down.',
  traitors:
    'Shields, murders, the Round Table and the end game — every episode in the castle scored as it airs, down to who voted out a Traitor.',
};

interface ShowFacts {
  showName: string;
  showSlug: string;
  lexicon: ShowLexicon;
  season: LandingShow['season'];
  pitch: string;
  eventCount: number;
  rulesetNames: string[];
  defaultRulesetName: string | null;
  /** The headline events as "label points" pairs, for the prose. */
  headline: Array<{ label: string; points: number }>;
  scoring: {
    lede: string;
    columns: Array<{ id: string; name: string }>;
    rows: Array<{ label: string; points: Array<number | null> }>;
  } | null;
}

interface Facts {
  shows: ShowFacts[];
  /** One short line per open season, for the hero's "on air" strip. */
  onAir: Array<{ text: string; live: boolean }>;
  showsLede: string;
  howItWorks: string;
  scoringLede: string;
  leagueSetup: string;
  stats: Array<{ value: string; label: string }>;
  comparison: string;
  comparisonRows: Array<{ feature: string; compBeast: string; spreadsheet: string }>;
}

function onAirLine(show: LandingShow): { text: string; live: boolean } | null {
  const { season, lexicon } = show;
  if (!season) return null;
  const cast =
    season.contestantCount > 0 ? ` · ${season.contestantCount} ${lower(lexicon.contestantPlural)}` : '';
  if (season.status === 'ACTIVE') return { text: `${season.name} airing now${cast}`, live: true };
  const when = season.startsAt ? ` ${premiereLabel(season.startsAt)}` : ' soon';
  return { text: `${season.name} premieres${when}${cast}`, live: false };
}

function deriveShowFacts(show: LandingShow): ShowFacts {
  const { rulesets, lexicon } = show;
  const eventIds = new Set(rulesets.flatMap((r) => r.eventDefinitions.map((l) => l.eventDefinition.id)));
  const eventCount = eventIds.size;
  const defaultRuleset = rulesets.find((r) => r.isDefault) ?? rulesets[0] ?? null;

  const pointsIn = (ruleset: RuleBook[number], code: string): number | null => {
    const link = ruleset.eventDefinitions.find((l) => l.eventDefinition.code === code);
    return link ? Number(link.pointsOverride ?? link.eventDefinition.points) : null;
  };
  const defaultPoints = new Map<string, number>();
  if (defaultRuleset) {
    for (const link of defaultRuleset.eventDefinitions) {
      defaultPoints.set(
        link.eventDefinition.code,
        Number(link.pointsOverride ?? link.eventDefinition.points),
      );
    }
  }

  const showcase = showcaseEventsFor(show.showSlug);
  const labelFor = (code: string) =>
    rulesets.flatMap((r) => r.eventDefinitions).find((l) => l.eventDefinition.code === code)?.eventDefinition
      .label;

  // "Win Head of Household +10, Win Power of Veto +5, …": the show's own
  // headline events, read from the rule book so the numbers can never drift
  // from what the app enforces. Only codes the rule book has make the cut.
  const headline = showcase.slice(0, HEADLINE_EVENT_COUNT).flatMap((code) => {
    const label = labelFor(code);
    const points = defaultPoints.get(code);
    return label && points !== undefined ? [{ label, points }] : [];
  });
  const headlineSentence = headline.map((h) => `${h.label} ${formatPoints(h.points)}`).join(', ');

  let scoring: ShowFacts['scoring'] = null;
  if (defaultRuleset && eventCount > 0) {
    const rows = showcase.flatMap((code) => {
      const label = labelFor(code);
      if (!label) return [];
      return [{ label, points: rulesets.map((r) => pointsIn(r, code)) }];
    });
    scoring = {
      lede:
        headline.length >= 3
          ? `${eventCount} scored events on ${show.showName}. Under the default ${defaultRuleset.name} rules: ${headlineSentence}.`
          : `${eventCount} scored events on ${show.showName}, each with a set point value.`,
      columns: rulesets.map((r) => ({ id: r.id, name: r.name })),
      rows,
    };
  }

  return {
    showName: show.showName,
    showSlug: show.showSlug,
    lexicon,
    season: show.season,
    pitch:
      SHOW_PITCHES[show.showSlug] ??
      `Every ${lower(lexicon.cycleSingular)} of ${show.showName}, scored as it airs.`,
    eventCount,
    rulesetNames: rulesets.map((r) => r.name),
    defaultRulesetName: defaultRuleset?.name ?? null,
    headline,
    scoring,
  };
}

function deriveFacts(input: LandingShow[]): Facts {
  const shows = input.map(deriveShowFacts);
  const { minTeams, maxTeams, minRoster, maxRoster } = LEAGUE_LIMITS;
  const maxLockHours = MAX_LOCK_OFFSET_MINUTES / 60;
  const names = shows.map((s) => s.showName);
  const showList =
    names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '');
  const onAir = input.map(onAirLine).filter((line): line is { text: string; live: boolean } => line !== null);
  const totalEvents = shows.reduce((sum, s) => sum + s.eventCount, 0);
  const rulesetCounts = shows.map((s) => s.rulesetNames.length);
  const fewest = Math.min(...rulesetCounts);
  const most = Math.max(...rulesetCounts);
  const rulesetsPerShow = fewest === most ? String(most) : `${fewest}–${most}`;
  // A show's own house rules, beyond the three every show has — today,
  // Lauren's Way for Big Brother.
  const houseRules = shows.flatMap((show) =>
    show.rulesetNames
      .filter((name) => name.startsWith('Lauren'))
      .map(
        (name) =>
          `${show.showName} also has ${name}, the house rules of the fan league ${SITE_NAME} grew out of, where an eviction costs more the earlier it comes. `,
      ),
  );

  const stats = [
    { value: `${minTeams}–${maxTeams}`, label: 'teams per league' },
    { value: `${minRoster}–${maxRoster}`, label: 'players per roster' },
    ...(totalEvents > 0 ? [{ value: String(totalEvents), label: 'scored events' }] : []),
    ...(shows.length > 0
      ? [{ value: String(shows.length), label: shows.length === 1 ? 'show' : 'shows' }]
      : []),
  ];

  const scoringCell =
    totalEvents > 0
      ? `${totalEvents} scored events at set values across ${shows.length} ${shows.length === 1 ? 'show' : 'shows'}; ${rulesetsPerShow} rulesets per show`
      : 'Fixed rulesets chosen before the draft';

  return {
    shows,
    onAir,
    showsLede: `${SITE_NAME} runs leagues for ${showList}. Each show keeps its own rule book, its own words and its own colours; a league belongs to one season of one show, and everything else — the draft, the standings, the chat — works the same way for every show.`,
    howItWorks: `A league lasts one season. A commissioner creates it, picks a scoring ruleset and opens between ${minTeams} and ${maxTeams} team seats, shared by invite code or QR code. Every team snake-drafts contestants onto a roster of up to ${maxRoster}, each episode's results are scored as they air, and the leaderboard ranks every team live until the finale.`,
    scoringLede: `Every event has a set point value, and every league picks a ruleset for its show before the draft: Classic scores only what the broadcast shows, Balanced turns the variance down, and Drama & Social adds the alliances, blowups and tears. ${houseRules.join('')}Every point on a leaderboard traces to the aired result that produced it.`,
    leagueSetup: `Leagues hold between ${minTeams} and ${maxTeams} teams, and each roster carries ${minRoster} to ${maxRoster} players, both set by the commissioner before the draft. Rosters are drafted once and stay fixed for the season. Each episode shows a roster lock time — ${DEFAULT_LOCK_OFFSET_MINUTES} minutes before airtime by default, and a commissioner can move it up to ${maxLockHours} hours earlier.`,
    stats,
    comparison: `Most fantasy leagues for reality TV still live in a spreadsheet and a group chat, where one person keys in every result and settles every dispute. ${SITE_NAME} replaces that with an auditable ledger: results are captured from published season results, every correction is recorded, and standings recompute from the ledger rather than from a formula somebody edited.`,
    comparisonRows: [
      {
        feature: 'Results',
        compBeast: 'Captured from published season results, reviewed before publishing',
        spreadsheet: 'Typed in by one person after each episode',
      },
      {
        feature: 'Draft',
        compBeast: 'Live snake-draft board, enforced turn order, pick-due alerts',
        spreadsheet: 'Turns taken over messages',
      },
      {
        feature: 'Scoring',
        compBeast: scoringCell,
        spreadsheet: 'A formula anyone with the link can edit',
      },
      {
        feature: 'Corrections',
        compBeast: 'Audited; standings recompute from the ledger',
        spreadsheet: 'Overwritten cells, no history',
      },
      {
        feature: 'Standings',
        compBeast: 'Live leaderboard with episode-by-episode breakdowns',
        spreadsheet: 'Recalculated by hand',
      },
      { feature: 'Cost', compBeast: 'Free', spreadsheet: 'Free' },
    ],
  };
}

interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Each answer is complete on its own — a model that quotes one block should
 * hand the reader the whole answer, not half of it and a link.
 */
function buildFaq(facts: Facts, emailAlerts: boolean): FaqItem[] {
  const { minTeams, maxTeams, minRoster, maxRoster } = LEAGUE_LIMITS;
  const maxLockHours = MAX_LOCK_OFFSET_MINUTES / 60;
  const names = facts.shows.map((s) => s.showName);
  const showList =
    names.length > 1
      ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
      : (names[0] ?? 'reality competition TV');

  const showsAnswer = [
    ...facts.shows.map((show) => {
      const s = show.season;
      const state = !s
        ? 'is between seasons'
        : s.status === 'ACTIVE'
          ? `is airing now — ${s.name}`
          : `is up next — ${s.name}${s.startsAt ? ` premieres ${premiereLabel(s.startsAt)}` : ''}`;
      return `${show.showName} ${state}.`;
    }),
    'Each show has its own rule book and vocabulary, and leagues can be created for any season that is upcoming or airing. Results are captured from published season results and reviewed before they reach a leaderboard.',
  ].join(' ');

  const scoringAnswer = [
    `Each league picks one ruleset for its show before its draft — ${facts.shows[0]?.rulesetNames.join(', ') ?? 'Classic, Balanced or Drama & Social'}.`,
    ...facts.shows
      .filter((show) => show.headline.length >= 3)
      .map(
        (show) =>
          `Under ${show.showName}'s ${show.defaultRulesetName}: ${show.headline
            .slice(0, 3)
            .map((e) => `${e.label} ${formatPoints(e.points)}`)
            .join(', ')}.`,
      ),
    "Results are recorded as each episode airs, and a team earns a contestant's points for every episode it rostered them.",
  ].join(' ');

  return [
    {
      question: `What is ${SITE_NAME}?`,
      answer: `${SITE_NAME} is a free fantasy league app for reality competition TV — ${showList}. Friends form a league, snake-draft the real cast, and earn points every episode from what happens on the broadcast — competition wins, blindsides, eliminations and the finale — while a live leaderboard ranks every team in the league.`,
    },
    {
      question: `Is ${SITE_NAME} free to play?`,
      answer: `Yes. Creating a league, joining one and playing a whole season are free, and there is no paid tier. Sign in, create or join a league, and you are in. ${SITE_NAME} runs in a modern web browser on a phone or computer, so there is nothing to install.`,
    },
    {
      question: 'Which shows can I play?',
      answer: showsAnswer,
    },
    {
      question: 'How does the draft work?',
      answer: `Every league runs a live snake draft. The commissioner sets the roster size, from ${minRoster} to ${maxRoster} players per team, and starts the draft once at least two teams are seated. Pick order reverses each round, the board updates for everyone within seconds, and each manager gets an alert when their pick is due.`,
    },
    {
      question: 'How is scoring calculated?',
      answer: scoringAnswer,
    },
    {
      question: 'How many people can join a league?',
      answer: `A league holds between ${minTeams} and ${maxTeams} teams. The commissioner sets the cap when creating the league and can raise it later. Everyone joins with the league's invite code — typed in, scanned from its QR code, or sent as a one-tap invite to a friend inside the app. There is no public league directory.`,
    },
    {
      question: 'Can I change my roster during the season?',
      answer: `Not yet. Rosters are set at the draft and stay fixed for the season, so every point is attributable to exactly one team. Each league still shows a lock time every episode — ${DEFAULT_LOCK_OFFSET_MINUTES} minutes before airtime by default, adjustable by the commissioner up to ${maxLockHours} hours earlier — so everyone can see when an episode closes.`,
    },
    {
      question: 'Can I play a season that has already finished?',
      answer:
        'No. Leagues can only be created or joined for seasons that are upcoming or currently airing; drafting a cast whose results are already known is not a game. Finished seasons stay online as read-only archives that rank every contestant by fantasy points beside where they actually placed.',
    },
    {
      question: 'How do I know when something happens in my league?',
      answer: `${SITE_NAME} notifies you when a friend invites you to a league, when someone joins, when the draft starts, when your pick is due, when the draft completes and when a commissioner changes league settings. ${
        emailAlerts
          ? 'Alerts collect under the bell in the header and can also arrive by email, with per-category switches on your account page and one-click unsubscribe.'
          : 'Alerts collect under the bell in the header.'
      }`,
    },
    {
      question: 'What data does it keep, and can I delete it?',
      answer: `${SITE_NAME} keeps your email, display name and avatar from sign-in, the leagues you are in, your picks and the messages you post in a league; nothing is sold or used for advertising, and the only cookies are the ones that keep you signed in. You can delete your account and everything in it from your account page at any time. The privacy policy lists every item and every provider.`,
    },
  ];
}

function applicationNode(facts: Facts) {
  const { minTeams, maxTeams, minRoster, maxRoster } = LEAGUE_LIMITS;
  const totalEvents = facts.shows.reduce((sum, s) => sum + s.eventCount, 0);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': `${absoluteUrl(HOME_PATH)}#app`,
    name: SITE_NAME,
    url: absoluteUrl(HOME_PATH),
    description: SITE_DESCRIPTION,
    applicationCategory: 'GameApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    inLanguage: 'en',
    about: facts.shows.map((show) => tvSeriesNode(show.showSlug, show.showName)),
    featureList: [
      `Live snake draft for ${minTeams}–${maxTeams} teams`,
      `Rosters of ${minRoster}–${maxRoster} players`,
      ...(totalEvents > 0 ? [`${totalEvents} scored events across ${facts.shows.length} shows`] : []),
      'Live leaderboard with episode-by-episode breakdowns',
      'Invite codes, QR codes and friend invites',
      'In-app notifications for draft turns and league changes',
      'Finished-season archives ranked by fantasy points',
    ],
    publisher: { '@id': organizationId() },
    isPartOf: { '@id': websiteId() },
  };
}

function faqNode(faq: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${absoluteUrl(HOME_PATH)}#faq`,
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}
