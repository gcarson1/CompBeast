'use server';

import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '../lib/auth';
import { approveCandidate, ingestSeason, rejectCandidate } from '../lib/ingestion/pipeline';
import { IngestionError } from '../lib/ingestion/types';

export type IngestionActionState = { error?: string; message?: string };

function messageFor(error: unknown): string {
  if (error instanceof IngestionError) return error.message;
  if (error instanceof Error && error.message === 'UNAUTHENTICATED') return 'Sign in first.';
  if (error instanceof Error && error.message === 'FORBIDDEN') {
    return 'Ingestion review is restricted to platform admins.';
  }
  console.error(error);
  return 'Something went wrong. Try again.';
}

export async function approveCandidateAction(
  _prev: IngestionActionState,
  formData: FormData,
): Promise<IngestionActionState> {
  try {
    const user = await requirePlatformAdmin();
    await approveCandidate(String(formData.get('candidateId') ?? ''), user.id);
  } catch (error) {
    return { error: messageFor(error) };
  }
  revalidatePath('/admin/ingestion');
  return { message: 'Published.' };
}

export async function rejectCandidateAction(
  _prev: IngestionActionState,
  formData: FormData,
): Promise<IngestionActionState> {
  try {
    const user = await requirePlatformAdmin();
    const reason = String(formData.get('reason') ?? '').trim() || 'Rejected by reviewer';
    await rejectCandidate(String(formData.get('candidateId') ?? ''), user.id, reason);
  } catch (error) {
    return { error: messageFor(error) };
  }
  revalidatePath('/admin/ingestion');
  return { message: 'Rejected.' };
}

export async function runSyncAction(
  _prev: IngestionActionState,
  formData: FormData,
): Promise<IngestionActionState> {
  try {
    const user = await requirePlatformAdmin();
    const result = await ingestSeason({
      sourceSlug: String(formData.get('sourceSlug') ?? ''),
      seasonExternalId: String(formData.get('seasonSlug') ?? ''),
      recordedById: user.id,
    });

    if (result.status === 'FAILED') return { error: result.error ?? 'Sync failed.' };
    if (result.status === 'EMPTY') {
      return { error: 'Sync parsed no weeks — the source layout may have changed.' };
    }

    revalidatePath('/admin/ingestion');
    return {
      message: `${result.candidatesNew} new · ${result.autoPublished} published · ${result.pendingReview} to review`,
    };
  } catch (error) {
    return { error: messageFor(error) };
  }
}
