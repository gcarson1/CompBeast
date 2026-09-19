// Roster lock timing.
//
// Pure, data-in/answer-out, with no Prisma import — the same split the scoring
// engine uses, so this unit tests without a database and can be called during
// render from data a page already loaded. The version this replaces was an
// `async` function in src/server/mutations.ts that issued two queries of its
// own, which is why nothing ever called it: every caller already had the cycle
// and the league in hand and was not about to re-fetch them.
//
// `now` is injectable because a time-dependent rule that can only be tested by
// waiting is a rule that does not get tested.

/** The season-wide default in `src/lib/ingestion/pipeline.ts`. Shown in the UI. */
export const DEFAULT_LOCK_OFFSET_MINUTES = 30;

export interface LockableCycle {
  locksAt: Date;
  airsAt: Date | null;
  status: 'UPCOMING' | 'LOCKED' | 'LIVE' | 'SCORED';
}

/**
 * When this league's rosters actually lock for this cycle.
 *
 * `League.lockOffsetMinutes` is counted back from **air time**, not from the
 * season's own lock, so a league can sit closer to or further from the
 * broadcast than the season default without the two compounding.
 *
 * Falls back to the season-wide `Cycle.locksAt` when the league has no
 * preference, and *also* when the cycle has no air time at all — an ingested
 * season routinely arrives with no reliable air dates, and an offset counted
 * back from a missing timestamp is not a deadline, it is a crash.
 */
export function effectiveLockAt(
  cycle: Pick<LockableCycle, 'locksAt' | 'airsAt'>,
  lockOffsetMinutes: number | null | undefined,
): Date {
  if (lockOffsetMinutes == null || cycle.airsAt === null) return cycle.locksAt;
  return new Date(cycle.airsAt.getTime() - lockOffsetMinutes * 60_000);
}

/**
 * Whether rosters are shut for this cycle.
 *
 * Any status past UPCOMING is locked outright regardless of the clock: once a
 * cycle is LOCKED, LIVE or SCORED, results are being recorded against it, and
 * no per-league offset should be able to reopen it.
 */
export function isCycleLocked(
  cycle: LockableCycle,
  lockOffsetMinutes: number | null | undefined,
  now: Date = new Date(),
): boolean {
  if (cycle.status !== 'UPCOMING') return true;
  return now.getTime() >= effectiveLockAt(cycle, lockOffsetMinutes).getTime();
}

/** Offsets offered in league settings, longest lead time last. */
export const LOCK_OFFSET_CHOICES = [
  { value: 0, label: 'At airtime' },
  { value: 15, label: '15 minutes before airtime' },
  { value: 30, label: '30 minutes before airtime' },
  { value: 60, label: '1 hour before airtime' },
  { value: 120, label: '2 hours before airtime' },
  { value: 360, label: '6 hours before airtime' },
  { value: 1440, label: '24 hours before airtime' },
] as const;

/** Upper bound shared by the form and the schema. 24 hours. */
export const MAX_LOCK_OFFSET_MINUTES = 1440;

/**
 * Human phrasing for an offset, e.g. "1 hour before airtime".
 *
 * Shared by the settings form and the notification text so a commissioner is
 * told the deadline moved using the same words they picked it with.
 */
export function describeLockOffset(minutes: number): string {
  const preset = LOCK_OFFSET_CHOICES.find((choice) => choice.value === minutes);
  if (preset) return preset.label.toLowerCase();
  if (minutes === 0) return 'at airtime';
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} before airtime`;
  }
  return `${minutes} minutes before airtime`;
}
