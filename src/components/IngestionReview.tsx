'use client';

import { useFormState, useFormStatus } from 'react-dom';
import {
  approveCandidateAction,
  rejectCandidateAction,
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

export function SyncButton({
  sourceSlug,
  seasonSlug,
  seasonName,
}: {
  sourceSlug: string;
  seasonSlug: string;
  seasonName: string;
}) {
  const [state, formAction] = useFormState<IngestionActionState, FormData>(runSyncAction, {});

  return (
    <form action={formAction} className="card flex items-center justify-between gap-3 p-4">
      <input type="hidden" name="sourceSlug" value={sourceSlug} />
      <input type="hidden" name="seasonSlug" value={seasonSlug} />
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-semibold">{seasonName}</span>
        <span className="mt-0.5 block truncate text-[12px] text-muted">{sourceSlug}</span>
        {state.message && (
          <span className="mt-1 block text-[12px] text-brand-gold-deep">{state.message}</span>
        )}
        {state.error && <span className="mt-1 block text-[12px] text-danger">{state.error}</span>}
      </span>
      <SubmitButton label="Sync" pendingLabel="Syncing…" />
    </form>
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
          <p className="truncate text-[15px] font-semibold">{candidate.playerName}</p>
          <p className="mt-0.5 text-[13px] text-muted">
            {candidate.eventLabel ?? candidate.eventCode} · {candidate.weekLabel}
            {candidate.points !== null && (
              <span className="ml-1 tabular-nums">
                ({candidate.points > 0 ? `+${candidate.points}` : candidate.points})
              </span>
            )}
          </p>
        </div>
        <span
          className={`pill shrink-0 text-[11px] ${
            candidate.confidence === 'MEDIUM'
              ? 'bg-brand-gold-soft text-brand-gold-deep'
              : 'bg-danger/15 text-danger'
          }`}
        >
          {candidate.confidence.toLowerCase()}
        </span>
      </div>

      {candidate.reasons.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-2xl bg-canvas/70 p-3">
          {candidate.reasons.map((reason) => (
            <li key={reason} className="text-[12px] leading-relaxed text-muted">
              {reason}
            </li>
          ))}
        </ul>
      )}

      {!candidate.resolvable && (
        <p className="mt-3 text-[12px] text-danger">
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
            className="field flex-1 !py-2 text-[13px]"
            aria-label="Rejection reason"
          />
          <RejectButton />
        </form>
      </div>

      {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
    </li>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary text-[13px] disabled:opacity-50">
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
      className="pill shrink-0 bg-canvas text-[13px] text-danger disabled:opacity-50"
    >
      {pending ? '…' : 'Reject'}
    </button>
  );
}
