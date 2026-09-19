import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUnreadNotificationCount } from '@/server/notifications';

export const dynamic = 'force-dynamic';

/**
 * The unread badge's refresh endpoint.
 *
 * Deliberately tiny — one indexed COUNT and a two-field response. The header
 * polls this while a tab is open, so it is the most frequently hit route in
 * the app and has no business fetching the notifications themselves.
 *
 * Signed out returns a zero count rather than a 401: the bell is not rendered
 * for signed-out visitors anyway, and a 401 here would only produce console
 * noise on a session that expired in a background tab.
 */
export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return NextResponse.json({ count: 0, signedIn: false });

  const count = await getUnreadNotificationCount(user.id);
  return NextResponse.json({ count, signedIn: true });
}
