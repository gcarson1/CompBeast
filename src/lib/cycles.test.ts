import { describe, expect, it } from 'vitest';
import { effectiveLockAt, isCycleLocked, type LockableCycle } from './cycles';

/**
 * These are the tests the old `async isCycleLocked` could not have: it took
 * ids, hit the database twice and read `Date.now()` directly, so pinning
 * behaviour meant standing up a database and waiting for real time to pass.
 * Nobody was going to do that, which is a large part of why the function sat
 * dead and its one real rule — the per-league offset — was never wired up.
 */

const AIRS = new Date('2026-03-10T20:00:00Z');
// The season-wide default the ingestion pipeline writes: 30 min before air.
const SEASON_LOCK = new Date('2026-03-10T19:30:00Z');

const cycle = (overrides: Partial<LockableCycle> = {}): LockableCycle => ({
  locksAt: SEASON_LOCK,
  airsAt: AIRS,
  status: 'UPCOMING',
  ...overrides,
});

describe('effectiveLockAt', () => {
  it('uses the season lock when the league has no preference', () => {
    expect(effectiveLockAt(cycle(), null)).toEqual(SEASON_LOCK);
    expect(effectiveLockAt(cycle(), undefined)).toEqual(SEASON_LOCK);
  });

  it('counts the offset back from airtime, not from the season lock', () => {
    // 60 minutes before air is 19:00, not 18:30. Counting back from the
    // season lock instead would compound the two.
    expect(effectiveLockAt(cycle(), 60)).toEqual(new Date('2026-03-10T19:00:00Z'));
  });

  it('treats a zero offset as locking exactly at airtime', () => {
    // Not falsy-coerced to "no preference" — 0 is a real, later deadline than
    // the season default, and `!lockOffsetMinutes` would have silently
    // discarded it.
    expect(effectiveLockAt(cycle(), 0)).toEqual(AIRS);
  });

  it('can lock later than the season default', () => {
    const at = effectiveLockAt(cycle(), 15);
    expect(at.getTime()).toBeGreaterThan(SEASON_LOCK.getTime());
    expect(at).toEqual(new Date('2026-03-10T19:45:00Z'));
  });

  it('falls back to the season lock when a cycle has no airtime', () => {
    // Ingested seasons routinely arrive without reliable air dates. An offset
    // counted back from null is not a deadline, it is a crash.
    expect(effectiveLockAt(cycle({ airsAt: null }), 120)).toEqual(SEASON_LOCK);
  });
});

describe('isCycleLocked', () => {
  it('is open before the effective lock and shut after it', () => {
    const c = cycle();
    expect(isCycleLocked(c, 60, new Date('2026-03-10T18:59:00Z'))).toBe(false);
    expect(isCycleLocked(c, 60, new Date('2026-03-10T19:01:00Z'))).toBe(true);
  });

  it('shuts exactly on the boundary', () => {
    expect(isCycleLocked(cycle(), 60, new Date('2026-03-10T19:00:00Z'))).toBe(true);
  });

  it('honours the league offset rather than the season lock', () => {
    const at1915 = new Date('2026-03-10T19:15:00Z');

    // Season lock is 19:30, so with no preference this is still open.
    expect(isCycleLocked(cycle(), null, at1915)).toBe(false);
    // A league locking 60 minutes out shut at 19:00.
    expect(isCycleLocked(cycle(), 60, at1915)).toBe(true);
    // A league locking at airtime is open right up to 20:00.
    expect(isCycleLocked(cycle(), 0, at1915)).toBe(false);
  });

  it('is locked once the cycle moves past UPCOMING, whatever the clock says', () => {
    const wayEarly = new Date('2026-01-01T00:00:00Z');
    for (const status of ['LOCKED', 'LIVE', 'SCORED'] as const) {
      // Results are already being recorded against it; no per-league offset
      // should be able to reopen it.
      expect(isCycleLocked(cycle({ status }), 1440, wayEarly)).toBe(true);
    }
  });

  it('stays open early for an UPCOMING cycle', () => {
    expect(isCycleLocked(cycle(), null, new Date('2026-01-01T00:00:00Z'))).toBe(false);
  });
});
