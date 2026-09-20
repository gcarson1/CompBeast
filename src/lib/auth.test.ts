import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The re-key path in `getCurrentUser` is the one place the app decides that a
 * fresh Clerk identity *is* an existing member. Getting it wrong either
 * strands every account across an auth-instance switch or hands someone
 * else's leagues to whoever types their email, so it is pinned here with
 * Clerk and Prisma both stubbed — no database, no keys.
 */

const clerk = vi.hoisted(() => ({ currentUser: vi.fn() }));
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
}));

vi.mock('@clerk/nextjs/server', () => ({ currentUser: clerk.currentUser }));
vi.mock('./db', () => ({ prisma: db }));

import { getCurrentUser } from './auth';

const ROW = {
  id: 'usr_row',
  name: 'Gabe',
  email: 'gabe@example.com',
  handle: 'gabe',
  avatarUrl: null,
  isPlatformAdmin: false,
};

/** A Clerk user as `currentUser()` returns it, trimmed to what auth.ts reads. */
const clerkUser = (overrides: { id?: string; status?: string | null } = {}) => ({
  id: overrides.id ?? 'user_new',
  firstName: 'Gabe',
  lastName: null,
  username: 'gabe',
  imageUrl: '',
  primaryEmailAddressId: 'idn_1',
  emailAddresses: [
    {
      id: 'idn_1',
      emailAddress: ROW.email,
      verification: overrides.status === null ? null : { status: overrides.status ?? 'verified' },
    },
  ],
});

/** Prisma's `findUnique` answers by whichever unique key was asked for. */
const seedRow = (row: typeof ROW | null, authId: string) => {
  db.user.findUnique.mockImplementation(async ({ where }: { where: { authId?: string; email?: string } }) => {
    if (where.authId !== undefined) return row && where.authId === authId ? row : null;
    if (where.email !== undefined) return row && where.email === row.email ? { id: row.id } : null;
    return null;
  });
};

beforeEach(() => {
  vi.resetAllMocks();
  db.user.update.mockImplementation(async ({ data }) => ({ ...ROW, ...data }));
  db.user.create.mockImplementation(async ({ data }) => ({ ...ROW, ...data, id: 'usr_created' }));
});

describe('getCurrentUser', () => {
  it('returns the row when the Clerk id still matches, without touching it', async () => {
    clerk.currentUser.mockResolvedValue(clerkUser({ id: 'user_old' }));
    seedRow(ROW, 'user_old');

    await expect(getCurrentUser()).resolves.toEqual(ROW);
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('adopts the existing row by verified email when the Clerk id is new', async () => {
    clerk.currentUser.mockResolvedValue(clerkUser({ id: 'user_new' }));
    seedRow(ROW, 'user_old');

    const user = await getCurrentUser();

    expect(user?.id).toBe(ROW.id);
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ROW.id }, data: { authId: 'user_new' } }),
    );
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it.each([
    ['unverified', 'unverified'],
    ['no verification record', null],
  ])('never adopts on a %s email', async (_label, status) => {
    clerk.currentUser.mockResolvedValue(clerkUser({ id: 'user_new', status }));
    seedRow(ROW, 'user_old');
    // With the row still holding the email, the real `create` would throw on
    // the unique index. That is the intended outcome; here we only assert
    // that nothing was handed over.
    db.user.create.mockRejectedValue(new Error('P2002'));

    await expect(getCurrentUser()).rejects.toThrow('P2002');
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.user.findUnique).not.toHaveBeenCalledWith(expect.objectContaining({ where: { email: ROW.email } }));
  });

  it('provisions a row for a genuinely new member', async () => {
    clerk.currentUser.mockResolvedValue(clerkUser({ id: 'user_new' }));
    seedRow(null, '');

    const user = await getCurrentUser();

    expect(user?.id).toBe('usr_created');
    expect(db.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ authId: 'user_new', email: ROW.email }) }),
    );
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('is signed out when Clerk has no session', async () => {
    clerk.currentUser.mockResolvedValue(null);
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});
