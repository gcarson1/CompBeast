import Link from 'next/link';
import { JoinLeagueForm } from '@/components/LeagueForms';

export default function JoinLeaguePage() {
  return (
    <div className="pt-2">
      <Link href="/leagues" className="text-xs text-muted">
        ← Leagues
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Join a league</h1>
      <p className="mb-5 mt-0.5 text-xs text-muted">
        Ask the commissioner for the invite code.
      </p>
      <JoinLeagueForm />
    </div>
  );
}
