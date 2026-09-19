import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { searchPeople } from '@/server/social';

export const dynamic = 'force-dynamic';

/**
 * Backs the find-people box.
 *
 * A route rather than a server action because this runs per keystroke
 * (debounced client-side) and has to return a *result set*; an action's
 * `{ ok, error }` shape is the wrong tool for a read.
 *
 * `searchPeople` is where the privacy rule lives: handles and names match on
 * a fragment, emails only in full.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const query = new URL(request.url).searchParams.get('q') ?? '';
  const results = await searchPeople(user.id, query);
  return NextResponse.json({ results });
}
