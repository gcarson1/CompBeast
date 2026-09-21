import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isPushConfigured } from '@/server/notification-push';

export const dynamic = 'force-dynamic';

/** The shape `PushSubscription.toJSON()` produces in every browser. */
const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(200),
  }),
});

/**
 * Registers this browser's push subscription for the signed-in member. The
 * endpoint is the identity: the same browser re-subscribing (a new key pair
 * after a browser update, say) updates its row rather than adding one, and a
 * browser that changes hands between accounts moves with the account that
 * subscribed last.
 */
export async function POST(request: Request) {
  if (!isPushConfigured()) {
    return NextResponse.json({ error: 'Push notifications are not configured.' }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Malformed subscription.' }, { status: 400 });

  const { endpoint, keys } = parsed.data;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userId: user.id,
    },
    update: { p256dh: keys.p256dh, auth: keys.auth, userId: user.id, lastSeenAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

/** Forgets this browser. Only the subscription's own account may remove it. */
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : null;
  if (!endpoint) return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });

  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return NextResponse.json({ ok: true });
}
