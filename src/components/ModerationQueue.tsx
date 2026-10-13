'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { Tag } from '@/components/Tag';
import { REPORT_REASONS } from '@/lib/report-reasons';
import { relativeTime } from '@/lib/ui';
import { liftSuspensionAction, resolveReportAction, type ActionState } from '@/server/actions';
import type { QueuedReport, SuspendedPerson } from '@/server/moderation';

/** One open report, with the three things a moderator can do about it. */
export function ReportRow({ report }: { report: QueuedReport }) {
  const [state, formAction] = useFormState<ActionState, FormData>(resolveReportAction, {});
  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  const quoted = report.currentBody ?? report.snapshot;

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone={report.viaBlock ? 'outline' : 'red'} size="sm">
          {report.viaBlock ? 'Blocked' : REPORT_REASONS[report.reason]}
        </Tag>
        <span className="text-2xs text-muted">
          {relativeTime(report.createdAt)}
          {report.reporterName ? ` · from ${report.reporterName}` : ''}
        </span>
      </div>

      <p className="mt-2 text-sm">
        <span className="font-semibold">{report.subject.name}</span>{' '}
        <span className="text-2xs text-muted">{report.subject.email}</span>
        {report.subject.suspended && (
          <Tag tone="red" size="sm" className="ml-2">
            Suspended
          </Tag>
        )}
        {report.subject.openReports > 1 && (
          <span className="ml-2 text-2xs text-danger-deep">{report.subject.openReports} open reports</span>
        )}
      </p>

      {quoted !== null && (
        <blockquote className="mt-2 whitespace-pre-wrap break-words border-l-2 border-hairline pl-3 text-sm text-muted">
          {quoted || <em>Empty post</em>}
          {report.currentBody === null && report.messageId && (
            <span className="mt-1 block text-2xs">Already deleted — this is how it read when reported.</span>
          )}
        </blockquote>
      )}
      {report.details && <p className="mt-2 text-2xs text-muted">Reporter: “{report.details}”</p>}
      {report.leagueId && (
        <Link
          href={`/leagues/${report.leagueId}`}
          prefetch={false}
          className="mt-2 inline-block text-2xs underline"
        >
          Open the league
        </Link>
      )}

      <form action={formAction} className="mt-3 flex flex-wrap gap-2">
        <input type="hidden" name="reportId" value={report.id} />
        {report.messageId && report.currentBody !== null && (
          <ActionButton action="REMOVE_POST" label="Remove post" />
        )}
        {!report.subject.suspended && (
          <ActionButton action="SUSPEND" label="Remove & suspend author" danger />
        )}
        <ActionButton action="DISMISS" label="Dismiss" />
      </form>
    </li>
  );
}

function ActionButton({
  action,
  label,
  danger = false,
}: {
  action: string;
  label: string;
  danger?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="action"
      value={action}
      disabled={pending}
      className={danger ? 'btn btn-sm bg-danger-strong text-white hover:brightness-110' : 'btn-ghost btn-sm'}
    >
      {label}
    </button>
  );
}

export function SuspendedRow({ person }: { person: SuspendedPerson }) {
  const [state, formAction] = useFormState<ActionState, FormData>(liftSuspensionAction, {});
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.ok) toast.success(`${person.name} can post again`);
  }, [state, person.name]);

  return (
    <li className="flex items-center gap-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{person.name}</span>
        <span className="block truncate text-2xs text-muted">
          {person.email} · {person.reason ?? 'Suspended'} · {relativeTime(person.suspendedAt)}
        </span>
      </span>
      <form action={formAction}>
        <input type="hidden" name="userId" value={person.id} />
        <LiftButton />
      </form>
    </li>
  );
}

function LiftButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className="btn-ghost btn-sm shrink-0">
      Lift
    </button>
  );
}
