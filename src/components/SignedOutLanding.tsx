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
 * with the names it needs to know what this is about — Comp Beast, Big
 * Brother, CBS, Head of Household, Power of Veto — because that is how a
 * model decides whether a page answers the question it was asked.
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
  const showName = season?.showName ?? 'Big Brother';
  const showSlug = season?.showSlug ?? 'big-brother';

  return (
    <div className="pt-6">
      <JsonLd data={applicationNode(facts, showSlug, showName)} />
      <JsonLd data={faqNode(faq)} />

      <header className="relative">
        {/* Still a CSS entrance and still visible in the HTML — nothing in
            the hero may start at opacity 0 (see the `rise` keyframe). The
            eyebrow is now a sticker; the camera beside it is decoration. */}
        <p className="animate-rise">
          <Sticker tone="gold" tilt="l">
            Free fantasy leagues for {showName}
          </Sticker>
        </p>
        <Doodle kind="camera" tone="sky" className="absolute right-0 -top-3 h-10 w-10 -rotate-12 animate-rise [animation-delay:90ms]" />

        <h1 className="mt-3 animate-rise font-display text-5xl leading-[0.92] tracking-wide [animation-delay:60ms] sm:text-[64px] lg:text-[76px]">
          DRAFT THE HOUSE.
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
              {facts.scoring.rows.length} of {facts.eventCount} scored events. A dash means the ruleset
              does not score that event.{' '}
              {/* Underlined because it sits inside running text; colour
                  alone is not a distinguishable link (WCAG 1.4.1). */}
              <Link href="/rules" className="text-brand-gold-deep underline decoration-brand-gold-deep/40 underline-offset-2">
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
            <div key={stat.label} className={`${STAT_TONES[i % STAT_TONES.length]} relative flex flex-col p-4`}>
              {i === facts.stats.length - 1 && (
                <BeastDoodle mood="wink" className="absolute -right-3 -top-8 h-16 w-16 rotate-6" />
              )}
              <dd className="order-1 font-display text-3xl leading-none tracking-wide">{stat.value}</dd>
              <dt className="order-2 mt-2 text-2xs font-semibold leading-snug text-tile-muted">{stat.label}</dt>
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
      <h2 id={id} className="headline text-brand-gold-deep">
        {title}
      </h2>
      {lede && <p className="mt-3 max-w-measure text-sm leading-relaxed text-muted">{lede}</p>}
      {children}
    </Reveal>
  );
}

// Spelled out for Tailwind's content scan.
const STAT_TONES = ['card-pop-gold', 'card-pop-lavender', 'card-pop-mint', 'card-pop-sky'] as const;

const CLAIMS = [
  {
    step: '01',
    title: 'Draft real houseguests',
    body: 'Snake-draft the live cast before the season locks in.',
  },
  {
    step: '02',
    title: 'Score every move',
    body: 'HOH wins, vetos, blindsides and blowups all count toward your team.',
  },
  {
    step: '03',
    title: 'Live leaderboard',
    body: 'Ranks update episode by episode, all season long.',
  },
];

/**
 * The events the scoring table shows, in this order: the ones every Big
 * Brother viewer already knows, then one that only the drama ruleset scores,
 * so the dash column is visibly *a choice* and not missing data. Rows whose
 * code is absent from the rule book are skipped, so a show without a jury
 * simply has a shorter table.
 */
const SHOWCASE_EVENTS = [
  'HOH_WIN',
  'VETO_WIN',
  'NOMINATED',
  'WEEK_SURVIVED',
  'REACHED_JURY',
  'JURY_VOTE_RECEIVED',
  'PLACEMENT_WINNER',
  'CONFRONTATION_WIN',
  'CRIED',
];

interface Facts {
  season: LandingSeason | null;
  showName: string;
  eventCount: number;
  rulesetCount: number;
  rulesetNames: string[];
  defaultRulesetName: string | null;
  /** Point value under the default ruleset, by event code. */
  defaultPoints: Map<string, number>;
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
  const showName = season?.showName ?? 'Big Brother';
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
      defaultPoints.set(link.eventDefinition.code, Number(link.pointsOverride ?? link.eventDefinition.points));
    }
  }

  const seasonSentence = !season
    ? 'New seasons open for leagues as soon as their cast is announced.'
    : season.status === 'ACTIVE'
      ? season.contestantCount > 0
        ? `${season.name} is airing now with a ${season.contestantCount}-houseguest cast.`
        : `${season.name} is airing now.`
      : `${season.name} is open for leagues ahead of its premiere.`;

  const { minTeams, maxTeams, minRoster, maxRoster } = LEAGUE_LIMITS;
  const maxLockHours = MAX_LOCK_OFFSET_MINUTES / 60;

  let scoring: Facts['scoring'] = null;
  if (defaultRuleset && eventCount > 0) {
    const rows = SHOWCASE_EVENTS.flatMap((code) => {
      const def = rulesets
        .flatMap((r) => r.eventDefinitions)
        .find((l) => l.eventDefinition.code === code)?.eventDefinition;
      if (!def) return [];
      return [{ label: def.label, points: rulesets.map((r) => pointsIn(r, code)) }];
    });

    const example = ['HOH_WIN', 'VETO_WIN', 'NOMINATED', 'WEEK_SURVIVED', 'REACHED_JURY', 'PLACEMENT_WINNER'].map(
      (code) => defaultPoints.get(code),
    );
    const hasExample = example.every((p) => p !== undefined);
    const [hoh, veto, nominated, survived, jury, winner] = example.map((p) => formatPoints(p ?? 0));

    scoring = {
      lede: hasExample
        ? `${SITE_NAME} scores ${eventCount} ${showName} events across ${rulesets.length} rulesets, each with a fixed point value. Under the default ${defaultRuleset.name} rules a Head of Household win is ${hoh}, a Power of Veto win ${veto}, a nomination ${nominated}, surviving the week ${survived}, reaching the jury ${jury} and winning the season ${winner}. Every point traces to the aired result that produced it.`
        : `${SITE_NAME} scores ${eventCount} ${showName} events across ${rulesets.length} rulesets, each with a fixed point value. Every league picks its ruleset before the draft, and every point on the leaderboard traces back to the aired result that produced it.`,
      columns: rulesets.map((r) => ({ id: r.id, name: r.name })),
      rows,
    };
  }

  const stats = [
    { value: `${minTeams}–${maxTeams}`, label: 'teams per league' },
    { value: `${minRoster}–${maxRoster}`, label: 'houseguests per roster' },
    ...(eventCount > 0 ? [{ value: String(eventCount), label: 'scored events' }] : []),
    ...(rulesets.length > 0
      ? [{ value: String(rulesets.length), label: rulesets.length === 1 ? 'scoring ruleset' : 'scoring rulesets' }]
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
    eventCount,
    rulesetCount: rulesets.length,
    rulesetNames,
    defaultRulesetName: defaultRuleset?.name ?? null,
    defaultPoints,
    lede: `${SITE_DESCRIPTION} ${seasonSentence}`,
    howItWorks: `A league lasts one season. A commissioner creates it, picks a scoring ruleset and opens between ${minTeams} and ${maxTeams} team seats, shared by invite code or QR code. Every team snake-drafts houseguests onto a roster of up to ${maxRoster}, each week's results are scored as they air, and the leaderboard ranks every team live until the finale.`,
    scoring,
    leagueSetup: `Leagues hold between ${minTeams} and ${maxTeams} teams, and each roster carries ${minRoster} to ${maxRoster} houseguests, both set by the commissioner before the draft. Rosters are drafted once and stay fixed for the season. Each week shows a roster lock time — ${DEFAULT_LOCK_OFFSET_MINUTES} minutes before airtime by default, and a commissioner can move it up to ${maxLockHours} hours earlier.`,
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
        compBeast: 'Live leaderboard with week-by-week breakdowns',
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
  const { season, showName } = facts;
  const { minTeams, maxTeams, minRoster, maxRoster } = LEAGUE_LIMITS;
  const maxLockHours = MAX_LOCK_OFFSET_MINUTES / 60;

  const seasonClause = !season
    ? ''
    : season.status === 'ACTIVE'
      ? `, and ${season.name} is airing now`
      : `, and ${season.name} is open for leagues`;

  const hoh = facts.defaultPoints.get('HOH_WIN');
  const nominated = facts.defaultPoints.get('NOMINATED');
  const winner = facts.defaultPoints.get('PLACEMENT_WINNER');
  const rulesetList =
    facts.rulesetNames.length > 1
      ? `${facts.rulesetNames.slice(0, -1).join(', ')} or ${facts.rulesetNames.at(-1)}`
      : facts.rulesetNames[0] ?? '';

  const scoringAnswer =
    facts.rulesetCount > 0
      ? [
          `Each league picks one of ${facts.rulesetCount} ${
            facts.rulesetCount === 1 ? 'ruleset' : 'rulesets'
          } before its draft: ${rulesetList}.`,
          facts.defaultRulesetName && hoh !== undefined && nominated !== undefined && winner !== undefined
            ? `Every event has a fixed value — under ${facts.defaultRulesetName} a Head of Household win is ${formatPoints(hoh)}, a nomination ${formatPoints(nominated)} and winning the season ${formatPoints(winner)}.`
            : 'Every scorable event has a fixed point value.',
          "Results are recorded as each week airs, and a team earns a houseguest's points for every week it rostered them.",
        ].join(' ')
      : "Every scorable event has a fixed point value. Results are recorded as each week airs, and a team earns a houseguest's points for every week it rostered them.";

  return [
    {
      question: `What is ${SITE_NAME}?`,
      answer: `${SITE_NAME} is a free fantasy league app for reality TV, starting with CBS's Big Brother. Friends form a league, snake-draft the real houseguests, and earn points every week from what happens on the broadcast — competition wins, nominations, vetoes, evictions and the finale — while a live leaderboard ranks every team in the league.`,
    },
    {
      question: `Is ${SITE_NAME} free to play?`,
      answer: `Yes. Creating a league, joining one and playing a whole season are free, and there is no paid tier. Sign in, create or join a league, and you are in. ${SITE_NAME} runs in the browser on any phone or computer, so there is nothing to install.`,
    },
    {
      question: 'Which shows can I play?',
      answer: `${showName} is fully supported${seasonClause}. The platform itself is show-agnostic — shows, seasons, contestants and scoring rules are all data — so other reality competitions such as Survivor or The Traitors can be added without changing how leagues, drafts or scoring work.`,
    },
    {
      question: 'How does the draft work?',
      answer: `Every league runs a live snake draft. The commissioner sets the roster size, from ${minRoster} to ${maxRoster} houseguests per team, and starts the draft once at least two teams are seated. Pick order reverses each round, the board updates for everyone within seconds, and each manager gets an alert when their pick is due.`,
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
      answer: `Not yet. Rosters are set at the draft and stay fixed for the season, so every point is attributable to exactly one team. Each league still shows a weekly lock time — ${DEFAULT_LOCK_OFFSET_MINUTES} minutes before airtime by default, adjustable by the commissioner up to ${maxLockHours} hours earlier — so everyone can see when a week closes.`,
    },
    {
      question: 'Can I play a season that has already finished?',
      answer:
        'No. Leagues can only be created or joined for seasons that are upcoming or currently airing; drafting a cast whose results are already known is not a game. Finished seasons stay online as read-only archives that rank every houseguest by fantasy points beside where they actually placed.',
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
      `Rosters of ${minRoster}–${maxRoster} houseguests`,
      ...(facts.eventCount > 0
        ? [`${facts.eventCount} scored events across ${facts.rulesetCount} rulesets`]
        : []),
      'Live leaderboard with week-by-week breakdowns',
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
