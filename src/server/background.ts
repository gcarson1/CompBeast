import { waitUntil } from '@vercel/functions';

/**
 * Runs work the caller must not wait for.
 *
 * Email, push and chat posts live downstream of things people are staring at
 * — a draft pick, a league invite — and none of them is worth a second of
 * somebody's turn. `waitUntil` hands the promise to the platform, which keeps
 * the function alive until it settles *after* the response has gone out.
 *
 * Off Vercel there is no such platform, so the promise is simply left
 * running: locally the process outlives it anyway, and in tests the
 * underlying delivery functions are awaited directly.
 */
export function background(work: Promise<unknown>): void {
  try {
    waitUntil(work);
  } catch {
    void work;
  }
}
