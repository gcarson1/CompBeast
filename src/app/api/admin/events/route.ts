import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireUser } from '@/lib/auth';
import { DomainError, recordEvents, recordEventsSchema, voidEvent } from '@/server/mutations';

export const dynamic = 'force-dynamic';

/** Batch-insert ledger rows as an episode airs. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
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
    const user = await requireUser();
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
  console.error(error);
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}
