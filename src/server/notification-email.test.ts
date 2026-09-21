import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { getEmailPreferences, setEmailPreference, unsubscribeByToken } from './notification-email';

/**
 * Email preferences, end to end against a database.
 *
 * The rendering is unit tested next to the templates; what needs a database is
 * the part that decides *whether to send at all* — and getting that wrong is
 * the one bug in this feature that cannot be walked back, because the mail has
 * already arrived in somebody's inbox after they asked it to stop.
 *
 * Skips itself when no database is reachable, like the other integration files.
 */
const prisma = new PrismaClient();

let dbReady = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbReady = true;
} catch {
  dbReady = false;
}

const stamp = `mail-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const userIds: string[] = [];

async function makeUser(tag: string): Promise<string> {
  const user = await prisma.user.create({
    data: { authId: `${stamp}-${tag}`, email: `${stamp}-${tag}@example.invalid`, name: tag },
    select: { id: true },
  });
  userIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe.skipIf(!dbReady)('email preferences', () => {
  it('starts with everything on', async () => {
    // A notification type added next year has to arrive by default, which is
    // why the stored column is the *opt-out* set rather than the opt-in one.
    const preferences = await getEmailPreferences(await makeUser('fresh'));
    expect(preferences.enabled).toBe(true);
    expect(Object.values(preferences.categories).every(Boolean)).toBe(true);
  });

  it('turns one category off without touching the others', async () => {
    const userId = await makeUser('one-off');
    await setEmailPreference(userId, 'draft', false);

    const preferences = await getEmailPreferences(userId);
    expect(preferences.categories.draft).toBe(false);
    expect(preferences.categories.league).toBe(true);
    expect(preferences.categories.friends).toBe(true);
    // The master switch is a separate decision from any one category.
    expect(preferences.enabled).toBe(true);

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { emailOptOut: true },
    });
    expect(new Set(stored.emailOptOut)).toEqual(
      new Set(['LEAGUE_DRAFT_STARTED', 'LEAGUE_DRAFT_PICK_DUE', 'LEAGUE_DRAFT_COMPLETED']),
    );
  });

  it('round-trips a category back on', async () => {
    const userId = await makeUser('round-trip');
    await setEmailPreference(userId, 'friends', false);
    await setEmailPreference(userId, 'friends', true);

    const preferences = await getEmailPreferences(userId);
    expect(preferences.categories.friends).toBe(true);
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { emailOptOut: true },
    });
    expect(stored.emailOptOut).toEqual([]);
  });

  it('re-arms the master switch when a category is turned back on', async () => {
    // Otherwise the switch moves, saves, and still nothing arrives — which
    // reads as a broken control rather than as a second switch being off.
    const userId = await makeUser('re-arm');
    await setEmailPreference(userId, 'all', false);
    await setEmailPreference(userId, 'league', true);

    expect((await getEmailPreferences(userId)).enabled).toBe(true);
  });
});

describe.skipIf(!dbReady)('the unsubscribe link', () => {
  async function tokenFor(tag: string) {
    const userId = await makeUser(tag);
    const token = `${stamp}-${tag}-token`;
    await prisma.user.update({ where: { id: userId }, data: { emailToken: token } });
    return { userId, token };
  }

  it('stops one category when the link names one', async () => {
    const { userId, token } = await tokenFor('cat');

    const result = await unsubscribeByToken(token, 'draft');
    expect(result.ok).toBe(true);

    const preferences = await getEmailPreferences(userId);
    expect(preferences.categories.draft).toBe(false);
    // Unsubscribing from draft alerts is not consent to lose everything else.
    expect(preferences.enabled).toBe(true);
    expect(preferences.categories.league).toBe(true);
  });

  it('stops everything when the link names no category', async () => {
    const { userId, token } = await tokenFor('all');

    expect((await unsubscribeByToken(token, null)).ok).toBe(true);
    expect((await getEmailPreferences(userId)).enabled).toBe(false);
  });

  it('ignores an unknown category rather than doing nothing', async () => {
    // A mangled link should still stop the mail — the person clicked it for a
    // reason, and the safe reading of an ambiguous opt-out is the broad one.
    const { userId, token } = await tokenFor('junk');

    expect((await unsubscribeByToken(token, 'not-a-category')).ok).toBe(true);
    expect((await getEmailPreferences(userId)).enabled).toBe(false);
  });

  it('reports failure for a token nobody owns', async () => {
    expect((await unsubscribeByToken(`${stamp}-nobody`, 'draft')).ok).toBe(false);
  });
});
