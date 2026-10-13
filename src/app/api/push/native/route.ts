import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * An APNs device token as the app reports it: hex. Apple's are 64 characters
 * today and documented as variable, hence the range rather than an exact length.
 */
const tokenSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{64,200}$/, 'Malformed device token.')
    .transform((token) => token.toLowerCase()),
  platform: z.literal('ios').default('ios'),
});

/**
 * Registers this iPhone for the signed-in member. The token is the identity:
 * the same phone registering again refreshes its row, and a phone that
 * changes hands between accounts moves with whoever registered it last —
 * so an alert never reaches the previous owner of a shared device.
 *
 * Accepted whether or not the server can send yet (APNs unconfigured): the
 * phone has opted in, and the alerts start the moment the key is set.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const parsed = tokenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Malformed device token.' }, { status: 400 });

  const { token, platform } = parsed.data;
  await prisma.nativePushToken.upsert({
    where: { token },
    create: { token, platform, userId: user.id },
    update: { userId: user.id, platform, lastSeenAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

/**
 * Forgets this iPhone. Needs no session: it is called on sign-out, when the
 * session is already gone, and knowing the token is the proof of holding the
 * phone — APNs hands it to nobody else.
 */
export async function DELETE(request: Request) {
  const parsed = tokenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Malformed device token.' }, { status: 400 });

  await prisma.nativePushToken.deleteMany({ where: { token: parsed.data.token } });
  return NextResponse.json({ ok: true });
}
