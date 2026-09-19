import Link from 'next/link';
import { JoinLeagueForm } from '@/components/LeagueForms';

/**
 * `?code=` is what the QR code on a league page encodes, so scanning it lands
 * here with the invite already filled in and only a team name left to type.
 * It is still an ordinary, editable field — the parameter is a convenience,
 * not a separate flow.
 */
export default function JoinLeaguePage({
  searchParams,
}: {
  searchParams: { code?: string | string[] };
}) {
  const raw = Array.isArray(searchParams.code) ? searchParams.code[0] : searchParams.code;
  const code = raw?.trim().toUpperCase().slice(0, 40) ?? '';

  return (
    <div className="pt-2">
      <Link href="/leagues" className="text-xs text-muted">
        ← Leagues
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Join a league</h1>
      <p className="mb-5 mt-0.5 text-xs text-muted">
        {code
          ? 'Invite code filled in from your link — just name your team.'
          : 'Ask the commissioner for the invite code, or scan their QR code.'}
      </p>
      <JoinLeagueForm defaultCode={code} />
    </div>
  );
}
