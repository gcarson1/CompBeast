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

```bash
npm install
cp .env.example .env    # point DATABASE_URL at your Postgres
npm run db:push
npm run db:seed
npm run dev
```

The seed creates a 16-houseguest *Big Brother 27* season, three scoring rulesets, a
four-team demo league (invite code `DEMO-BB27`) with a completed snake draft, and three
weeks of aired results. Season dates are anchored relative to today, so a fresh seed always
lands mid-season with the next week's roster lock still ahead of you.

Until an auth provider is configured, the app signs you in as the first seeded user
(`Ali Corak`) in development.

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

## Draft

Snake by default, linear and auction modeled in the schema. `buildDraftOrder` reverses
direction each round. Validation runs twice on purpose: `validatePick` gives a useful error
message, and the `DraftPick` unique constraints on `(leagueId, contestantId)` and
`(leagueId, pickNumber)` are the real guard — two managers clicking the same houseguest at
the same instant is a race no in-memory check can win.

## Tests

```bash
npm test
```

Covers attribution, voiding, ruleset filtering, snapshot vs. restated scoring, tie ranking,
float drift, and draft order/validation.

## Adding a show

1. Write a rule catalogue beside `src/lib/shows/big-brother.ts`.
2. Seed a `Show`, its `EventDefinition`s, and one or more `ScoringRuleset`s.
3. Seed a `Season`, its `Contestant`s, and its `Cycle`s.

No engine, API, or UI changes.
