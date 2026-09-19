import { z } from 'zod';

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
