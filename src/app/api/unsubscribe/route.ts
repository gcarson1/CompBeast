import { NextResponse } from 'next/server';
import { unsubscribeByToken } from '@/server/notification-email';

export const dynamic = 'force-dynamic';

/**
 * One-click unsubscribe, the RFC 8058 way.
 *
 * Every email carries `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
 * which is what makes Gmail and Apple Mail render their own unsubscribe
 * control next to the sender. When someone uses it, the mail client POSTs
 * here directly — there is no browser, no session and no confirmation step,
 * so the token in the URL is the whole credential.
 *
 * Deliberately POST-only. The same URL served over GET would be unsubscribing
 * people the moment a scanner or a link preview touched the message, which is
 * exactly why the human-facing route at /unsubscribe asks first.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('t');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const result = await unsubscribeByToken(token, url.searchParams.get('c'));
  // A stale or revoked token still answers 200: a mail client showing an error
  // for "you are already unsubscribed" helps nobody, and distinguishing the
  // two would turn this into an oracle for which tokens are real.
  return NextResponse.json({ ok: result.ok });
}
