import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth';
import { datasourceMode, prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Is the database reachable, and are we holding it correctly?
 *
 * This exists because of the connection-exhaustion incident that crashed
 * drafts (see src/lib/db.ts). The remedy for that lives half in code and half
 * in an environment variable, and a deploy can silently lose the second half —
 * at which point everything looks fine until enough people are on the site at
 * once. So the answer is a URL somebody can open, rather than a belief.
 *
 * Reports the connection *mode*, never the connection string. Admin-only
 * regardless: connection counts are exactly the sort of thing that tells an
 * attacker when to push.
 */
export async function GET() {
  try {
    await requirePlatformAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const started = Date.now();
  let server: Record<string, unknown> | null = null;
  let error: string | null = null;

  try {
    // `pg_stat_activity` is what "too many connections" is actually counting.
    const rows = await prisma.$queryRaw<
      Array<{ role: string; open_connections: bigint; max_connections: string }>
    >`
      SELECT current_user AS role,
             (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database())
               AS open_connections,
             current_setting('max_connections') AS max_connections
    `;
    const row = rows[0];
    server = row
      ? {
          role: row.role,
          openConnections: Number(row.open_connections),
          maxConnections: Number(row.max_connections),
        }
      : null;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'unknown';
  }

  return NextResponse.json(
    {
      ok: error === null,
      // 'pooled' is the healthy answer. 'direct-capped' works but is holding
      // real sockets; 'direct' means neither defence is active.
      mode: datasourceMode,
      latencyMs: Date.now() - started,
      server,
      error,
    },
    { status: error === null ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
