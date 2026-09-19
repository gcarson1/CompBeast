# Comp Beast

Fantasy leagues for reality TV. Multi-tenant, show-agnostic, with the CBS *Big Brother*
rule set implemented for the MVP.

The platform core knows nothing about Big Brother. Shows, seasons, contestants, and — most
importantly — **scoring rules** are all rows in the database. Supporting *Survivor* or
*The Traitors* means adding a rule catalogue and a seed script, not editing the scoring
engine, the API, or the UI.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 14 (App Router, Server Components) + TypeScript |
| Database | PostgreSQL via Prisma |
| Auth | Provider-neutral boundary in `src/lib/auth.ts` (Clerk / Auth.js / Supabase drop-in) |
| Styling | Tailwind CSS |
| Validation | Zod |
| Tests | Vitest |
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

The seed creates a 16-houseguest **Demo Season** (slug `demo-big-brother`, deliberately
namespaced away from real season slugs so ingestion can claim those), three scoring
rulesets, a four-team demo league (invite code `DEMO-BB27`) with a completed snake draft,
and three weeks of aired results. Season dates are anchored relative to today, so a fresh
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

`pointsSource` controls what happens when the ledger snapshot disagrees with the live
ruleset: `snapshot` (default) honors what was recorded, so settled weeks never move under
players' feet when a commissioner edits a rule; `ruleset` restates history on purpose.

### Rule sets

Three ship for Big Brother, selectable per league:

- **Classic** — competition and eviction outcomes only; everything is verifiable from the
  broadcast, so there is nothing to argue about.
- **Balanced** — the same events with variance turned down, so one lucky draft pick cannot
  run away with the season.
- **Drama & Social** — adds alliances, showmances, blowups, and tears.

Several rules in the spec were written as "+10 or +5". Rather than picking one, both values
live in the catalogue and each ruleset selects via `pointsOverride`.

## API

| Route | Purpose |
| --- | --- |
| `GET /api/leagues/[leagueId]/leaderboard` | League standings |
| `GET /api/teams/[teamId]/score?breakdown=true` | Team total, roster, per-cycle lines |
| `POST /api/admin/events` | Batch-insert ledger rows as an episode airs |
| `DELETE /api/admin/events` | Retroactive correction (soft-void + recalculate) |

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

### Three layers

```
adapter  → parses one site's markup into RawSeasonFacts
           (knows HTML, knows nothing about our schema)
mapper   → RawSeasonFacts into candidate events using a show's rule codes
           (knows the show, knows nothing about HTML)
pipeline → resolves candidates against the database and publishes them
```

A new site needs only a new adapter. A new show needs only a new mapper.

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

Parser tests run against a saved HTML fixture and never hit the network.

## Draft

Snake by default, linear and auction modeled in the schema. `buildDraftOrder` reverses
direction each round. Validation runs twice on purpose: `validatePick` gives a useful error
message, and the `DraftPick` unique constraints on `(leagueId, contestantId)` and
`(leagueId, pickNumber)` are the real guard — two managers clicking the same houseguest at
the same instant is a race no in-memory check can win.

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
scored events, and the `#BB28` timeline. It is one `<LiveSection />` used by both, so the
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
`/api/notifications/unread` on an interval and on tab focus. There is no realtime
transport here for the same reason the league feed has none. Following an alert
marks it read via a `keepalive` fetch rather than a server action, because the
click navigates at the same time and a server action's POST races that
navigation.

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

Deleting cascades at the database level rather than by hand, so a table added
later cannot be missed. Members are notified **before** the delete, because
afterwards there is no membership list left to read. Confirmation is typing the
league name, not a dialog that gets dismissed by reflex.

## Account

`/account` is the career view: total points, leagues, best finish and titles
(first places in seasons that actually *ended* — leading an active league is not
a win yet), a per-season history, and a cumulative points chart.

The chart is hand-rolled SVG, not a charting library — it draws one polyline and
some dots, and the smallest credible dependency is bigger than the page. That
also keeps it a server component with no client JavaScript, so the exact numbers
live in a visually-hidden table underneath where a screen reader can reach them.
It reads the materialized `TeamCycleScore` rows rather than replaying the ledger,
and stops at the last cycle that actually aired — cumulative totals carry forward
through unscored weeks, so plotting the whole season would draw a long flat tail
that reads as a team who stopped scoring.

## League feed

Each league has its own trash-talk feed on `/leagues/[leagueId]` — posting, Hype/Shade
reactions, and delete by the author or the commissioner. Membership is the gate, so
knowing a league's id is not enough to read or write it.

Messages soft-delete. Removing one mid-argument should not orphan the reactions hanging
off it, and a commissioner needs to see that something *was* removed rather than have it
silently vanish.

It is refresh-based rather than realtime, on purpose. A live transport is a separate piece
of infrastructure, and eight people arguing about an eviction do not need one for the
feature to earn its place. Threaded replies, @-mentions and live updates are the natural
next step, not a gap left by accident.

## Tests

```bash
npm test
```

Pure unit tests cover attribution, voiding, ruleset filtering, snapshot vs. restated
scoring, tie ranking, float drift, and draft order/validation.

Three files talk to a real database instead: `league-social.test.ts` (joining, the feed,
the home rail), `draft.test.ts` (the pick fan-out and snake order), and `social.test.ts`
(friendships, notifications, league settings and deletion). These cover the things pure
unit tests cannot reach — a friendship is only correct if it reads the same from *both*
directions, a notification is only useful if it survives the thing it describes being
deleted, and the settings rules exist to stop a database being corrupted mid-draft. Each
file skips itself when no database is reachable, so `npm test` stays green on a machine
that has never run `db:push`.

Every database-backed file was checked by reintroducing the bug it exists for and
confirming the right tests — and only those — fail. Breaking the symmetric friendship
read, for instance, fails exactly ten of them. A test that cannot fail is decoration.

## Adding a show

1. Write a rule catalogue beside `src/lib/shows/big-brother.ts`.
2. Seed a `Show`, its `EventDefinition`s, and one or more `ScoringRuleset`s.
3. Seed a `Season`, its `Contestant`s, and its `Cycle`s.

No engine, API, or UI changes.
