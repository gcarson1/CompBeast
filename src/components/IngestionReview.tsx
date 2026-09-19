'use client';

import { useFormState, useFormStatus } from 'react-dom';
import {
  approveCandidateAction,
  rejectCandidateAction,
  runBootstrapAction,
  runSyncAction,
  type IngestionActionState,
} from '@/server/ingestion-actions';

export interface PendingCandidate {
  id: string;
  eventCode: string;
  eventLabel: string | null;
  points: number | null;
  playerName: string;
  weekLabel: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reasons: string[];
  sourceSlug: string;
  sourceUrl: string | null;
  resolvable: boolean;
}

/**
 * One source-backed season, with both things an admin can trigger against it:
 * `Sync` reads the results grid and publishes events, `Refresh cast` re-runs
 * the season bootstrap to pull cast fields the adapter can now capture but
 * this environment's database predates (photos).
 *
 * The card is a plain element wrapping two sibling forms rather than being a
 * form itself — HTML has no valid way to nest them, and each action carries
 * its own pending state and result message.
 */
export function SeasonSourceCard({
  sourceSlug,
  seasonSlug,
  seasonName,
  showSlug,
  year,
}: {
  sourceSlug: string;
  seasonSlug: string;
  seasonName: string;
  showSlug: string;
  year: number;
}) {
  const [syncState, sync] = useFormState<IngestionActionState, FormData>(runSyncAction, {});
  const [bootstrapState, bootstrap] = useFormState<IngestionActionState, FormData>(
    runBootstrapAction,
    {},
  );

  const message = syncState.message ?? bootstrapState.message;
  const error = syncState.error ?? bootstrapState.error;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{seasonName}</span>
          <span className="mt-0.5 block truncate text-2xs text-muted">{sourceSlug}</span>
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <form action={bootstrap}>
            <input type="hidden" name="sourceSlug" value={sourceSlug} />
            <input type="hidden" name="seasonSlug" value={seasonSlug} />
            <input type="hidden" name="showSlug" value={showSlug} />
            <input type="hidden" name="year" value={year} />
            <GhostSubmitButton label="Refresh cast" pendingLabel="Refreshing…" />
          </form>
          <form action={sync}>
            <input type="hidden" name="sourceSlug" value={sourceSlug} />
            <input type="hidden" name="seasonSlug" value={seasonSlug} />
            <SubmitButton label="Sync" pendingLabel="Syncing…" />
          </form>
        </div>
      </div>
      {message && <p className="mt-2 text-2xs text-brand-gold-deep">{message}</p>}
      {error && <p className="mt-2 text-2xs text-danger-deep">{error}</p>}
    </div>
  );
}

export function CandidateCard({ candidate }: { candidate: PendingCandidate }) {
  const [approveState, approve] = useFormState<IngestionActionState, FormData>(
    approveCandidateAction,
    {},
  );
  const [rejectState, reject] = useFormState<IngestionActionState, FormData>(
    rejectCandidateAction,
    {},
  );

  const error = approveState.error ?? rejectState.error;

  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{candidate.playerName}</p>
          <p className="mt-0.5 text-xs text-muted">
            {candidate.eventLabel ?? candidate.eventCode} · {candidate.weekLabel}
            {candidate.points !== null && (
              <span className="ml-1 tabular-nums">
                ({candidate.points > 0 ? `+${candidate.points}` : candidate.points})
              </span>
            )}
          </p>
        </div>
        <span
          className={`pill shrink-0 text-2xs ${
            candidate.confidence === 'MEDIUM'
              ? 'bg-brand-gold-soft text-brand-gold-deep'
              : 'bg-danger-soft text-danger-deep'
          }`}
        >
          {candidate.confidence.toLowerCase()}
        </span>
      </div>

      {candidate.reasons.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-2xl bg-canvas/70 p-3">
          {candidate.reasons.map((reason) => (
            <li key={reason} className="text-2xs leading-relaxed text-muted">
              {reason}
            </li>
          ))}
        </ul>
      )}

      {!candidate.resolvable && (
        <p className="mt-3 text-2xs text-danger-deep">
          Missing a matched houseguest or week — this cannot be published until the season is
          re-bootstrapped.
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        {candidate.resolvable && (
          <form action={approve}>
            <input type="hidden" name="candidateId" value={candidate.id} />
            <SubmitButton label="Approve" pendingLabel="…" />
          </form>
        )}
        <form action={reject} className="flex flex-1 items-center gap-2">
          <input type="hidden" name="candidateId" value={candidate.id} />
          <input
            name="reason"
            placeholder="Reason (optional)"
            className="field flex-1 !py-2 text-xs"
            aria-label="Rejection reason"
          />
          <RejectButton />
        </form>
      </div>

      {error && <p className="mt-2 text-2xs text-danger-deep">{error}</p>}
    </li>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className="btn-primary text-xs disabled:opacity-50">
      {pending ? pendingLabel : label}
    </button>
  );
}

function GhostSubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="btn-ghost text-xs disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function RejectButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-ghost shrink-0 text-xs text-danger-deep disabled:opacity-50"
    >
      {pending ? '…' : 'Reject'}
    </button>
  );
}
