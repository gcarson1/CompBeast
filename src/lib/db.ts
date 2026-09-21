import { Prisma, PrismaClient } from '@prisma/client';

/**
 * The database client.
 *
 * Everything in this file exists because of one production failure mode, so
 * it is worth writing down. Draft rooms were crashing a few picks in with:
 *
 *   P2037 — Too many database connections opened:
 *   FATAL: too many connections for role "prisma_migration"
 *
 * The cause was not the draft. It was that every serverless invocation opened
 * its own TCP connection *pool* (Prisma sizes it from the CPU count, so ~5-9
 * sockets each) against the database's **direct** endpoint, whose role allows
 * only a handful of connections because it exists for migrations. A draft is
 * simply the first thing in the app that makes several people hit the same
 * league at the same second, so it was the first thing to exhaust it. Any
 * other burst would have done it.
 *
 * Two independent defences, because the first one depends on deployment
 * configuration and the second one does not:
 */

/**
 * 1. Prefer the pooled endpoint.
 *
 * `PRISMA_DATABASE_URL` (a `prisma+postgres://` URL) reaches the database
 * through a connection pooler over HTTP, so a thousand concurrent functions
 * cost zero Postgres connections. `DATABASE_URL` stays the direct endpoint and
 * remains what the Prisma CLI uses for `db push` at build time — migrations
 * genuinely need a real socket, and they run once, alone.
 *
 * Overriding at construction rather than in `schema.prisma` keeps local
 * development on plain `DATABASE_URL` with no extra variable to set, and keeps
 * the CLI pointed at the endpoint it can actually migrate through.
 */
export type DatasourceMode = 'pooled' | 'direct-capped' | 'direct' | 'unset';

/**
 * Scheme and host of each candidate connection variable, for the admin health
 * check — never the credentials.
 *
 * Which variable holds the pooled endpoint is not knowable from here, and
 * guessing it wrong is what the connection incident was. This reports the two
 * parts of a connection string that are not secret (a scheme, and a host that
 * already appears in every error message) and drops userinfo, path and query
 * on the floor, so the question can be answered from a URL instead of from a
 * secret store.
 */
export function describeDatasourceEnv(): Record<string, string> {
  const described: Record<string, string> = {};
  for (const name of ['DATABASE_URL', 'PRISMA_DATABASE_URL', 'POSTGRES_URL']) {
    const raw = process.env[name];
    if (!raw) {
      described[name] = 'unset';
      continue;
    }
    const scheme = raw.split('://')[0];
    let host = '?';
    try {
      // Only the host survives. Anything that could carry a credential —
      // username, password, api_key — is never read.
      host = new URL(raw).hostname || '?';
    } catch {
      host = 'unparseable';
    }
    described[name] = `${scheme}://…@${host}`;
  }
  return described;
}

/**
 * Which endpoint wins, for the admin health check.
 *
 * Reported rather than assumed: the whole fix above depends on an environment
 * variable being set correctly in a place this code cannot read, and "I
 * believe it is pooled" is not something to find out you were wrong about
 * during someone's draft.
 *
 * Derived from the environment on every call rather than recorded when the
 * client is built. This used to be a module-level `let` set inside
 * `createClient`, and the health route always read it as `'unset'`: Next
 * bundles each route separately, the client is shared through `globalThis`,
 * so the route's own copy of this module never ran `createClient` and never
 * saw the assignment. The check was reporting on a bundle, not the database.
 */
export function datasourceMode(): DatasourceMode {
  return resolveDatasource().mode;
}

function resolveDatasource(): { url: string | undefined; mode: DatasourceMode } {
  const pooled = process.env.PRISMA_DATABASE_URL;
  if (pooled && /^prisma(\+postgres)?:\/\//i.test(pooled)) return { url: pooled, mode: 'pooled' };

  const direct = process.env.DATABASE_URL;
  if (!direct) return { url: undefined, mode: 'unset' };

  // A non-TCP URL has no client-side pool to size, and a long-lived local
  // process wants a normal pool — the cap below is a serverless remedy and
  // would only make `npm run dev` slower.
  if (!/^postgres(ql)?:\/\//i.test(direct) || !process.env.VERCEL) return { url: direct, mode: 'direct' };

  /**
   * 2. If we are on the direct endpoint anyway, hold one socket per instance.
   *
   * This is the floor the incident needed: without it a single function
   * instance could hold nine connections while doing one query's worth of
   * work. Explicit values only — anything already in the URL is the operator's
   * decision and is left alone.
   */
  try {
    const url = new URL(direct);
    const serverlessPool: Record<string, string> = {
      connection_limit: '1',
      pool_timeout: '20',
      connect_timeout: '10',
    };
    for (const [key, value] of Object.entries(serverlessPool)) {
      if (!url.searchParams.has(key)) url.searchParams.set(key, value);
    }
    return { url: url.toString(), mode: 'direct-capped' };
  } catch {
    return { url: direct, mode: 'direct' };
  }
}

/**
 * Failures that mean the query never reached the database.
 *
 * Deliberately narrow. Retrying one of these is safe even for a write, because
 * nothing was executed — the client could not get a connection in the first
 * place. Codes where the connection dropped *mid-flight* (P1017) are excluded
 * on purpose: there the write may well have committed, and a retry would
 * duplicate it.
 */
const NEVER_EXECUTED = new Set(['P1001', 'P1002', 'P2024', 'P2037']);
const MAX_ATTEMPTS = 3;

function isRetryable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return NEVER_EXECUTED.has(error.code);
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return error.errorCode != null && NEVER_EXECUTED.has(error.errorCode);
  }
  return false;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function createClient() {
  const base = new PrismaClient({
    datasourceUrl: resolveDatasource().url,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  /**
   * A contended pool is a moment, not a state. Backing off and asking again a
   * few hundred milliseconds later turns what used to be a crashed page into a
   * page that renders slightly late, which is the difference between "the app
   * is broken" and nobody noticing.
   */
  return base.$extends({
    query: {
      async $allOperations({ args, query }) {
        for (let attempt = 1; ; attempt += 1) {
          try {
            return await query(args);
          } catch (error) {
            if (attempt >= MAX_ATTEMPTS || !isRetryable(error)) throw error;
            // Exponential, with jitter so a wave of functions that all failed
            // together does not come back together and fail together again.
            await sleep(120 * 2 ** (attempt - 1) + Math.random() * 80);
          }
        }
      },
    },
  });
}

type Db = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as { prisma?: Db };

/**
 * One client per process, in every environment.
 *
 * In development this is the usual guard against hot reload leaking a client
 * per edit. In production it matters for a different reason: Next bundles
 * route handlers and pages separately, so a module can be evaluated more than
 * once inside a single instance, and each evaluation would otherwise open its
 * own pool against the same small connection budget.
 */
export const prisma: Db = globalForPrisma.prisma ?? createClient();
globalForPrisma.prisma = prisma;
