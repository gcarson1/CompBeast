'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '../lib/auth';
import {
  DomainError,
  createLeague,
  createLeagueSchema,
  deleteLeagueMessage,
  joinLeague,
  makeDraftPick,
  postLeagueMessage,
  refreshLeagueScores,
  startDraft,
  toggleMessageReaction,
} from './mutations';

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
