import { z } from 'zod';
import { MAX_LOCK_OFFSET_MINUTES } from './cycles';

// Schemas shared between server mutations and client forms. Kept in its own
// dependency-free module (no Prisma, no auth) so a 'use client' component can
// import a schema for instant inline validation without pulling in
// server-only code through the rest of src/server/mutations.ts's imports —
// Next.js bundles a client component's whole import graph, not just the one
// export it uses.
// Every message is written out rather than left to Zod's defaults. The
// defaults ("String must contain at least 3 character(s)") leak the validator
// into the interface, and they are the text a person sees at the exact moment
// they are already stuck.
export const createLeagueSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Give your league a name of at least 3 characters')
    .max(60, 'League names are limited to 60 characters'),
  seasonId: z.string().min(1, 'Pick a season'),
  scoringRulesetId: z.string().min(1, 'Pick a scoring ruleset'),
  rosterSize: z.coerce
    .number({ invalid_type_error: 'Roster size must be a number' })
    .int('Roster size must be a whole number')
    .min(1, 'Each team needs at least 1 houseguest')
    .max(12, 'Rosters cap at 12 houseguests'),
  maxTeams: z.coerce
    .number({ invalid_type_error: 'Max teams must be a number' })
    .int('Max teams must be a whole number')
    .min(2, 'A league needs room for at least 2 teams')
    .max(24, 'Leagues cap at 24 teams'),
  isPublic: z.coerce.boolean().default(false),
  teamName: z
    .string()
    .trim()
    .min(2, 'Give your team a name of at least 2 characters')
    .max(40, 'Team names are limited to 40 characters'),
});

/**
 * What a commissioner may change after a league exists.
 *
 * Deliberately a subset of `createLeagueSchema`. `seasonId` is absent because
 * moving a league to another season would orphan every draft pick and scored
 * event already attached to it — that is a new league, not an edit. The two
 * fields that *are* here but constrained at the mutation are `rosterSize` and
 * `scoringRulesetId`: both are frozen once the draft starts, because roster
 * size sets the number of picks in a draft already under way, and a ruleset
 * swap mid-season changes what future weeks are worth.
 */
export const updateLeagueSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Give your league a name of at least 3 characters')
    .max(60, 'League names are limited to 60 characters'),
  scoringRulesetId: z.string().min(1, 'Pick a scoring ruleset'),
  rosterSize: z.coerce
    .number({ invalid_type_error: 'Roster size must be a number' })
    .int('Roster size must be a whole number')
    .min(1, 'Each team needs at least 1 houseguest')
    .max(12, 'Rosters cap at 12 houseguests'),
  maxTeams: z.coerce
    .number({ invalid_type_error: 'Max teams must be a number' })
    .int('Max teams must be a whole number')
    .min(2, 'A league needs room for at least 2 teams')
    .max(24, 'Leagues cap at 24 teams'),
  isPublic: z.coerce.boolean().default(false),
  /**
   * Minutes before airtime that this league's rosters lock. Null means "use
   * the season's own deadline".
   *
   * `preprocess` rather than `z.coerce.number().nullable()`: coercion runs
   * first and turns an empty form field into `Number('') === 0`, which is a
   * real and *different* setting — lock exactly at airtime. The empty select
   * option has to survive as null.
   */
  lockOffsetMinutes: z.preprocess(
    (value) => (value === '' || value == null ? null : Number(value)),
    z
      .number({ invalid_type_error: 'Pick a roster lock time' })
      .int('Lock offset must be a whole number of minutes')
      .min(0, 'Rosters cannot lock after the episode airs')
      .max(MAX_LOCK_OFFSET_MINUTES, 'Rosters cannot lock more than 24 hours before airtime')
      .nullable(),
  ),
});
