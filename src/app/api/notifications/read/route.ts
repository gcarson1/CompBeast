import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { markNotificationRead } from '@/server/notifications';

export const dynamic = 'force-dynamic';

/**
 * Marks one notification read.
 *
 * A route rather than a server action because the call is fired as the page
 * is navigating away — the row is a real anchor, and following it is what
 * marks it read. A server action's POST races that navigation and can be
 * cancelled halfway; `fetch(..., { keepalive: true })` against this route is
 * the thing browsers guarantee will still be delivered.
 *
 * `markNotificationRead` scopes the update by userId, so a forged id is a
 * zero-row no-op rather than a way to read someone else's mail.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  let id = '';
  try {
    const body: { id?: unknown } = await request.json();
    if (typeof body.id === 'string') id = body.id;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  await markNotificationRead(id, user.id);
  return NextResponse.json({ ok: true });
}
