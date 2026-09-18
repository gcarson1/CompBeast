import { z } from 'zod';

// Schemas shared between server mutations and client forms. Kept in its own
// dependency-free module (no Prisma, no auth) so a 'use client' component can
// import a schema for instant inline validation without pulling in
// server-only code through the rest of src/server/mutations.ts's imports —
// Next.js bundles a client component's whole import graph, not just the one
// export it uses.
export const createLeagueSchema = z.object({
  name: z.string().trim().min(3).max(60),
  seasonId: z.string().min(1),
  scoringRulesetId: z.string().min(1),
  rosterSize: z.coerce.number().int().min(1).max(12),
  maxTeams: z.coerce.number().int().min(2).max(24),
  isPublic: z.coerce.boolean().default(false),
  teamName: z.string().trim().min(2).max(40),
});
