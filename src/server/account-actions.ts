'use server';

import { clerkClient } from '@clerk/nextjs/server';
import { prisma } from '../lib/db';
import { requireUser } from '../lib/auth';
import { eraseUserData } from './account';
import { DomainError } from './mutations';

export type DeleteAccountState = { error?: string; done?: boolean };

const CONFIRM_WORD = 'DELETE';

/**
 * Deletes the signed-in person's account: their data here, then their
 * sign-in at Clerk. In that order, on purpose. If the Clerk call fails after
 * our data is gone, the person still has a sign-in that no longer matches
 * any profile — on their next visit `getCurrentUser` provisions a fresh,
 * empty one, which they can delete again, and nothing personal has lingered
 * in the meantime. The other order would leave a profile with no owner to
 * ever delete it.
 */
export async function deleteAccountAction(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  let erased = false;
  try {
    const user = await requireUser();

    if (String(formData.get('confirm') ?? '').trim() !== CONFIRM_WORD) {
      throw new DomainError(`Type ${CONFIRM_WORD} to confirm.`, 'CONFIRM_MISMATCH');
    }

    // The Clerk id, read before the row is emptied — erasure replaces it.
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { authId: true } });

    await eraseUserData(user.id);
    erased = true;

    const clerk = await clerkClient();
    await clerk.users.deleteUser(row.authId);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return { error: 'Your session has ended. Sign in and try again.' };
    }
    console.error('[account] deletion failed', error);
    return {
      error: erased
        ? 'Your data here was removed but your sign-in could not be closed. Sign out, and if you can still sign in, contact us and we will finish it.'
        : 'Something went wrong and nothing was deleted. Try again, or contact us.',
    };
  }
  return { done: true };
}
