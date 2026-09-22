import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { SignUp } from '@clerk/nextjs';
import { JoinLeagueForm } from '@/components/LeagueForms';
import { Tag } from '@/components/Tag';
import { getCurrentUser } from '@/lib/auth';
import { absoluteUrl } from '@/lib/seo';
import { lower } from '@/lib/shows/lexicon';
import { getLeagueInvite, type LeagueInvite } from '@/server/queries';

export const dynamic = 'force-dynamic';

type Params = { searchParams: { code?: string | string[] } };

function readCode(searchParams: Params['searchParams']): string {
  const raw = Array.isArray(searchParams.code) ? searchParams.code[0] : searchParams.code;
  return raw?.trim().toUpperCase().slice(0, 40) ?? '';
}

// One lookup for the metadata and the page.
const loadInvite = cache((code: string) => (code ? getLeagueInvite(code) : Promise.resolve(null)));

/**
 * The link preview for a shared invite. When someone pastes the join link
 * into a chat, this is what the card says and shows — the league's name and
 * season on the Comp Beast card, drawn by /api/og/join. Never indexed: an
 * invite is for the people it was sent to.
 */
export async function generateMetadata({ searchParams }: Params): Promise<Metadata> {
  const code = readCode(searchParams);
  const invite = await loadInvite(code);
  if (!invite) {
    return { title: 'Join a league', robots: { index: false, follow: false } };
  }
  const title = `Join ${invite.name} on Comp Beast`;
  const description = `${invite.commissionerName ? `${invite.commissionerName} invited you to ` : 'You are invited to '}${invite.name} — a fantasy ${invite.showName} league for ${invite.seasonName}. ${invite.teamCount} of ${invite.maxTeams} seats are taken.`;
  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: absoluteUrl(`/leagues/join?code=${encodeURIComponent(code)}`),
      images: [
        { url: absoluteUrl(`/api/og/join?code=${encodeURIComponent(code)}`), width: 1200, height: 630 },
      ],
    },
  };
}

/**
 * `?code=` is what the QR code on a league page encodes, so scanning it lands
 * here with the invite already filled in and only a team name left to type.
 * It is still an ordinary, editable field — the parameter is a convenience,
 * not a separate flow.
 *
 * The page is public on purpose (see middleware.ts). A new member arriving
 * from a QR code sees *what they were invited to* first, and creates their
 * account right here, under it — Google or Apple in one tap where the
 * dashboard has them switched on, or an email address — and is returned to
 * this same URL signed in, code intact, to name their team. Nobody is sent
 * to another domain and back.
 */
export default async function JoinLeaguePage({ searchParams }: Params) {
  const code = readCode(searchParams);
  const [user, invite] = await Promise.all([getCurrentUser(), loadInvite(code)]);
  const here = code ? `/leagues/join?code=${encodeURIComponent(code)}` : '/leagues/join';

  return (
    <div className="stage pt-2">
      <Link href="/leagues" className="text-xs text-muted">
        ← Leagues
      </Link>

      {invite ? (
        <InviteCard invite={invite} />
      ) : (
        <>
          <h1 className="headline mt-3 text-4xl">Join a league</h1>
          <p className="mt-2 max-w-measure text-xs text-muted">
            {code
              ? 'That code did not match a league. Check it with your commissioner — codes are eight characters.'
              : 'Ask the commissioner for the invite code, or scan their QR code.'}
          </p>
        </>
      )}

      {user ? (
        <div className="mt-5">
          {invite && invite.draftStatus !== 'NOT_STARTED' && (
            <p className="mb-4 rounded-card border border-hairline bg-surface/60 p-3 text-2xs leading-relaxed text-muted">
              This league has already started its draft, so it is not taking new teams. Ask the commissioner
              about the next season.
            </p>
          )}
          <JoinLeagueForm defaultCode={code} />
        </div>
      ) : (
        <section className="mt-6" aria-labelledby="join-signup">
          <h2 id="join-signup" className="section-title">
            {invite ? 'Create your free account to join' : 'Sign in to join a league'}
          </h2>
          <p className="mb-4 mt-2 max-w-measure text-2xs leading-relaxed text-muted">
            It takes a minute. You&apos;ll come straight back here with the invite filled in.
          </p>
          {/* Hash routing: this is not the dedicated sign-up route, so the
              component keeps its steps (verification, OAuth return) in the
              URL fragment instead of needing sub-paths of this page. */}
          <SignUp
            routing="hash"
            forceRedirectUrl={here}
            signInUrl={`/sign-in?redirect_url=${encodeURIComponent(here)}`}
          />
        </section>
      )}
    </div>
  );
}

function InviteCard({ invite }: { invite: LeagueInvite }) {
  const seatsLeft = Math.max(0, invite.maxTeams - invite.teamCount);
  const state =
    invite.seasonStatus === 'COMPLETED'
      ? 'Season finished'
      : invite.draftStatus === 'COMPLETED'
        ? 'Season under way'
        : invite.draftStatus === 'IN_PROGRESS'
          ? 'Drafting now'
          : seatsLeft === 0
            ? 'Full'
            : `${seatsLeft} ${seatsLeft === 1 ? 'seat' : 'seats'} open`;

  const open = seatsLeft > 0 && invite.draftStatus === 'NOT_STARTED' && invite.seasonStatus !== 'COMPLETED';

  return (
    <header className="mt-3">
      <Tag tone="gold" size="lg">
        {invite.commissionerName ? `${invite.commissionerName} invited you` : "You're invited"}
      </Tag>
      <h1 className="headline mt-4 text-5xl">{invite.name}</h1>
      <p className="mt-3 text-xs text-muted">
        {invite.showName} · {invite.seasonName} · {invite.rosterSize}{' '}
        {lower(invite.showLexicon.contestantPlural)} per team
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Tag tone="ink" size="sm">
          {invite.teamCount} of {invite.maxTeams} seats filled
        </Tag>
        <Tag tone={open ? 'mint' : 'ink'} size="sm">
          {state}
        </Tag>
      </div>
    </header>
  );
}
