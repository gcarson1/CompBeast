'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '../lib/auth';
import {
  DomainError,
  createLeague,
  createLeagueSchema,
  deleteLeague,
  deleteLeagueMessage,
  joinLeague,
  makeDraftPick,
  postLeagueMessage,
  refreshLeagueScores,
  startDraft,
  toggleMessageReaction,
  updateLeague,
  updateLeagueSchema,
} from './mutations';
import type { EmailCategory } from '../lib/email/templates';
import { setEmailPreference } from './notification-email';
import { markAllNotificationsRead } from './notifications';
import {
  inviteFriendToLeague,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
} from './social';

export type ActionState = { error?: string; ok?: boolean };

function messageFor(error: unknown): string {
  if (error instanceof DomainError) return error.message;
  if (error instanceof Error && error.message === 'FORBIDDEN') {
    return 'You do not have permission to do that.';
  }
  console.error(error);
  return 'Something went wrong. Try again.';
}

export async function createLeagueAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let leagueId: string;
  try {
    const user = await requireUser();
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

export async function joinLeagueAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let leagueId: string;
  try {
    const user = await requireUser();
    const inviteCode = String(formData.get('inviteCode') ?? '');
    const teamName = String(formData.get('teamName') ?? '').trim();
    if (teamName.length < 2) return { error: 'Give your team a name.' };
    leagueId = await joinLeague(user.id, inviteCode, teamName);
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath('/leagues');
  redirect(`/leagues/${leagueId}`);
}

export async function startDraftAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
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

export async function draftPickAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
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

export async function refreshScoresAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const leagueId = String(formData.get('leagueId') ?? '');
  try {
    await requireUser();
    await refreshLeagueScores(leagueId);
  } catch (error) {
    return { error: messageFor(error) };
  }
  revalidatePath(`/leagues/${leagueId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// League settings
// ---------------------------------------------------------------------------

export async function updateLeagueAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const leagueId = String(formData.get('leagueId') ?? '');
  try {
    const user = await requireUser();
    const parsed = updateLeagueSchema.parse({
      name: formData.get('name'),
      scoringRulesetId: formData.get('scoringRulesetId'),
      rosterSize: formData.get('rosterSize'),
      maxTeams: formData.get('maxTeams'),
      isPublic: formData.get('isPublic') === 'on',
      lockOffsetMinutes: formData.get('lockOffsetMinutes'),
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
export async function deleteLeagueAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
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

export async function sendFriendRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
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

export async function removeFriendAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    await removeFriend(user.id, String(formData.get('friendUserId') ?? ''));
  } catch (error) {
    return { error: messageFor(error) };
  }
  revalidatePath('/account');
  return { ok: true };
}

export async function inviteFriendAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const leagueId = String(formData.get('leagueId') ?? '');
  try {
    const user = await requireUser();
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
export async function setEmailPreferenceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
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

export async function postMessageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const leagueId = String(formData.get('leagueId') ?? '');
  try {
    const user = await requireUser();
    await postLeagueMessage(leagueId, user.id, String(formData.get('body') ?? ''));
  } catch (error) {
    return { error: messageFor(error) };
  }
  revalidatePath(`/leagues/${leagueId}`);
  return { ok: true };
}

export async function toggleReactionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const kind = formData.get('kind') === 'SHADE' ? ('SHADE' as const) : ('HYPE' as const);
  try {
    const user = await requireUser();
    const { leagueId } = await toggleMessageReaction(
      String(formData.get('messageId') ?? ''),
      user.id,
      kind,
    );
    revalidatePath(`/leagues/${leagueId}`);
  } catch (error) {
    return { error: messageFor(error) };
  }
  return { ok: true };
}

export async function deleteMessageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { leagueId } = await deleteLeagueMessage(String(formData.get('messageId') ?? ''), user.id);
    revalidatePath(`/leagues/${leagueId}`);
  } catch (error) {
    return { error: messageFor(error) };
  }
  return { ok: true };
}
