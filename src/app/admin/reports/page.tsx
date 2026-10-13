import type { Metadata } from 'next';
import Link from 'next/link';
import { ReportRow, SuspendedRow } from '@/components/ModerationQueue';
import { StatStrip } from '@/components/StatStrip';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getModerationQueue, getSuspendedPeople } from '@/server/moderation';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Moderation', robots: { index: false, follow: false } };

/**
 * The moderation queue: every open report and block, oldest first, with the
 * post as it read when reported. The commitment in the terms (and to App
 * Review) is that a report is acted on within 24 hours; every platform admin
 * is alerted the moment one arrives (src/server/moderation.ts).
 */
export default async function ModerationPage() {
  const user = await getCurrentUser();
  if (!user?.isPlatformAdmin) {
    return (
      <div className="pt-2">
        <Link href="/leagues" className="text-xs text-muted">
          ← Leagues
        </Link>
        <div className="mt-6">
          <h1 className="headline text-4xl">Admins only</h1>
          <p className="mt-2 max-w-measure text-xs text-muted">
            The moderation queue holds what members reported about each other.
          </p>
        </div>
      </div>
    );
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [queue, suspended, settledToday] = await Promise.all([
    getModerationQueue(),
    getSuspendedPeople(),
    prisma.contentReport.count({ where: { status: { not: 'OPEN' }, resolvedAt: { gte: dayAgo } } }),
  ]);
  const overdue = queue.filter((report) => report.createdAt < dayAgo).length;

  return (
    <div className="pt-2">
      <nav className="flex gap-4 text-xs text-muted">
        <Link href="/leagues">← Leagues</Link>
        <Link href="/admin/ingestion" prefetch={false} className="ml-auto">
          Ingestion →
        </Link>
      </nav>
      <h1 className="headline mt-3 text-4xl">Moderation</h1>
      <p className="mt-2 max-w-measure text-xs text-muted">
        Posts and people members reported or blocked. Act on each within 24 hours: remove what breaks the
        rules, suspend whoever keeps breaking them.
      </p>

      <StatStrip
        className="mt-6"
        items={[
          {
            label: 'Open',
            value: String(queue.length),
            tone: queue.length ? 'text-brand-gold-deep' : undefined,
          },
          { label: 'Over 24h', value: String(overdue), tone: overdue ? 'text-danger-deep' : undefined },
          { label: 'Settled today', value: String(settledToday) },
        ]}
      />

      <section className="mt-8" aria-labelledby="queue-heading">
        <h2 id="queue-heading" className="section-title mb-3">
          Open reports
        </h2>
        {queue.length === 0 ? (
          <p className="list-empty">Nothing waiting. Every report has been dealt with.</p>
        ) : (
          <ul className="list">
            {queue.map((report) => (
              <ReportRow key={report.id} report={report} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="suspended-heading">
        <h2 id="suspended-heading" className="section-title mb-3">
          Suspended
        </h2>
        {suspended.length === 0 ? (
          <p className="list-empty">Nobody is suspended.</p>
        ) : (
          <ul className="list">
            {suspended.map((person) => (
              <SuspendedRow key={person.id} person={person} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
