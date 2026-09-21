import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth';
import { DomainError, recordEvents, recordEventsSchema, voidEvent } from '@/server/mutations';

export const dynamic = 'force-dynamic';

/**
 * Batch-insert ledger rows as an episode airs.
 *
 * Platform admin, not merely signed in: a write here rescores every league
 * on the season, which is exactly the reach `requirePlatformAdmin` exists to
 * gate (see src/lib/auth.ts). The route was checking for a session only.
 */
export async function POST(request: Request) {
  try {
    const user = await requirePlatformAdmin();
    const body = await request.json();
    const result = await recordEvents(user.id, recordEventsSchema.parse(body));
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Retroactive correction: void a previously recorded event. */
export async function DELETE(request: Request) {
  try {
    const user = await requirePlatformAdmin();
    const { scoredEventId, reason } = await request.json();
    if (!scoredEventId || !reason) {
      return NextResponse.json({ error: 'scoredEventId and reason are required' }, { status: 400 });
    }
    const result = await voidEvent(user.id, scoredEventId, reason);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

function toErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Invalid payload', issues: error.issues }, { status: 422 });
  }
  if (error instanceof DomainError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  if (error instanceof Error && error.message === 'FORBIDDEN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  console.error(error);
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}
