'use server';

import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '../lib/auth';
import { prisma } from '../lib/db';
import {
  approveCandidate,
  bootstrapSeasonFromSource,
  ingestSeason,
  rejectCandidate,
} from '../lib/ingestion/pipeline';
import { IngestionError } from '../lib/ingestion/types';
import { announceSeasonResults } from './league-chat';

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

    // New results reached leaderboards, so the leagues' chats hear about it —
    // the same step the scheduled sync takes.
    let chats = 0;
    if (result.autoPublished > 0) {
      const season = await prisma.season.findUnique({
        where: { slug: String(formData.get('seasonSlug') ?? '') },
        select: { id: true },
      });
      if (season) chats = await announceSeasonResults(season.id);
    }

    revalidatePath('/admin/ingestion');
    return {
      message: `${result.candidatesNew} new · ${result.autoPublished} published · ${result.pendingReview} to review${
        chats > 0 ? ` · posted to ${chats} ${chats === 1 ? 'chat' : 'chats'}` : ''
      }`,
    };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

/**
 * Re-runs a season's bootstrap against its source.
 *
 * Bootstrap is idempotent — an already-linked houseguest is matched by source
 * id and only has missing fields filled in — so this doubles as the way to
 * pull in cast data the adapter learned to capture after a season was first
 * ingested (photos, most recently). Exposing it here means a deployed
 * environment can be refreshed by an admin in the browser, rather than
 * requiring someone to point a local shell at that environment's database.
 */
export async function runBootstrapAction(
  _prev: IngestionActionState,
  formData: FormData,
): Promise<IngestionActionState> {
  try {
    await requirePlatformAdmin();
    const result = await bootstrapSeasonFromSource({
      sourceSlug: String(formData.get('sourceSlug') ?? ''),
      seasonExternalId: String(formData.get('seasonSlug') ?? ''),
      showSlug: String(formData.get('showSlug') ?? ''),
      year: Number(formData.get('year') ?? 0),
    });

    revalidatePath('/admin/ingestion');
    return {
      message:
        `${result.photosBackfilled} photos · ${result.contestantsCreated} new contestants · ` +
        `${result.cyclesCreated} new cycles`,
    };
  } catch (error) {
    return { error: messageFor(error) };
  }
}
