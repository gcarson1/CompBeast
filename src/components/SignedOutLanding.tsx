import Link from 'next/link';
import { SignInButton } from '@clerk/nextjs';
import type { ReactNode } from 'react';
import { BeastDoodle } from '@/components/doodles/BeastDoodle';
import { Doodle } from '@/components/doodles/Doodle';
import { JsonLd } from '@/components/JsonLd';
import { Reveal } from '@/components/motion/Reveal';
import { Sticker } from '@/components/Sticker';
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
import { lexiconFor, lower, type ShowLexicon } from '@/lib/shows/lexicon';
import {
  FLAGSHIP_SHOW_NAME,
  FLAGSHIP_SHOW_SLUG,
  HEADLINE_EVENT_COUNT,
  showcaseEventsFor,
} from '@/lib/shows/registry';
import { formatPoints, pointsTone } from '@/lib/ui';
import { LEAGUE_LIMITS } from '@/lib/validation';
import type { getRuleBook } from '@/server/queries';

type RuleBook = Awaited<ReturnType<typeof getRuleBook>>;

/** The season the copy talks about — the airing one when there is one. */
export interface LandingSeason {
  slug: string;
  name: string;
  status: 'ACTIVE' | 'UPCOMING';
  contestantCount: number;
  showName: string;
  showSlug: string;
  /** `Show.lexicon` as stored, resolved by `lexiconFor`. */
  showLexicon: unknown;
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
 * The page is written for two readers at once. A person skimming on a phone
 * gets the display headline and one paragraph per section. A crawler or a
 * language model gets the same paragraphs as self-contained answers: each
 * one opens its section, says the whole thing in 40–60 words, and is dense
 * with the names it needs to know what this is about — Comp Beast, the
 * featured show, its competitions and its vocabulary — because that is how
 * a model decides whether a page answers the question it was asked. The
 * show's words come from its lexicon and its headline events from the show
 * registry, so the same page pitches whichever show is airing.
 *
 * Every number on the page is read from the same place the app enforces it:
 * the scoring table and the point values in the prose come from the live
 * rule book, the league sizes from the validation schema, the lock times
 * from `cycles.ts`. The FAQ is one array rendered twice, as text and as
 * FAQPage JSON-LD, so the schema cannot say something the page does not.
 *
 * Copy is left-aligned throughout. Centring a whole page is the fastest way
 * to make it read as generated: it gives every block the same axis, so
 * nothing leads, and it forces the eye to re-find the start of each line.
 */
export function SignedOutLanding({
  live,
  season,
  rulesets,
  emailAlerts,
}: {
  /** The airing cast, the last scored events and the buzz panel — passed in
   *  so the signed-in home renders the identical block. */
  live: ReactNode;
  season: LandingSeason | null;
  rulesets: RuleBook;
  /** Whether alerts can also go out by email in this deployment. */
  emailAlerts: boolean;
}) {
  const facts = deriveFacts(season, rulesets);
  const faq = buildFaq(facts, emailAlerts);
  const { showName, showSlug } = facts;

  return (
    <div className="pt-6">
      <JsonLd data={applicationNode(facts, showSlug, showName)} />
      <JsonLd data={faqNode(faq)} />

      <header className="relative">
        {/* Still a CSS entrance and still visible in the HTML — nothing in
            the hero may start at opacity 0 (see the `rise` keyframe). The
            eyebrow is now a sticker; the camera beside it is decoration. */}
        <p className="animate-rise">
          <Sticker tone="gold" size="lg" tilt="l">
            Free fantasy leagues for {showName}
          </Sticker>
        </p>
        <Doodle
          kind="camera"
          tone="sky"
          className="absolute right-0 -top-3 h-10 w-10 -rotate-12 animate-rise [animation-delay:90ms]"
        />

        <h1 className="mt-3 animate-rise font-display text-5xl leading-[0.92] tracking-wide [animation-delay:60ms] sm:text-[64px] lg:text-[76px]">
          DRAFT THE CAST.
          <br />
          <span className="text-brand-gold">OWN THE LEADERBOARD.</span>
        </h1>

        {/* The lede sits on a measure, not on the container's width: the display
            face wants the full column, body copy does not. The two different
            widths are what give the block its asymmetry. */}
        <p className="mt-5 max-w-measure animate-rise text-md leading-relaxed text-muted [animation-delay:120ms]">
          {facts.lede}
        </p>

        <div className="mt-7 flex animate-rise flex-wrap items-center gap-3 [animation-delay:180ms]">
          <SignInButton mode="modal">
            <button type="button" className="btn-primary px-10 py-3.5 text-md">
              Sign in
            </button>
          </SignInButton>
          <Link href="/rules" className="btn-ghost">
            See scoring rules
          </Link>
        </div>
      </header>

      <div className="mt-14">{live}</div>

      <Section id="how-it-works" title="How it works" lede={facts.howItWorks}>
        {/* Three claims as a numbered, hairline-separated list on a narrow/wide
            column split — deliberately not a three-up card grid. Cards here
            would be three equal boxes of two sentences each, which is the
            shape every generated landing page reaches for, and it flattens the
            claims into decoration instead of letting them read in order. */}
        <ol className="mt-5 divide-y divide-hairline border-y border-hairline">
          {facts.claims.map((claim) => (
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

      {facts.scoring && (
        <Section id="scoring" title={`How ${showName} fantasy scoring works`} lede={facts.scoring.lede}>
          <figure className="mt-5">
            {/* `table-fixed` with the event column at 40%: a phone is 335px
                wide inside the gutters, and left to auto-layout the fourth
                column fell off the edge behind a scrollbar nobody sees. */}
            <div className="card overflow-hidden">
              <table className="w-full table-fixed text-xs">
                <caption className="sr-only">
                  Point values for selected {showName} events under each Comp Beast ruleset
                </caption>
                <colgroup>
                  <col className="w-[40%]" />
                  {facts.scoring.columns.map((column) => (
                    <col key={column.id} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="bg-canvas/60 text-2xs uppercase tracking-wide text-muted">
                    <th scope="col" className="px-3 py-2.5 text-left font-semibold">
                      Event
                    </th>
                    {facts.scoring.columns.map((column) => (
                      <th key={column.id} scope="col" className="px-2 py-2.5 text-right font-semibold">
                        {column.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {facts.scoring.rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row" className="px-3 py-2.5 text-left font-medium leading-snug text-ink">
                        {row.label}
                      </th>
                      {row.points.map((points, i) => (
                        <td
                          key={facts.scoring!.columns[i].id}
                          className={`px-2 py-2.5 text-right font-semibold tabular-nums ${
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
            <figcaption className="mt-2 text-2xs text-muted">
              {facts.scoring.rows.length} of {facts.eventCount} scored events. A dash means the ruleset does
              not score that event.{' '}
              {/* Underlined because it sits inside running text; colour
                  alone is not a distinguishable link (WCAG 1.4.1). */}
              <Link
                href="/rules"
                className="text-brand-gold-deep underline decoration-brand-gold-deep/40 underline-offset-2"
              >
                See the full table →
              </Link>
            </figcaption>
          </figure>
        </Section>
      )}

      <Section id="league-setup" title="League sizes, drafts and roster locks" lede={facts.leagueSetup}>
        {/* One colour block per number, and the Beast on the last one: the
            landing page's one bento row. `pt-6` is the room the mascot's
            overhang needs above the tiles. */}
        <dl className="mt-5 grid grid-cols-2 gap-3 pt-6 sm:grid-cols-4">
          {facts.stats.map((stat, i) => (
            <div
              key={stat.label}
              className={`${STAT_TONES[i % STAT_TONES.length]} relative flex flex-col p-4`}
            >
              {i === facts.stats.length - 1 && (
                <BeastDoodle mood="wink" className="absolute -right-3 -top-8 h-16 w-16 rotate-6" />
              )}
              <dd className="order-1 font-display text-3xl leading-none tracking-wide">{stat.value}</dd>
              <dt className="order-2 mt-2 text-2xs font-semibold leading-snug text-tile-muted">
                {stat.label}
              </dt>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="compare" title={`${SITE_NAME} vs. a spreadsheet league`} lede={facts.comparison}>
        <div className="card mt-5 overflow-hidden">
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
              <tr className="bg-canvas/60 text-2xs uppercase tracking-wide text-muted">
                <th scope="col" className="px-3 py-2.5 text-left font-semibold">
                  <span className="sr-only">Feature</span>
                </th>
                <th scope="col" className="px-2 py-2.5 text-left font-semibold text-brand-gold-deep">
                  {SITE_NAME}
                </th>
                <th scope="col" className="px-2 py-2.5 text-left font-semibold">
                  Spreadsheet + group chat
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline align-top">
              {facts.comparisonRows.map((row) => (
                <tr key={row.feature}>
                  <th scope="row" className="px-3 py-3 text-left font-medium leading-snug text-ink">
                    {row.feature}
                  </th>
                  <td className="px-2 py-3 leading-snug text-ink">{row.compBeast}</td>
                  <td className="px-2 py-3 leading-snug text-muted">{row.spreadsheet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="faq" title="Frequently asked questions">
        <ul className="mt-2 divide-y divide-hairline border-b border-hairline">
          {faq.map((item) => (
            <li key={item.question} className="py-5">
              <h3 className="text-base font-semibold">{item.question}</h3>
              <p className="mt-1.5 max-w-measure text-sm leading-relaxed text-muted">{item.answer}</p>
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
 * A section is a heading, one paragraph that answers it, and the detail.
 * `aria-labelledby` rather than a bare `<section>`: only a labelled section
 * is a landmark, which is what lets a screen reader jump between them.
 */
function Section({
  id,
  title,
  lede,
  children,
}: {
  id: string;
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <Reveal as="section" className="mt-14" aria-labelledby={id}>
      <h2 id={id} className="section-title">
        {title}
      </h2>
      {lede && <p className="mt-3 max-w-measure text-sm leading-relaxed text-muted">{lede}</p>}
      {children}
    </Reveal>
  );
}

// Spelled out for Tailwind's content scan.
const STAT_TONES = ['card-pop-gold', 'card-pop-lavender', 'card-pop-mint', 'card-pop-sky'] as const;

function buildClaims(lexicon: ShowLexicon) {
  return [
    {
      step: '01',
      title: `Draft the real ${lower(lexicon.contestantPlural)}`,
      body: 'Snake-draft the live cast before the season locks in.',
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
}

interface Facts {
  season: LandingSeason | null;
  showName: string;
  showSlug: string;
  lexicon: ShowLexicon;
  claims: ReturnType<typeof buildClaims>;
  eventCount: number;
  rulesetCount: number;
  rulesetNames: string[];
  defaultRulesetName: string | null;
  /** Point value under the default ruleset, by event code. */
  defaultPoints: Map<string, number>;
  /** The headline events as "label points" pairs, for the prose. */
  headline: Array<{ label: string; points: number }>;
  lede: string;
  howItWorks: string;
  scoring: {
    lede: string;
    columns: Array<{ id: string; name: string }>;
    rows: Array<{ label: string; points: Array<number | null> }>;
  } | null;
  leagueSetup: string;
  stats: Array<{ value: string; label: string }>;
  comparison: string;
  comparisonRows: Array<{ feature: string; compBeast: string; spreadsheet: string }>;
}

function deriveFacts(season: LandingSeason | null, rulesets: RuleBook): Facts {
  const showName = season?.showName ?? FLAGSHIP_SHOW_NAME;
  const showSlug = season?.showSlug ?? FLAGSHIP_SHOW_SLUG;
  const lexicon = lexiconFor(showSlug, season?.showLexicon);
  const contestants = lower(lexicon.contestantPlural);
  const cycle = lower(lexicon.cycleSingular);
  const eventIds = new Set(rulesets.flatMap((r) => r.eventDefinitions.map((l) => l.eventDefinition.id)));
  const eventCount = eventIds.size;
  const rulesetNames = rulesets.map((r) => r.name);
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

  const seasonSentence = !season
    ? 'New seasons open for leagues as soon as their cast is announced.'
    : season.status === 'ACTIVE'
      ? season.contestantCount > 0
        ? `${season.name} is airing now with a ${season.contestantCount}-${lower(lexicon.contestantSingular)} cast.`
        : `${season.name} is airing now.`
      : `${season.name} is open for leagues ahead of its premiere.`;

  const { minTeams, maxTeams, minRoster, maxRoster } = LEAGUE_LIMITS;
  const maxLockHours = MAX_LOCK_OFFSET_MINUTES / 60;

  const showcase = showcaseEventsFor(showSlug);
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

  let scoring: Facts['scoring'] = null;
  if (defaultRuleset && eventCount > 0) {
    const rows = showcase.flatMap((code) => {
      const label = labelFor(code);
      if (!label) return [];
      return [{ label, points: rulesets.map((r) => pointsIn(r, code)) }];
    });

    scoring = {
      lede:
        headline.length >= 3
          ? `${SITE_NAME} scores ${eventCount} ${showName} events across ${rulesets.length} rulesets, each with a fixed point value. Under the default ${defaultRuleset.name} rules: ${headlineSentence}. Every point traces to the aired result that produced it.`
          : `${SITE_NAME} scores ${eventCount} ${showName} events across ${rulesets.length} rulesets, each with a fixed point value. Every league picks its ruleset before the draft, and every point on the leaderboard traces back to the aired result that produced it.`,
      columns: rulesets.map((r) => ({ id: r.id, name: r.name })),
      rows,
    };
  }

  const stats = [
    { value: `${minTeams}–${maxTeams}`, label: 'teams per league' },
    { value: `${minRoster}–${maxRoster}`, label: `${contestants} per roster` },
    ...(eventCount > 0 ? [{ value: String(eventCount), label: 'scored events' }] : []),
    ...(rulesets.length > 0
      ? [
          {
            value: String(rulesets.length),
            label: rulesets.length === 1 ? 'scoring ruleset' : 'scoring rulesets',
          },
        ]
      : []),
  ];

  const scoringCell =
    eventCount > 0
      ? `${eventCount} scored events at fixed values; ${rulesets.length} ${
          rulesets.length === 1 ? 'ruleset' : 'rulesets'
        } to choose from`
      : 'Fixed rulesets chosen before the draft';

  return {
    season,
    showName,
    showSlug,
    lexicon,
    claims: buildClaims(lexicon),
    eventCount,
    rulesetCount: rulesets.length,
    rulesetNames,
    defaultRulesetName: defaultRuleset?.name ?? null,
    defaultPoints,
    headline,
    lede: `${SITE_DESCRIPTION} ${seasonSentence}`,
    howItWorks: `A league lasts one season. A commissioner creates it, picks a scoring ruleset and opens between ${minTeams} and ${maxTeams} team seats, shared by invite code or QR code. Every team snake-drafts ${contestants} onto a roster of up to ${maxRoster}, each ${cycle}'s results are scored as they air, and the leaderboard ranks every team live until the finale.`,
    scoring,
    leagueSetup: `Leagues hold between ${minTeams} and ${maxTeams} teams, and each roster carries ${minRoster} to ${maxRoster} ${contestants}, both set by the commissioner before the draft. Rosters are drafted once and stay fixed for the season. Each ${cycle} shows a roster lock time — ${DEFAULT_LOCK_OFFSET_MINUTES} minutes before airtime by default, and a commissioner can move it up to ${maxLockHours} hours earlier.`,
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
        compBeast: `Live leaderboard with ${cycle}-by-${cycle} breakdowns`,
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
  const { season, showName, lexicon } = facts;
  const contestant = lower(lexicon.contestantSingular);
  const contestants = lower(lexicon.contestantPlural);
  const cycle = lower(lexicon.cycleSingular);
  const { minTeams, maxTeams, minRoster, maxRoster } = LEAGUE_LIMITS;
  const maxLockHours = MAX_LOCK_OFFSET_MINUTES / 60;

  const seasonClause = !season
    ? ''
    : season.status === 'ACTIVE'
      ? `, and ${season.name} is airing now`
      : `, and ${season.name} is open for leagues`;

  const examples = facts.headline.slice(0, 3);
  const rulesetList =
    facts.rulesetNames.length > 1
      ? `${facts.rulesetNames.slice(0, -1).join(', ')} or ${facts.rulesetNames.at(-1)}`
      : (facts.rulesetNames[0] ?? '');

  const scoringAnswer =
    facts.rulesetCount > 0
      ? [
          `Each league picks one of ${facts.rulesetCount} ${
            facts.rulesetCount === 1 ? 'ruleset' : 'rulesets'
          } before its draft: ${rulesetList}.`,
          facts.defaultRulesetName && examples.length === 3
            ? `Every event has a fixed value — under ${facts.defaultRulesetName}: ${examples
                .map((e) => `${e.label} ${formatPoints(e.points)}`)
                .join(', ')}.`
            : 'Every scorable event has a fixed point value.',
          `Results are recorded as each ${cycle} airs, and a team earns a ${contestant}'s points for every ${cycle} it rostered them.`,
        ].join(' ')
      : `Every scorable event has a fixed point value. Results are recorded as each ${cycle} airs, and a team earns a ${contestant}'s points for every ${cycle} it rostered them.`;

  return [
    {
      question: `What is ${SITE_NAME}?`,
      answer: `${SITE_NAME} is a free fantasy league app for reality competition TV — Big Brother, Survivor and more. Friends form a league, snake-draft the real cast, and earn points every episode from what happens on the broadcast — competition wins, blindsides, eliminations and the finale — while a live leaderboard ranks every team in the league.`,
    },
    {
      question: `Is ${SITE_NAME} free to play?`,
      answer: `Yes. Creating a league, joining one and playing a whole season are free, and there is no paid tier. Sign in, create or join a league, and you are in. ${SITE_NAME} runs in the browser on any phone or computer, so there is nothing to install.`,
    },
    {
      question: 'Which shows can I play?',
      answer: `${showName} is fully supported${seasonClause}. Big Brother and Survivor each have their own rule book and vocabulary, and leagues can be created for any season that is upcoming or airing. Everything else — leagues, drafts, scoring, standings — works the same way for every show, so adding another is a matter of data, not a rebuild.`,
    },
    {
      question: 'How does the draft work?',
      answer: `Every league runs a live snake draft. The commissioner sets the roster size, from ${minRoster} to ${maxRoster} ${contestants} per team, and starts the draft once at least two teams are seated. Pick order reverses each round, the board updates for everyone within seconds, and each manager gets an alert when their pick is due.`,
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
      answer: `Not yet. Rosters are set at the draft and stay fixed for the season, so every point is attributable to exactly one team. Each league still shows a lock time every ${cycle} — ${DEFAULT_LOCK_OFFSET_MINUTES} minutes before airtime by default, adjustable by the commissioner up to ${maxLockHours} hours earlier — so everyone can see when a week closes.`,
    },
    {
      question: 'Can I play a season that has already finished?',
      answer: `No. Leagues can only be created or joined for seasons that are upcoming or currently airing; drafting a cast whose results are already known is not a game. Finished seasons stay online as read-only archives that rank every ${contestant} by fantasy points beside where they actually placed.`,
    },
    {
      question: 'How do I know when something happens in my league?',
      answer: `${SITE_NAME} notifies you when a friend invites you to a league, when someone joins, when the draft starts, when your pick is due, when the draft completes and when a commissioner changes league settings. ${
        emailAlerts
          ? 'Alerts collect under the bell in the header and can also arrive by email, with per-category switches on your account page and one-click unsubscribe.'
          : 'Alerts collect under the bell in the header.'
      }`,
    },
  ];
}

function applicationNode(facts: Facts, showSlug: string, showName: string) {
  const { minTeams, maxTeams, minRoster, maxRoster } = LEAGUE_LIMITS;
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
    about: tvSeriesNode(showSlug, showName),
    featureList: [
      `Live snake draft for ${minTeams}–${maxTeams} teams`,
      `Rosters of ${minRoster}–${maxRoster} ${lower(facts.lexicon.contestantPlural)}`,
      ...(facts.eventCount > 0
        ? [`${facts.eventCount} scored events across ${facts.rulesetCount} rulesets`]
        : []),
      `Live leaderboard with ${lower(facts.lexicon.cycleSingular)}-by-${lower(facts.lexicon.cycleSingular)} breakdowns`,
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
