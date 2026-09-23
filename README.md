# Comp Beast

Fantasy leagues for reality TV. Multi-tenant and show-agnostic, with *Big Brother*,
*Survivor* and *The Traitors* rule sets shipped.

The platform core knows nothing about any one show. Shows, seasons, contestants, and — most
importantly — **scoring rules** are all rows in the database. Each show is a catalogue in
`src/lib/shows/` (its events, rulesets and vocabulary) that the seed installs; *The
Traitors* was added as a sibling file, an adapter and a mapper, without editing the scoring
engine, the API, or the UI. Show-scoped pages read their words — houseguest, castaway or
player; week or episode; evicted, voted out or banished — from the show's lexicon, and wear
the show's accent colour through `<ShowTheme>`; everything outside a show's pages speaks for
the platform.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 14 (App Router, Server Components) + TypeScript |
| Database | PostgreSQL via Prisma |
| Auth | Provider-neutral boundary in `src/lib/auth.ts` (Clerk / Auth.js / Supabase drop-in) |
| Styling | Tailwind CSS |
| Validation | Zod |
| Tests | Vitest |
| Checks | ESLint (`next/core-web-vitals`), Prettier, knip; all run in CI |
| Deploy | Vercel |

## Getting started

You need a running PostgreSQL server first — the app is server-rendered and every page
queries the database, so without one each route returns `Can't reach database server`.

On macOS with Homebrew:

```bash
brew services start postgresql@16
createdb compbeast
```

Then copy `.env.example` to `.env` and fill it in. All three groups are required:

- `DATABASE_URL` — a stock Homebrew install has no password and uses your macOS
  username as the superuser.
- **Clerk keys** — there is no development auth bypass, so every page that asks who you
  are fails without them.
- `PLATFORM_ADMIN_EMAILS` — your address, to reach `/admin/ingestion`. It is reconciled
  on every sign-in, so adding an address promotes an account that already exists the next
  time it signs in.

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

If you change `.env` while `npm run dev` is already running, restart it — Next.js reads
environment variables at boot, not per request.

`npm run check` runs everything CI runs — typecheck, lint, format check, dead-code scan
(knip) and the tests — and is the thing to run before pushing. `npm run format` fixes
formatting in place. The GitHub Actions workflow in `.github/workflows/ci.yml` runs the
same chain against a real Postgres, so the database-backed suites execute there rather
than skipping themselves.

The seed installs every show in `SHOW_CATALOGUE` (its events and three rulesets each), then
creates a 16-houseguest Big Brother **Demo Season** (slug `demo-big-brother`, deliberately
namespaced away from real season slugs so ingestion can claim those), a four-team demo
league (invite code `DEMO-BB27`) with a completed snake draft and three weeks of aired
results, and an upcoming 18-castaway Survivor **Demo Season** (`demo-survivor`) with a cast
and episodes but nothing scored. Season dates are anchored relative to today, so a fresh
seed always lands mid-season with the next week's roster lock still ahead of you.

## Architecture

### The decoupling

```
Show ──┬── Season ──┬── Contestant
       │            └── Cycle            (week / episode / round)
       │
       ├── EventDefinition               the rule dictionary
       └── ScoringRuleset ──── ScoringRulesetEventDefinition
                                         (which rules apply, at what value)

League ── Team ── RosterSlot ── Contestant
                  (scoped per Cycle)

ScoredEvent = Contestant × EventDefinition × Cycle    the ledger
ScoreAudit  = append-only history of every correction
```

`EventDefinition` is the hinge. The scoring engine only knows "a point value keyed by
`eventDefinitionId`" — Big Brother's HOH win and Survivor's idol play are indistinguishable
to it.

### Scoring engine (`src/lib/scoring/`)

`engine.ts` is pure and has no Prisma import, so it unit tests without a database and could
run at the edge. `repository.ts` is the only part that touches the DB.

Two decisions worth knowing about:

**Attribution is cycle-scoped.** An event counts for a team only if that team rostered the
contestant *in the cycle the event belongs to*. That is what makes weekly roster locks
mean something.

**Totals are always derived, never stored as the primary fact.** `ScoredEvent` is the
source of truth; `TeamCycleScore` is a materialized cache the recalculation job rewrites
wholesale. Recomputing everything rather than applying incremental deltas is deliberate —
it makes retroactive corrections self-healing, because no incremental path exists that
could drift from the ledger.

Corrections soft-void rather than delete (`ScoredEvent.isVoided`), and every change writes
a `ScoreAudit` row, so a player can always be shown *why* their score moved.

A ledger row snapshots the *catalogue's* value when it is recorded. A league's ruleset
may set its own value for the event (Balanced's +5 HOH, Lauren's Way's −3 nomination),
and that override always wins — it is what the league chose. Before this, the snapshot
won, and a Balanced league was quietly scored at Classic values. `pointsSource` decides
what happens when the snapshot and the *catalogue* disagree: `snapshot` (default) honors
what was recorded, so settled weeks never move when a catalogue value is edited;
`ruleset` restates history on purpose. A variable event (below) keeps its recorded value
either way.

### The Survivor model

Survivor's point values (`src/lib/shows/survivor.ts`) were set against real seasons
rather than by feel. The published community models — Purple Rock's Pick-4,
Fantasizr, the FanDuel sheet, fantasysurvivorgame.com — agree on the shape:
individual immunity is the biggest weekly event, tribe wins are a fraction of it,
the merge and the jury are milestones, and the finish is worth a few immunity wins.
On top of that consensus the model adds what a fantasy sport needs to feel weekly:
every rostered player can earn every episode (survive it, vote with the majority),
and the finale is a championship week rather than the season.

`src/lib/shows/survivor-model.test.ts` holds the model to those properties on
Survivor 49 and 50: fantasy rank tracks placement at ρ > 0.9, the finale is 20–45%
of the winner's points, and in random four-team snake drafts the team holding the
Sole Survivor wins under 75% of leagues (it was 71–85% under the old, Big
Brother-derived values, with the finale near half the winner's total). The finale
changes the league leader in about a quarter of leagues. `scripts/simulate-league.ts`
plays a league over any finished season through the real draft and scoring code
and prints the week-by-week standings, then deletes the league.

### The Traitors model

The Traitors' values (`src/lib/shows/traitors.ts`) were set against seasons 1–4 by the
same method, with one more property to hold: a draft happens before anyone knows who the
Traitors are, so the cloak must be worth something without deciding a league. A first
pass (+5 to be chosen, +2 a murder) made a Traitor worth two to four Faithfuls. At +3 for
the cloak, +1 a murder and +5 for voting out a Traitor, a Traitor averages 1.2–1.5× a
Faithful on seasons 2–4 (season 1, where the Faithful almost never caught one, is the
outlier), fantasy rank tracks the finish at ρ ≈ 0.9–0.95, the finale is a quarter to a
third of a winner's points, and the team holding a winner takes a random four-team league
31–52% of the time. `src/lib/shows/traitors-model.test.ts` holds all of it, across a
Traitor win, a lone winner and a four-way Faithful split.

### Rule sets

Three ship for each show, selectable per league (a league can only pick a ruleset from
its season's show — the server refuses a mismatch):

- **Classic** — competition and eviction outcomes only; everything is verifiable from the
  broadcast, so there is nothing to argue about.
- **Balanced** — the same events with variance turned down, so one lucky draft pick cannot
  run away with the season.
- **Drama & Social** — adds alliances, showmances, blowups, and tears.

Several rules in the spec were written as "+10 or +5". Rather than picking one, both values
live in the catalogue and each ruleset selects via `pointsOverride`.

Those three are *category* rulesets: each takes every event in its categories. A ruleset
can instead be *explicit* — a list of event codes and what each is worth — which is the
shape for a league's own house rules (`RulesetSpec` in `src/lib/shows/spec.ts`). An event
marked `optIn` is scored only by a ruleset that names it, so adding one never changes
Classic, Balanced or Drama & Social.

#### Lauren's Way

Big Brother has a fourth ruleset, named for Lauren, who ran the fan league Comp Beast grew
out of on a spreadsheet: +5 HOH, +3 veto (won, or pulled off the block by it), +4
Blockbuster, +2 week-one safety comp, +4 picked for a twist (BB28's time capsule), +2 a
twist power, −3 nominated (a replacement nomination counts), −2 Have-Not, +1 survive the
vote, +10 winner, +7 runner-up, +8 America's Favorite — and **order of eviction**: every
houseguest who leaves costs one point for each houseguest who finishes ahead of them, so
the first of seventeen out loses 16 and the runner-up loses 1.

The order of eviction is a *variable* event (`EventDefinition.isVariable`): the mapper
works out each evictee's value from the placement table and the ledger row carries it
(`IngestedEventCandidate.points` → `ScoredEvent.pointsAwarded`). `src/lib/shows/lauren.test.ts`
replays every mark on her BB28 scoresheet through the engine and matches her totals — to
the point for 11 houseguests, and one point kinder for the six who left after the week-7
double eviction, because her sheet counted the eviction by week number and that count ran
one ahead of the actual order from then on.

The results source states HOH, veto, nominations, evictions and placements, so those score
on their own. Have-Nots, the Blockbuster, twists, the safety comp and America's Favorite
are not on any results page: a platform admin records them under **Record events** on
`/admin/ingestion` — one event, one week, any number of houseguests, with an undo.

## API

| Route | Purpose |
| --- | --- |
| `GET /api/leagues/[leagueId]/leaderboard` | League standings |
| `GET /api/teams/[teamId]/score?breakdown=true` | Team total, roster, per-cycle lines |
| `POST /api/admin/events` | Batch-insert ledger rows as an episode airs (platform admin) |
| `DELETE /api/admin/events` | Retroactive correction (soft-void + recalculate) (platform admin) |

Server Actions in `src/server/actions.ts` cover league creation, joining, draft start, and
picks.

```bash
# record two events, then recalculate every league on that season
curl -X POST localhost:3000/api/admin/events \
  -H 'Content-Type: application/json' \
  -d '{"cycleId":"<id>","events":[{"contestantId":"<id>","eventCode":"HOH_WIN"}]}'
```

## Season lifecycle

`Season.status` is `UPCOMING`, `ACTIVE`, or `COMPLETED`, and it gates what players
can do:

| Status | Leagues | Browsing |
| --- | --- | --- |
| `UPCOMING` / `ACTIVE` | Create and join | Yes |
| `COMPLETED` | Blocked | Archive at `/seasons/<slug>` |

Drafting a cast whose season already aired is not a game — the results are
already known — so finished seasons are read-only. The archive still shows every
player's fantasy score for that season, ranked by points and labelled with how
they actually placed, which are not the same thing.

Status is explicit rather than derived from dates: ingested seasons routinely
arrive with no reliable air dates, but a finished season always has a winner, so
bootstrap infers `COMPLETED` from the presence of one.

Enforcement is server-side in `createLeague` and `joinLeague`, not only in the
form's season list.

## Automated data ingestion

Results are captured from external sources instead of typed in by hand.

```bash
npx tsx scripts/ingest.ts bootstrap big-brother-28 2026   # season, cast, cycles
npx tsx scripts/ingest.ts sync      big-brother-28        # weekly results
```

Re-run `sync` as episodes air to pull in the new week. Bootstrap is only needed
once per season, though re-running it refreshes the cycle schedule.

Or use the **Sync** and **Refresh cast** buttons at `/admin/ingestion`. All of these
are safe to re-run — candidates are upserted on `(sourceSlug, sourceRef)`, so
re-syncing an unchanged page is a no-op and cannot double-score anyone, and
bootstrap matches existing houseguests by source id and only fills in fields that
are missing.

**Refresh cast** re-runs bootstrap from the browser, which is how a *deployed*
environment gets cast data the adapter learned to capture after that database was
first populated — contestant photos, most recently. It matters because the
alternative is pointing a local shell at production's own `DATABASE_URL`, and
handling a production credential to fill in one column is a bad trade.

### Scheduled

`vercel.json` runs `/api/cron/sync` once a day at 06:00 UTC — after the last West Coast
airing has been written up, and within the daily limit every Vercel plan allows. It does
what the Sync button does for every `ACTIVE` season whose cast is linked to a source,
recording under a platform admin's account. Vercel signs the request with
`Authorization: Bearer $CRON_SECRET`; without that variable the route refuses everything,
so the schedule is inert until the secret is set. Both the button and the cron post
standings to each league's chat afterwards (below) when new results reached a leaderboard.

### Getting a season into a deployed database

The build runs `scripts/install-shows.ts` (every show in the catalogue: rows, rule
dictionary, rulesets) and then `scripts/bootstrap-seasons.ts`, which bootstraps and
syncs each season named in `BOOTSTRAP_SEASONS` — a comma-separated list of
`source:season-slug:year`, e.g. `wikipedia-survivor:survivor-51:2026`. Both are
idempotent, so a rebuild refreshes casts and schedules. A source being down logs
and moves on; it never fails a deploy. The daily cron then keeps every open season
— airing *or* upcoming — bootstrapped and synced, and flips a season to airing once
its premiere has passed. The cron needs `CRON_SECRET` set in the project
environment; without it the route answers 503 and nothing syncs.

### Three layers

```
adapter  → parses one site's markup into that show's RawSeasonFacts, and
           declares which show it covers (knows HTML, knows nothing about our schema)
mapper   → a show's facts into candidate events using that show's rule codes
           (knows the show, knows nothing about HTML); registered by show slug
pipeline → resolves candidates against the database and publishes them; reads
           only the show-agnostic part of the facts (which cycles aired, who left)
```

The pipeline pairs adapter and mapper through the season's show and refuses a source
that covers a different show. A new site needs only a new adapter. A new show needs a
facts shape, a mapper and a registry entry — `SurvivorSeasonFacts` and `mapSurvivorSeason`
are in place and tested ahead of any Survivor results site being parsed.

### Nothing writes straight to the ledger

Scrapers misread pages and sites redesign without warning, so parsed results land
in `IngestedEventCandidate` first. A candidate auto-publishes only when it is
HIGH confidence *and* resolves to a known contestant and cycle; everything else
waits at `/admin/ingestion` with the reason it was held. Published candidates
keep a link to the `ScoredEvent` they created, so every automated point on the
board is traceable back to the page it came from.

Contestants are matched on a source-side slug (`ContestantExternalRef`), never on
display names — sources use nicknames (`Vince "The Lip" Panaro`) and inconsistent
legal names, so names are not an identity.

### What is deliberately not automated

The mapper only emits what a source states plainly. It will not infer whether a
veto was used on self or another, whether an eviction was unanimous, or anything
in the Drama & Social ruleset. Those stay manual via `POST /api/admin/events`.
Guessing at them would put fabricated points on real scoreboards.

`IngestionRun` records every sync. A run that parses zero weeks off a page that
should have them is recorded as `EMPTY` rather than a success — that is the
signal that a parser has silently broken.

### Live seasons

An in-progress season is not just a shorter finished one, and three things only
break there:

- **Unaired weeks** appear in the results grid as empty rows. They are skipped,
  not scored — otherwise everyone collects survival points for a week nobody has
  played. They still become `UPCOMING` cycles so there is a real lock deadline.
- **The eviction table's row order reverses.** A finished season lists the winner
  first; a live one lists the most recent eviction first. Nothing semantic is
  derived from that column — placement comes from the label ("9th Place").
- **Jury membership is derived, not assumed.** The cast's status tag is a display
  label that prefers the more notable one, so a houseguest who was both on the
  jury and America's Favorite is tagged `AFP` and would be missed. The cohort is
  instead everyone finishing at or above the worst finish among jury-tagged
  houseguests, which comes out of the data rather than a hardcoded jury size.

Cycle air dates come from eviction dates where known and are interpolated a week
apart elsewhere, anchored to the premiere and finale dates on the page.

Each sync also reconciles who is still in the house, when they left, and where
they placed — scored events alone do not carry that.

### Sources

- **[Big Brother Junkies](https://bigbrotherjunkies.com)** — season results grid,
  eviction order, and cast. Their `robots.txt` permits these pages; the client
  identifies itself honestly and fetches one page per sync.
- **[Wikipedia](https://en.wikipedia.org/wiki/Survivor_51)** — for Survivor: the
  season article's contestants, season-summary and voting-history tables, expanded
  from their rowspans into a grid. Cast, tribe per phase, reward and immunity
  winners, every vote cast, how each person left, the merge and the finish are all
  stated outright and kept current by the community within hours of an episode.
  Headshots come from the network's own "Meet the cast" article on Paramount+,
  matched by name. The adapter is `src/lib/ingestion/sources/wikipedia-survivor.ts`.
- **[Wikipedia](https://en.wikipedia.org/wiki/The_Traitors:_New_Blood)** — for The
  Traitors (US): the season article's contestants (affiliation and how and when each
  left), episodes (release dates, which set the roster locks — NBC at 8 PM, Peacock at 9,
  an hour apart on a double bill, in the right Eastern offset for the date), the
  elimination history (the Traitors' decision each night, shields, the murder shortlist,
  the banishment and every Round Table ballot, ties included) and the end game. Who held
  a cloak when is derived: the contestants table gives the final side, and a recruitment,
  ultimatum or seduction in the decision row dates a recruit's — so each murder is
  credited to the Traitors in the game that night, and a ballot knows whether it caught a
  Traitor. Headshots come from NBC Insider's cast article, matched by name. The adapter is
  `src/lib/ingestion/sources/wikipedia-traitors.ts`; both Wikipedia adapters share their
  table and name helpers in `wikipedia.ts`.

Parser tests run against saved HTML fixtures and never hit the network.

## Draft

Snake by default, linear and auction modeled in the schema. `buildDraftOrder` reverses
direction each round. Validation runs twice on purpose: `validatePick` gives a useful error
message, and the `DraftPick` unique constraints on `(leagueId, contestantId)` and
`(leagueId, pickNumber)` are the real guard — two managers clicking the same houseguest at
the same instant is a race no in-memory check can win.

`startDraft` refuses a draft the season cannot supply — four teams at five apiece is
twenty picks against a sixteen-houseguest Big Brother season. Without the check the board
simply runs out of people, the team on the clock can never pick, and the league sits
`IN_PROGRESS` with no way out short of editing the database.

Team ordering is pinned with an id tiebreaker (`DRAFT_TEAM_ORDER`). `draftOrderPosition`
is nullable and Postgres promises nothing about ties, so without it the page and the
mutation could disagree about whose turn it is — which surfaces as "another team is on the
clock" to the person whose turn it genuinely is.

**The board is live.** It polls `/api/leagues/[leagueId]/pulse` every four seconds while
visible and calls `router.refresh()` when a count moves, so someone else's pick appears
where you are standing and the next manager is told the draft is waiting on them. See
*Live updates* below.

## Home

`/leagues` is the home page in both signed-out and signed-in states, and `/` redirects
there — every link in the app (the logo, the bottom nav, the back link on every league
page) already pointed at it, so the redirect goes this way round rather than costing a hop
on every tap.

Signed in, the leagues sit in a horizontally scrolling rail, one card per league, carrying
that viewer's own team: points, rank, last cycle, roster lock, and the near-miss or
at-risk line. The rail is keyed off league *membership*, not owned teams — someone who
joined but has no team yet still sees the league, which is the bug class that once made
joiners invisible and is covered by `src/server/league-social.test.ts`.

Below the rail is the same live block the signed-out page shows: the airing cast, the last
scored events, and the buzz panel. It is one `<LiveSection />` used by both, so the
two cannot drift, and "what is happening in the house right now" is the reason to open the
app in either state.

### Sharing a league

The invite code on a league page is a button: tapping it copies the code. The QR button
beside it opens a modal with a scannable code encoding `/leagues/join?code=…`, so scanning
lands on the join form with the code already filled in. The origin is read from
`window.location`, so the code is correct on localhost, on a preview deployment and in
production with no env var to keep in sync, and the query string survives Clerk's sign-in
redirect for someone scanning without an account.

The QR encoder is a lazily-imported chunk fetched on first open, since most league page
views never open it.

### Signing in, and joining from a QR code

Sign-in and sign-up are pages on this domain (`/sign-in`, `/sign-up`, Clerk's components
in the app's own theme from `src/lib/clerk-appearance.ts`), and the middleware sends
signed-out visitors there rather than to Clerk's hosted portal on another domain. Which
providers appear — Google, Apple, passkeys, email — is decided in the Clerk dashboard
under SSO connections; the components render every enabled one, social buttons first.

`/leagues/join` is public on purpose. A new member who scans a QR code sees the league
they were invited to (name, season, seats — `getLeagueInvite`, keyed by the code, which
*is* the invitation) and creates their account right there with `<SignUp routing="hash">`,
then returns to the same URL signed in, code intact, to name their team. Joining itself is
still a server action that requires a session. The page also carries Open Graph metadata,
so a join link pasted into a chat shows an invite card (`/api/og/join`).

## Friends, invites and alerts

`Friendship` is one directed row — a request genuinely has a sender and a
receiver — for a relationship that is symmetric once accepted, so every read
matches on either column. That `OR` is written once, in `friendIdsFor`;
scattering it is how half a feature ends up only seeing the friends you happened
to ask first. If two people each send a request, the second one *accepts* the
first rather than creating a mirror, because two people who both asked are two
people who both agreed.

Friend search matches names and handles on a fragment but **email only in full**.
A substring search over emails turns the box into an address-book scraper.

The payoff is one-tap league invites: a friend gets an alert deep-linking to
`/leagues/join?code=…` with the code already filled in, instead of you copying a
code into a message and hoping it comes back intact.

### Notifications

`Notification` stores its own `title`/`body` at send time instead of joining back
at render. That is the whole point — an alert has to survive the thing it
describes. "Your league was deleted" has no league left to join to, and a league
renamed afterwards should still read the way it read when it happened. `data` is
a JSON escape hatch so new alert kinds only grow the enum.

**A notification can never fail the thing it reports.** `notify()` swallows its
own errors and every caller invokes it *after* the primary write commits, never
inside the transaction — inside, a failed insert would poison the transaction and
take the real work down with it.

The header badge is server-rendered for first paint, then polls
`/api/notifications/unread` on an interval and on tab focus. Following an alert
marks it read via a `keepalive` fetch rather than a server action, because the
click navigates at the same time and a server action's POST races that
navigation.

### Push

Web Push is the third channel. `notify()` hands every batch to
`deliverNotificationPush` alongside email; each device a member has switched on
(`PushSubscription`, one row per browser, keyed by the push service's endpoint) gets the
same title, body and link the bell shows, with `LEAGUE_DRAFT_PICK_DUE` marked high
urgency so it clears a phone's battery saver. A 404 or 410 from the push service deletes
the row — that browser is gone. The service worker (`public/sw.js`) does push and
nothing else; every page here is rendered per request, and a cache in front of that
would show people standings that have since moved.

Unconfigured is a normal state: without `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (one
pair per deployment, `npx web-push generate-vapid-keys`; `VAPID_SUBJECT` is a `mailto:`
or `https:` contact) nothing is sent and the switch on `/account` is hidden. The public
key reaches the browser from the server at request time, never through a `NEXT_PUBLIC_`
variable, so setting the keys needs no rebuild. On iPhone and iPad push only works once
the app is on the home screen, which the switch explains; `src/app/manifest.ts` and the
icons in `public/icons` (rendered from the logo mark by `scripts/make-icons.ts`) are what
make it installable.

### Email

Every notification can also arrive as email (`src/lib/email/`). The copy is not
rewritten per channel — a notification already has a title, a body and a
destination, so the templates supply presentation only: an eyebrow label, an
accent, a button, and a line saying why this landed in your inbox. Rewriting the
words per channel is how an email ends up promising something the app does not
show.

Written the way email has to be written rather than the way the app is: tables,
inline styles, no web fonts, no SVG, and a logo drawn from background-coloured
cells because most clients block remote images and branding nobody can see is
not branding. Every message carries a plain-text part and an RFC 8058 one-click
unsubscribe, both of which spam filters weigh.

Each accent is a *rule* colour, an *eyebrow* colour and a *fill/ink* pair rather
than one value, because a hue bright enough to read as a label on the dark card
is too light to put white text on. `templates.test.ts` measures all of them
against the 4.5:1 floor — an inbox is the one surface nobody can file a bug
about.

Sending happens after the response goes out (`waitUntil`), so an inbox never
costs anyone a second of their turn. **With no `RESEND_API_KEY` the app behaves
exactly as it did before email existed**: alerts still appear in-app, nothing is
sent, and `/account#email` says so rather than offering switches that govern
nothing.

Preferences are per-type in the database and per-category in the UI — three
switches, not nine — so a type added to a category later inherits the answer
somebody already gave about that category. `/api/admin/email-preview` renders
all nine templates in a browser.

## Latest buzz

The home page's buzz panel used to be an embedded X timeline. It did not work,
and it could not be made to work from our side:

- X retired embedded **search/hashtag** timelines. `widgets.js` parses
  `twitter.com/search?q=…` as a *profile* for a user literally named `search`,
  and the resulting iframe renders at zero height.
- Profile timelines fare no better here — X's own embed generator at
  `publish.x.com` renders `@BigBrother` at zero height too.
- Scraping X server-side is not an option: `syndication.twitter.com` answers
  unauthenticated non-browser requests with `429`.

So the panel now reads RSS, on the server, cached for 15 minutes. Sources are
tried in order and the first with content wins:

1. **X API v2** — real X content, and what the panel is still named after. Only
   active when `X_BEARER_TOKEN` is set, because the recent-search endpoint is
   behind a paid plan. Setting the variable makes X primary with no code change.
2. **The show's own community feed** — registered per `Show.slug` in
   `src/lib/social-feed/index.ts`. Big Brother maps to Big Brother Junkies, the
   same source ingestion already uses.
3. **Google News**, queried by the show's *name*. This is the universal fallback
   and is why the module stays show-agnostic: a new show needs no entry anywhere
   to get a working panel.

Every layer degrades rather than throws — a slow or blocked third party leaves
an empty panel with a link to the X hashtag, never a broken page. Parsing is a
pure function tested against saved fixtures, so the suite never touches the
network.

This is also faster than the embed ever was. `widgets.js` was the heaviest thing
on the page and the main-thread hog that stalled the cast marquee; the panel now
ships zero client JavaScript and no iframe.

## Roster locks

Each cycle carries a season-wide `locksAt` (ingestion writes it 30 minutes before
airtime). A league may override that with `lockOffsetMinutes`, counted back from
**airtime** rather than from the season's own lock, so the two never compound.
`0` is a real value — lock exactly at airtime — and is deliberately distinguished
from `null`, which means "use the season's deadline".

The rule lives in `src/lib/cycles.ts`: pure, no Prisma, with `now` injectable.
That is what makes it testable, and it means a page that already loaded the cycle
and the league can call it during render instead of re-querying. Any cycle past
`UPCOMING` is locked outright regardless of the clock — results are already being
recorded against it, and no per-league offset should reopen it. A cycle with no
airtime falls back to the season lock, because ingested seasons routinely arrive
without reliable air dates and an offset counted back from `null` is a crash
rather than a deadline.

Nothing *enforces* this yet: rosters are fixed at draft time and the only
`RosterSlot` write is the draft fan-out. What the offset currently controls is
the displayed deadline and the Locked/Open badge on the league page and the home
rail. The rule is centralised and tested so in-season roster changes can gate on
it when they land.

## League settings

Commissioners can edit a league at `/leagues/[id]/settings`, or delete it. Three
rules exist to prevent corruption rather than to tidy the form:

- `maxTeams` cannot drop below the teams already seated. It does not evict
  anyone — it just makes the league permanently over capacity.
- `rosterSize` freezes once drafting starts. It sets the total number of picks,
  so changing it mid-draft moves the finish line under everyone.
- The scoring ruleset freezes at the same point. Settled weeks are safe
  (`ScoredEvent` snapshots its own points), but every future week would be worth
  something different from what people drafted against.

Members are notified only for changes that affect play — a typo fix in the league
name should not ping eight phones.

Both are the commissioner's alone. The mutation checks the `COMMISSIONER`
membership role *and* `League.commissionerId`, which are written together and
should never disagree — the second check exists so that if they ever do, the
edit is refused rather than decided by whichever field happened to be read.
On the league page the control is a plain cog button that only the commissioner
sees; the role itself is shown on their row in the managers list, because a pill
is the shape this app reserves for things you cannot tap.

Deleting cascades at the database level rather than by hand, so a table added
later cannot be missed. Members are notified **before** the delete, because
afterwards there is no membership list left to read. Confirmation is typing the
league name, not a dialog that gets dismissed by reflex.

A league can be connected to the chat it already lives in. `chatWebhookUrl` takes a
Discord or Slack *incoming webhook* URL — only URLs on those two services' own webhook
hosts are accepted (`src/lib/chat-webhook.ts`), because it is an address this server will
post league data to — and from then on the draft (start, every pick, completion) and each
week's standings post to that channel (`src/server/league-chat.ts`). Posting follows the
notification rules: after the primary write, in the background, never able to fail the
thing it reports. The league page shows the service name to members, never the URL: the
URL is the credential.

**The points survive the league.** In the same transaction as the delete,
`deleteLeague` writes one `CareerRecord` per team that had scored anything:
league, team, season and show names, the final total and rank, whether the
season had ended (a first place in a season still running is a lead, not a
title), and the week-by-week line for the chart. Like `Notification`, the row
holds copies rather than relations, so it survives the thing it describes. The
account page reads live teams and these records through one reduction
(`src/lib/career.ts`), so a season keeps its shape when its league closes. A
team that never scored leaves no record — nothing was played.

## Account

`/account` is the career view: total points, leagues, best finish and titles
(first places in seasons that actually *ended* — leading an active league is not
a win yet), a per-season history, and a cumulative points chart. Lines from
leagues that were later deleted come from `CareerRecord` and render without a
link, tagged "League closed".

### Badges

Six tiers on lifetime points, defined in `src/lib/badges.ts`: Castmate (1),
Comp Winner (100), Power Player (250), Jury Member (500), Finalist (1,000)
and Comp Beast (2,500). The names are the arc of any reality competition rather
than one show's titles, because the ladder spans every league an account has
played. The thresholds are set against real numbers: in the completed Big
Brother 27 season the average contestant scored about 52 points under Classic
rules, so a default five-player roster comes out near 260 for a season — the
ladder is a first point, a third of a season, a season, two, four, and a decade
at the top.

Badges are derived from the account's total, never stored, so there is no row
to fall out of sync with the ledger and nothing to backfill. Because that total
includes `CareerRecord`s, a badge earned in a league that was later deleted
stays earned. The shelf shows every tier as a hexagonal medal — bronze, silver
and gold, then gold-rimmed enamel for the jury and the finale, and a holographic
face for Comp Beast — with locked tiers as empty slots, and a progress line to
the next, measured from the previous tier rather than from zero so the last
stretch never looks nearly full for years. The highest medal earned is pinned to
the account's avatar.

The chart is hand-rolled SVG, not a charting library — it draws one polyline and
some dots, and the smallest credible dependency is bigger than the page. That
also keeps it a server component with no client JavaScript, so the exact numbers
live in a visually-hidden table underneath where a screen reader can reach them.
It reads the materialized `TeamCycleScore` rows rather than replaying the ledger,
and stops at the last cycle that actually aired — cumulative totals carry forward
through unscored weeks, so plotting the whole season would draw a long flat tail
that reads as a team who stopped scoring.

## Visibility

`League.isPublic` decides who can *read* a league. It never decides who can join —
joining always needs the invite code, which is the credential.

- **Private** (the default): the league page, every team page in it, the draft room and
  the JSON routes answer only to active members. Anyone else who reaches the page by
  link sees the league's name, season and a way in — sign in, or the join form — and
  nothing about its standings, rosters or feed.
- **Public**: readable by anyone with the link, signed in or not; the feed is read-only
  for non-members.

One rule, in one place: `canViewLeague` in `src/server/queries.ts` for the pages that
hold only an id, and the same `isPublic || member` test inline where the league row is
already loaded. For a while the flag gated the JSON routes and nothing else, so a private
league's standings were readable by anyone holding the id; `access.test.ts` pins the
rule from both sides.

The public player page (`/players/[id]`, indexed) shows which of *the viewer's* leagues
drafted a houseguest, and nothing signed out. It used to list every league in the
database that had — private leagues' names and team names included.

## League feed

Each league has its own trash-talk feed on `/leagues/[leagueId]` — posting, Hype/Shade
reactions, and delete by the author or the commissioner. Membership is the gate for
posting; reading follows the league's visibility (below).

Messages soft-delete. Removing one mid-argument should not orphan the reactions hanging
off it, and a commissioner needs to see that something *was* removed rather than have it
silently vanish.

New posts and reactions arrive on their own — the feed watches the same league pulse the
draft board does. Threaded replies and @-mentions are the natural next step.

## Live updates

One endpoint, `/api/leagues/[leagueId]/pulse`, answers "has anything happened in this
league since I loaded the page?" with three indexed counts and an enum. Clients poll it
and re-render themselves through `router.refresh()` only when a number moves, so a quiet
league costs a count query every few seconds and a busy one costs a page render exactly as
often as something actually changed. `useLeaguePulse` in `src/lib/live.ts` is the client
half; callers pass the watched values *as their current render sees them*, which is what
makes drift between "what we polled" and "what is on screen" impossible.

Polling rather than a socket is a choice, not a stopgap. Sockets on serverless mean
holding an invocation open per viewer; a draft between eight friends does not need that,
and polling survives a phone locking, a tunnel and a backgrounded Safari tab — none of
which a socket does. Hidden tabs do not poll at all, and a permanent 403 stops the loop
rather than retrying a settled answer forever.

Counts rather than timestamps: a soft-deleted message and an un-hyped post both move a
count, and neither moves a `max(createdAt)`.

## Page structure

**The document does not scroll.** The app is a column exactly one viewport tall — header,
one scroll container (`<AppScroller>`), bottom nav — and only the middle scrolls. Two earlier
versions let the document scroll with `sticky` bars, and on a phone that is fragile three
ways at once: the URL bar collapsing resizes the viewport mid-scroll, the rubber-band past
either end drags the sticky bars with it, and a bar in the flow can be carried up the screen
by the footer at the bottom of a short page. With the bars *outside* the part that scrolls,
none of those can happen. `viewport-fit=cover` and `env(safe-area-inset-*)` on the header,
nav and footer keep the installed app clear of the notch and the home indicator.

Owning the scroller means owning what the browser did for the document: `<AppScroller>`
puts every new page at its top (Next resets the *document*, which no longer scrolls, and a
page that inherited the last one's offset opened in its middle), restores the offset on
back and forward, leaves a `#hash` target to scroll itself, and marks the root
`data-scrolled` so the header shows its edge only once content passes under it. Anything that
reads a scroll position goes through `appScroller()`. Two details are load-bearing:

- **`position: relative` on the scroller.** Without a positioned ancestor inside it, every
  `sr-only` label and corner-pinned SVG took the whole page as its containing block,
  stretched the document to wherever it sat, and let the browser scroll the document to show
  a focused control — which carried the header off the top. A listener puts the document
  back at 0 if anything ever scrolls it again.
- **Every snap and scroll calculation measures the scroller, never `window`.**

**Scrolling settles on sections.** The scroller has `scroll-snap-type: y proximity` over a
handful of `.panel`s — a page's major blocks — so a scroll that comes to rest near the next
section settles with its heading just under the header, and one that doesn't is left alone.
Proximity, deliberately: mandatory snapping cannot rest partway through a panel taller than
the screen without fighting the reader (a league feed, a standings table, an expanded
section; the CSS working group's issue #6863 describes exactly that), and the first two
attempts here, which snapped the document, fought the reader for that reason and the URL-bar
one. The rules that make it guide rather than catch:

- **Few, large targets.** The section directly under a page's title is not a panel (the top
  of the page already is one); a stack of folded rows is one panel; a folded section is not a
  target at all (it is one heading tall); the live block is one panel, not one per show.
- **At least half a screen apart, whatever the data.** A panel's height is content — a league
  with two teams has a standings table a couple of hundred pixels tall — so `<AppScroller>`
  measures on every resize and stands down any panel that starts less than 45% of a screen
  after the previous resting point (`data-snap="off"`).
- **The end is a resting point.** The footer aligns its end, or a last panel starting near the
  bottom pulls every attempt to reach the footer back up to it.
- **No snapping on forms or reference pages.** The draft room, settings and the rule book's
  first show have no panels; a page with no targets scrolls normally.

The gesture tests for this drive headless Chrome over the DevTools protocol with
`Input.synthesizeScrollGesture` — real touch flicks at a phone viewport — and assert where
each one comes to rest; a programmatic `scrollTo` does not exercise the same path.

**Sections fold.** `<Collapsible>` (`src/components/Collapsible.tsx`) comes in two shapes:
a `section` — a primary block with a real heading — and a `row`, one line in a
hairline-divided `<RowGroup>` of reference material, like a settings screen (a league's
managers and details, an account's friends and alert settings, each show's buzz, the FAQ).
The heading is a real button inside the real heading (`aria-expanded`); the body animates
through `grid-template-rows`, is `inert` while closed, and lifts its overflow clip once
settled so a tile's hover lift and glow are not shaved off. Opening a section is guided: once it
has grown, if it runs past the bottom of the screen the page glides up just far enough to
show it, never so far that the heading you tapped leaves the top.

Defaults are chosen per section rather than all one way: what you came for starts open,
reference material starts folded, and a few open themselves when they need you — a league's
details (with the invite code) and *Invite friends* while seats are open before the draft,
*Friends* when someone is waiting on an answer, *Email alerts* when an email footer links to
it. Before a league's draft the reference rows sit above the feed; after it, below.

Native `<details>` (the rule book's rulesets, a team's week-by-week lines) animate open where
the browser supports `interpolate-size`, and open as before where it does not.

## Visual language

The one shape the app owns is the **slant** of the wordmark's three tally bars, and it is
used for everything that *labels* something, the way a network's on-screen graphics do.
Controls never lean: a button stays a rounded, level thing you press.

- **The mark** (`src/lib/brand.ts`) — three bars on one lean (a quarter of their height,
  about 14°) with a camera's red tally light over the tallest, in slate-to-gold gradients.
  The header logo (`CompBeastLogo`, with the wordmark set on the same lean and BEAST in
  struck gold), `<TallyMark>`, the Open Graph cards, `src/app/icon.svg` and the home-screen
  PNGs (`npx tsx scripts/make-icons.ts`) all draw from those numbers.
- **Sections, not boxes.** A run of rows — standings, a cast, a rule book, a game log, a
  settings list — sits on the page between hairlines (`.list`, `.row-link` for a row that is
  a link, `.list-empty`, `.stat-row` for figures side by side), flush with the section title
  above it. A page's lead action (open the draft room, start a league) is a `.callout`: a
  ruled section with a tally bar in the show's colour down its edge, not a panel, and a
  headline number (season points, lifetime points) is set large on the page. The live
  ticker is a ruled crawl. A tile — softly rounded, `rounded-card` (10px) — is kept only
  for a thing you pick up, a league card in the rail, and the QR dialog; controls and fields
  are `rounded-btn` (8px). Never a bubble, never a hard square.
- **`<Tag>`** (`src/components/Tag.tsx`, `.tag` in `globals.css`) — a status, rank, points
  value or show, on a skewed backing so the text stays upright. Three sizes; fills for the
  show accent, gold/silver/bronze (`rankTone`), red (with `live` for the breathing on-air
  dot), outline, and the three pop tones. It replaced tilted die-cut "stickers".
- **`<RankPlate>`** — a rank as a numbered plate: struck in metal for the podium, outlined
  after. The leaderboard and a season's player scores use it.
- **`<SeasonPlate>`** — a season's number plate in its show's colour ("BB 28", "S 51"),
  wherever seasons are listed. The chip it replaced printed the year, which put "26" on
  every season airing this year.
- **Medals** — the badge shelf (see [Badges](#badges)).
- **`.callout`** — the one thing to do on a page (open the draft room, start a league):
  ruled above and below, a slanted tally bar in the show's colour down its left edge, and
  the show's light fading in from that side. The rail's "Start or join" card is the one
  feature tile left (`.card-feature`), because it sits among league cards.
- **`.stage`** — a page title's glow, in the show's colour on a show's pages and gold
  elsewhere; the section title's bar is a tally bar in the same colour.
- **Icons** (`src/components/icons.tsx`) — one 24px grid and 1.8px stroke, placed where
  they mean something. There is no mascot and no decoration that is not the brand's own
  mark.

## Motion

Framer Motion is loaded once, late, from the root `MotionProvider`: every animated element
is an `m.*` component (the shell renders as a plain element on the server and picks up
hover, tap, spring, layout and exit support when the feature chunk arrives after
hydration), and the provider is `strict`, so a `motion.*` import anywhere in the tree is a
development error rather than a silent 30 KB added to that page. `domMax` rather than
`domAnimation` because the leaderboard and the feed animate `layout`. Entrances that must
be visible before JavaScript — the landing hero, the scroll-in `Reveal` — are CSS, for the
Largest-Contentful-Paint reasons documented on the `rise` keyframe in `tailwind.config.ts`.

## Database connections

Production drafts were crashing a few picks in with `P2037 — too many connections for role
prisma_migration`. The cause was not the draft. Every serverless invocation opened its own
TCP connection *pool* (Prisma sizes it from the CPU count, so five to nine sockets each)
against the database's direct endpoint, whose role allows 45. A draft is simply the first
thing in this app that puts several people on the same league in the same second.

`src/lib/db.ts` now prefers a pooled `prisma+postgres://` endpoint if `PRISMA_DATABASE_URL`
provides one, caps itself at a single connection per function instance if it ends up on the
direct endpoint anyway, reuses one client per process in every environment, and retries the
narrow set of errors that mean the query never ran (`P1001`, `P1002`, `P2024`, `P2037` —
not `P1017`, where the write may have committed).

Half that fix lives in an environment variable this code cannot read, so
`/api/admin/db-health` reports which endpoint won, the role's connection limit and how many
connections are currently open. `"mode":"pooled"` is the best answer; `"direct-capped"`
works and is what runs today. The mode is derived from the environment on every call
rather than recorded when the client is built — Next bundles each route separately and
the client is shared through `globalThis`, so a value set inside `createClient` was never
visible to the route reporting it.

## Observability

`@vercel/analytics` and `@vercel/speed-insights` are mounted in the root layout and are
inert until Web Analytics and Speed Insights are switched on for the project in the Vercel
dashboard; Speed Insights is the field Core Web Vitals data the synthetic Lighthouse runs
approximate. Sentry (`@sentry/nextjs`) is wired for errors only — no tracing, no replay —
and is disabled until `NEXT_PUBLIC_SENTRY_DSN` is set. On the server it loads through
`src/instrumentation.ts` (Node runtime only; the edge middleware does not carry it) and
reports through `onRequestError`. In the browser it is deliberately *not* bundled into the
entry: `ErrorReporting.tsx` imports the SDK once the page is idle and buffers the two global
error events until it arrives, so the ~30 KB it costs never sits on the first paint, and
both error boundaries report through the same late import.

## Open Graph

Every public page has a share card drawn by `src/lib/og/card.tsx` — one layout (the eyebrow
as a slanted gold tag, the title's second sentence in gold, the tally mark set large and
faint behind), the two brand faces read from `src/lib/og/fonts` because satori cannot use
the web fonts — with
the page routes deciding the words: the site default, `/seasons/[slug]`,
`/players/[id]`, and the invite card at `/api/og/join?code=`. The invite card never shows
the code; a screenshot of it should not be an invitation.

## Tests

```bash
npm test
```

Pure unit tests cover attribution, voiding, ruleset filtering, snapshot vs. restated
scoring, tie ranking, float drift, and draft order/validation.

Four files talk to a real database instead: `league-social.test.ts` (joining, the feed,
the home rail), `draft.test.ts` (the pick fan-out and snake order), `social.test.ts`
(friendships, notifications, league settings and deletion) and `access.test.ts` (who may
read a league, what a player page reveals, who is on the block). These cover the things pure
unit tests cannot reach — a friendship is only correct if it reads the same from *both*
directions, a notification is only useful if it survives the thing it describes being
deleted, and the settings rules exist to stop a database being corrupted mid-draft. Each
file skips itself when no database is reachable *or seeded* — the probe runs at module
level, where `describe.skipIf` can see it — so `npm test` stays green on a machine that has
never run `db:push`, and reports the skips rather than hiding them. CI seeds its database
so those suites actually run there.

Every database-backed file was checked by reintroducing the bug it exists for and
confirming the right tests — and only those — fail. Breaking the symmetric friendship
read, for instance, fails exactly ten of them. A test that cannot fail is decoration.

## Adding a show

1. Write a rule catalogue beside `src/lib/shows/big-brother.ts`.
2. Seed a `Show`, its `EventDefinition`s, and one or more `ScoringRuleset`s.
3. Seed a `Season`, its `Contestant`s, and its `Cycle`s.

No engine, API, or UI changes.
