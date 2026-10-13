'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import type { ReportReason } from '@prisma/client';
import { requireActiveUser, requirePlatformAdmin, requireUser } from '../lib/auth';
import {
  DomainError,
  createLeague,
  createLeagueSchema,
  deleteLeague,
  deleteLeagueMessage,
  joinLeague,
  makeDraftPick,
  postLeagueMessage,
  startDraft,
  toggleMessageReaction,
  updateLeague,
  updateLeagueSchema,
} from './mutations';
import type { EmailCategory } from '../lib/email/templates';
import { joinLeagueSchema } from '../lib/validation';
import { setEmailPreference } from './notification-email';
import { markAllNotificationsRead } from './notifications';
import { REPORT_REASONS } from '../lib/report-reasons';
import {
  type ModerationAction,
  blockUser,
  liftSuspension,
  reportContent,
  resolveReport,
  unblockUser,
} from './moderation';
import { inviteFriendToLeague, removeFriend, respondToFriendRequest, sendFriendRequest } from './social';

export type ActionState = { error?: string; ok?: boolean };

function messageFor(error: unknown): string {
  if (error instanceof DomainError) return error.message;
  // The schemas write every message for the person reading it (see
  // src/lib/validation.ts); the browser's own constraint validation usually
  // catches these first, so this is the JavaScript-off path and the safety net.
  if (error instanceof ZodError) return error.issues[0]?.message ?? 'Check the form and try again.';
  if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
    return 'Your session has ended. Sign in and try again.';
  }
  if (error instanceof Error && error.message === 'FORBIDDEN') {
    return 'You do not have permission to do that.';
  }
  if (error instanceof Error && error.message === 'SUSPENDED') {
    return 'Your account is suspended for breaking the community rules, so you cannot post, join or invite. If you think this is a mistake, contact us from the support page.';
  }
  console.error(error);
  return 'Something went wrong. Try again.';
}

export async function createLeagueAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let leagueId: string;
  try {
    const user = await requireActiveUser();
    const parsed = createLeagueSchema.parse({
      name: formData.get('name'),
      seasonId: formData.get('seasonId'),
      scoringRulesetId: formData.get('scoringRulesetId'),
      rosterSize: formData.get('rosterSize'),
      maxTeams: formData.get('maxTeams'),
      isPublic: formData.get('isPublic') === 'on',
      teamName: formData.get('teamName'),
    });
    const league = await createLeague(user.id, parsed);
    leagueId = league.id;
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath('/leagues');
  redirect(`/leagues/${leagueId}`);
}

export async function joinLeagueAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let leagueId: string;
  try {
    const user = await requireActiveUser();
    const parsed = joinLeagueSchema.parse({
      inviteCode: formData.get('inviteCode'),
      teamName: formData.get('teamName'),
    });
    leagueId = await joinLeague(user.id, parsed.inviteCode, parsed.teamName);
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath('/leagues');
  redirect(`/leagues/${leagueId}`);
}

export async function startDraftAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const leagueId = String(formData.get('leagueId') ?? '');
  try {
    const user = await requireUser();
    await startDraft(leagueId, user.id);
  } catch (error) {
    return { error: messageFor(error) };
  }
  revalidatePath(`/leagues/${leagueId}/draft`);
  return { ok: true };
}

export async function draftPickAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const leagueId = String(formData.get('leagueId') ?? '');
  try {
    const user = await requireUser();
    await makeDraftPick({
      leagueId,
      teamId: String(formData.get('teamId') ?? ''),
      contestantId: String(formData.get('contestantId') ?? ''),
      userId: user.id,
    });
  } catch (error) {
    return { error: messageFor(error) };
  }
  revalidatePath(`/leagues/${leagueId}/draft`);
  revalidatePath(`/leagues/${leagueId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// League settings
// ---------------------------------------------------------------------------

export async function updateLeagueAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const leagueId = String(formData.get('leagueId') ?? '');
  try {
    const user = await requireActiveUser();
    const parsed = updateLeagueSchema.parse({
      name: formData.get('name'),
      scoringRulesetId: formData.get('scoringRulesetId'),
      rosterSize: formData.get('rosterSize'),
      maxTeams: formData.get('maxTeams'),
      isPublic: formData.get('isPublic') === 'on',
      lockOffsetMinutes: formData.get('lockOffsetMinutes'),
      chatWebhookUrl: formData.get('chatWebhookUrl'),
    });
    await updateLeague(leagueId, user.id, parsed);
  } catch (error) {
    return { error: messageFor(error) };
  }
  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/settings`);
  revalidatePath('/leagues');
  return { ok: true };
}

/**
 * Deleting redirects out of the league that no longer exists.
 *
 * `redirect` throws to unwind, so it has to sit outside the try — inside, the
 * catch would treat a successful delete as a failure and report "something
 * went wrong" for work that actually completed.
 */
export async function deleteLeagueAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    await deleteLeague(
      String(formData.get('leagueId') ?? ''),
      user.id,
      String(formData.get('confirmName') ?? ''),
    );
  } catch (error) {
    return { error: messageFor(error) };
  }
  revalidatePath('/leagues');
  redirect('/leagues');
}

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------

export async function sendFriendRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActiveUser();
    await sendFriendRequest(user.id, String(formData.get('targetUserId') ?? ''));
  } catch (error) {
    return { error: messageFor(error) };
  }
  revalidatePath('/account');
  return { ok: true };
}

export async function respondToFriendRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    await respondToFriendRequest(
      user.id,
      String(formData.get('friendshipId') ?? ''),
      formData.get('accept') === 'true',
    );
  } catch (error) {
    return { error: messageFor(error) };
  }
  revalidatePath('/account');
  return { ok: true };
}

export async function removeFriendAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    await removeFriend(user.id, String(formData.get('friendUserId') ?? ''));
  } catch (error) {
    return { error: messageFor(error) };
  }
  revalidatePath('/account');
  return { ok: true };
}

export async function inviteFriendAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const leagueId = String(formData.get('leagueId') ?? '');
  try {
    const user = await requireActiveUser();
    await inviteFriendToLeague(user.id, String(formData.get('friendUserId') ?? ''), leagueId);
  } catch (error) {
    return { error: messageFor(error) };
  }
  revalidatePath(`/leagues/${leagueId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * One switch, one submit.
 *
 * Each toggle posts its own form rather than being part of a settings form
 * with a save button: a preference someone changed and then navigated away
 * from should already be saved, and on a phone the save button is the step
 * people miss.
 */
export async function setEmailPreferenceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const scope = String(formData.get('scope') ?? '');
    await setEmailPreference(
      user.id,
      scope === 'all' ? 'all' : (scope as EmailCategory),
      formData.get('enabled') === 'true',
    );
  } catch (error) {
    return { error: messageFor(error) };
  }
  revalidatePath('/account');
  return { ok: true };
}

export async function markAllNotificationsReadAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    await markAllNotificationsRead(user.id);
  } catch (error) {
    return { error: messageFor(error) };
  }
  revalidatePath('/notifications');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// League feed
// ---------------------------------------------------------------------------

export async function postMessageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const leagueId = String(formData.get('leagueId') ?? '');
  try {
    const user = await requireActiveUser();
    await postLeagueMessage(leagueId, user.id, String(formData.get('body') ?? ''));
  } catch (error) {
    return { error: messageFor(error) };
  }
  revalidatePath(`/leagues/${leagueId}`);
  return { ok: true };
}

export async function toggleReactionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const kind = formData.get('kind') === 'SHADE' ? ('SHADE' as const) : ('HYPE' as const);
  try {
    const user = await requireActiveUser();
    const { leagueId } = await toggleMessageReaction(String(formData.get('messageId') ?? ''), user.id, kind);
    revalidatePath(`/leagues/${leagueId}`);
  } catch (error) {
    return { error: messageFor(error) };
  }
  return { ok: true };
}

export async function deleteMessageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { leagueId } = await deleteLeagueMessage(String(formData.get('messageId') ?? ''), user.id);
    revalidatePath(`/leagues/${leagueId}`);
  } catch (error) {
    return { error: messageFor(error) };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reporting and blocking (see src/server/moderation.ts)
// ---------------------------------------------------------------------------

function reasonFrom(value: FormDataEntryValue | null): ReportReason {
  const reason = String(value ?? '');
  return reason in REPORT_REASONS ? (reason as ReportReason) : 'OTHER';
}

/** Anyone signed in may report, suspended or not: reporting reaches only the moderators. */
export async function reportContentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    await reportContent(user.id, {
      messageId: String(formData.get('messageId') ?? '') || undefined,
      subjectUserId: String(formData.get('subjectUserId') ?? '') || undefined,
      reason: reasonFrom(formData.get('reason')),
      details: String(formData.get('details') ?? ''),
    });
  } catch (error) {
    return { error: messageFor(error) };
  }
  return { ok: true };
}

export async function blockUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const leagueId = String(formData.get('leagueId') ?? '');
  try {
    const user = await requireUser();
    await blockUser(user.id, String(formData.get('subjectUserId') ?? ''), {
      messageId: String(formData.get('messageId') ?? '') || undefined,
    });
  } catch (error) {
    return { error: messageFor(error) };
  }
  if (leagueId) revalidatePath(`/leagues/${leagueId}`);
  revalidatePath('/account');
  return { ok: true };
}

export async function unblockUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    await unblockUser(user.id, String(formData.get('subjectUserId') ?? ''));
  } catch (error) {
    return { error: messageFor(error) };
  }
  revalidatePath('/account');
  return { ok: true };
}

const MODERATION_ACTIONS: ModerationAction[] = ['REMOVE_POST', 'SUSPEND', 'DISMISS'];

export async function resolveReportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requirePlatformAdmin();
    const action = String(formData.get('action') ?? '') as ModerationAction;
    if (!MODERATION_ACTIONS.includes(action)) return { error: 'Pick what to do with the report.' };
    await resolveReport(admin.id, String(formData.get('reportId') ?? ''), action);
  } catch (error) {
    return { error: messageFor(error) };
  }
  revalidatePath('/admin/reports');
  return { ok: true };
}

export async function liftSuspensionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requirePlatformAdmin();
    await liftSuspension(String(formData.get('userId') ?? ''));
  } catch (error) {
    return { error: messageFor(error) };
  }
  revalidatePath('/admin/reports');
  return { ok: true };
}
