import { renderOgCard } from '@/lib/og/card';
import { getLeagueInvite } from '@/server/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The invite card: what a shared join link looks like in a chat. A route
 * handler rather than an `opengraph-image` file because the file convention
 * only sees path params, and the invite lives in `?code=`. The join page's
 * metadata points here.
 *
 * The code never appears in the picture — it is in the link already, and a
 * screenshot of the card should not be an invitation.
 */
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('code')?.trim().toUpperCase().slice(0, 40) ?? '';
  const invite = code ? await getLeagueInvite(code) : null;

  if (!invite) {
    return renderOgCard({
      eyebrow: 'Comp Beast',
      title: 'Join a league',
      subtitle: 'Free fantasy leagues for Big Brother. Ask your commissioner for the invite code.',
    });
  }

  const seatsLeft = Math.max(0, invite.maxTeams - invite.teamCount);
  return renderOgCard({
    eyebrow: invite.commissionerName ? `${invite.commissionerName} invited you to` : "You're invited to",
    title: invite.name,
    subtitle: `${invite.showName} · ${invite.seasonName} · ${invite.rosterSize} houseguests per team. Tap to create a free account and take a seat.`,
    stats: [
      { value: `${invite.teamCount}/${invite.maxTeams}`, label: 'seats filled' },
      { value: String(seatsLeft), label: seatsLeft === 1 ? 'seat open' : 'seats open' },
    ],
  });
}
