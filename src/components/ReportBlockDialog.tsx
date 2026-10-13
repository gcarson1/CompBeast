'use client';

import type { ReportReason } from '@prisma/client';
import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { REPORT_REASONS } from '@/lib/report-reasons';
import { cn } from '@/lib/ui';
import { blockUserAction, reportContentAction, type ActionState } from '@/server/actions';

type Step = 'menu' | 'report' | 'block' | 'reported';

/**
 * Report a post or a person, or block them — from wherever they appear.
 *
 * Opened from a "⋯" button beside a league post, on someone's team page and
 * on a friend's row. A real <dialog> (like the invite QR code): focus is
 * trapped and Escape closes it, which a hand-rolled menu would have to earn.
 *
 * Reporting sends it to the moderators (src/server/moderation.ts) with the
 * post as it read at that moment. Blocking ends contact both ways at once and
 * the post leaves the feed on the next render; they are not told.
 */
export function ReportBlockDialog({
  subjectUserId,
  subjectName,
  messageId,
  leagueId,
  label,
  trigger = 'icon',
  className,
}: {
  subjectUserId: string;
  subjectName: string;
  /** Reporting a post rather than a person. */
  messageId?: string;
  /** Where to re-render after a block, so a blocked post leaves at once. */
  leagueId?: string;
  /** The trigger's accessible name. */
  label: string;
  trigger?: 'icon' | 'text';
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<Step>('menu');
  const subject = messageId ? 'post' : 'person';

  const open = () => {
    setStep('menu');
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();

  return (
    <>
      {trigger === 'icon' ? (
        <button
          type="button"
          onClick={open}
          aria-label={label}
          className={cn(
            'grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink',
            className,
          )}
        >
          <MoreIcon />
        </button>
      ) : (
        <button
          type="button"
          onClick={open}
          className={cn('text-2xs text-muted underline-offset-2 hover:text-ink hover:underline', className)}
        >
          {label}
        </button>
      )}

      <dialog
        ref={dialogRef}
        aria-label={`Report or block ${subjectName}`}
        onKeyDown={(e) => {
          if (e.key === 'Escape') e.currentTarget.close();
        }}
        onClick={(e) => {
          // A click on the backdrop lands on the dialog itself (see InviteCode.tsx).
          if (e.target !== e.currentTarget) return;
          const box = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < box.left ||
            e.clientX > box.right ||
            e.clientY < box.top ||
            e.clientY > box.bottom
          ) {
            e.currentTarget.close();
          }
        }}
        className="rounded-card border border-hairline bg-surface p-0 text-ink shadow-card backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <div className="w-[min(22rem,calc(100vw-2.5rem))] p-5">
          {step === 'menu' && (
            <>
              <h2 className="headline text-2xl">{subjectName}</h2>
              <p className="mt-1 text-2xs leading-relaxed text-muted">
                {messageId
                  ? 'Something wrong with this post? Tell us, or stop seeing this person entirely.'
                  : 'Something wrong with this person’s name, picture or team? Tell us, or block them.'}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <button type="button" onClick={() => setStep('report')} className="btn-ghost justify-start">
                  Report {subject === 'post' ? 'this post' : subjectName}
                </button>
                <button
                  type="button"
                  onClick={() => setStep('block')}
                  className="btn-ghost justify-start text-danger-deep"
                >
                  Block {subjectName}
                </button>
                <button type="button" onClick={close} className="btn-ghost mt-1">
                  Cancel
                </button>
              </div>
            </>
          )}

          {step === 'report' && (
            <ReportForm
              subjectUserId={subjectUserId}
              messageId={messageId}
              onCancel={() => setStep('menu')}
              onDone={() => setStep('reported')}
            />
          )}

          {step === 'reported' && (
            <>
              <h2 className="headline text-2xl">Thanks for telling us</h2>
              <p className="mt-1 text-2xs leading-relaxed text-muted">
                A moderator will review it within 24 hours and remove anything that breaks the rules. You can
                also block {subjectName} so you no longer see each other.
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep('block')}
                  className="btn-ghost flex-1 text-danger-deep"
                >
                  Block
                </button>
                <button type="button" onClick={close} className="btn-primary flex-1">
                  Done
                </button>
              </div>
            </>
          )}

          {step === 'block' && (
            <BlockForm
              subjectUserId={subjectUserId}
              subjectName={subjectName}
              messageId={messageId}
              leagueId={leagueId}
              onCancel={() => setStep('menu')}
              onDone={close}
            />
          )}
        </div>
      </dialog>
    </>
  );
}

function ReportForm({
  subjectUserId,
  messageId,
  onCancel,
  onDone,
}: {
  subjectUserId: string;
  messageId?: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(reportContentAction, {});
  const [reason, setReason] = useState<ReportReason | null>(null);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.ok) onDone();
    // `onDone` changes identity every render; the result is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="subjectUserId" value={subjectUserId} />
      {messageId && <input type="hidden" name="messageId" value={messageId} />}
      <h2 className="headline text-2xl">What’s wrong?</h2>
      <fieldset className="mt-3">
        <legend className="sr-only">Reason</legend>
        <div className="divide-y divide-hairline border-y border-hairline">
          {(Object.keys(REPORT_REASONS) as ReportReason[]).map((key) => (
            <label key={key} className="flex cursor-pointer items-center gap-3 py-2.5 text-sm">
              <input
                type="radio"
                name="reason"
                value={key}
                required
                checked={reason === key}
                onChange={() => setReason(key)}
                className="h-4 w-4 accent-brand-gold"
              />
              {REPORT_REASONS[key]}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor="report-details" className="mt-3 block text-2xs text-muted">
        Anything a moderator should know (optional)
      </label>
      <textarea
        id="report-details"
        name="details"
        rows={2}
        maxLength={1000}
        className="field mt-1 resize-none"
      />
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost flex-1">
          Back
        </button>
        <SubmitButton label="Send report" pendingLabel="Sending…" disabled={!reason} />
      </div>
    </form>
  );
}

function BlockForm({
  subjectUserId,
  subjectName,
  messageId,
  leagueId,
  onCancel,
  onDone,
}: {
  subjectUserId: string;
  subjectName: string;
  messageId?: string;
  leagueId?: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(blockUserAction, {});

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.ok) {
      toast.success(`${subjectName} is blocked`);
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="subjectUserId" value={subjectUserId} />
      {messageId && <input type="hidden" name="messageId" value={messageId} />}
      {leagueId && <input type="hidden" name="leagueId" value={leagueId} />}
      <h2 className="headline text-2xl">Block {subjectName}?</h2>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-2xs leading-relaxed text-muted">
        <li>You won’t see each other’s posts in any league.</li>
        <li>Neither of you can find, friend or invite the other.</li>
        <li>They aren’t told, and our moderators are alerted.</li>
        <li>Undo it any time from the You tab.</li>
      </ul>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost flex-1">
          Back
        </button>
        <SubmitButton label="Block" pendingLabel="Blocking…" danger />
      </div>
    </form>
  );
}

function SubmitButton({
  label,
  pendingLabel,
  disabled = false,
  danger = false,
}: {
  label: string;
  pendingLabel: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      data-haptic="press"
      className={cn(
        'flex-1',
        danger ? 'btn bg-danger-strong text-white hover:brightness-110' : 'btn-primary',
      )}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}
