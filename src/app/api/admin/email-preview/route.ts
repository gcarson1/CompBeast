import type { NotificationType } from '@prisma/client';
import { requirePlatformAdmin } from '@/lib/auth';
import { emailFrom, isEmailConfigured } from '@/lib/email/send';
import { appBaseUrl } from '@/lib/site';
import { EMAIL_STYLES, renderNotificationEmail } from '@/lib/email/templates';

export const dynamic = 'force-dynamic';

/**
 * Renders the email templates in a browser, so they can be looked at.
 *
 * Email is the one part of an app you cannot see by using it: the only way to
 * find out that a headline wraps badly or a button lost its colour is to
 * receive one. This route closes that loop — every type, with representative
 * copy, on the page.
 *
 * `?type=LEAGUE_DRAFT_PICK_DUE` shows one on its own, which is the version to
 * open when checking a single template properly. With no parameter it stacks
 * them all in iframes for a sweep.
 *
 * Admin-only. It is only ever sample copy, but an unauthenticated route that
 * renders arbitrary-looking branded mail is a phishing kit.
 */

const SAMPLES: Record<NotificationType, { title: string; body: string; href: string }> = {
  LEAGUE_DRAFT_PICK_DUE: {
    title: "You're on the clock in Sunday Night Crew",
    body: 'Round 2, pick 9 of 40. Everyone else is waiting on you.',
    href: '/leagues/demo/draft',
  },
  LEAGUE_DRAFT_STARTED: {
    title: 'The Sunday Night Crew draft has started',
    body: 'Get in before your pick comes around.',
    href: '/leagues/demo/draft',
  },
  LEAGUE_DRAFT_COMPLETED: {
    title: 'The Sunday Night Crew draft is done',
    body: 'Rosters are set. Scores start moving with the next episode.',
    href: '/leagues/demo',
  },
  LEAGUE_INVITE: {
    title: 'Dana invited you to Sunday Night Crew',
    body: 'Survivor 51 · 6 of 10 seats taken · invite code SUND-4K2P',
    href: '/leagues/join?code=SUND-4K2P',
  },
  LEAGUE_MEMBER_JOINED: {
    title: 'Marco joined Sunday Night Crew',
    body: 'Torch Snuffers took a seat.',
    href: '/leagues/demo',
  },
  LEAGUE_UPDATED: {
    title: 'Sunday Night Crew settings changed',
    body: 'Rosters now lock 60 minutes before the episode airs, instead of 30.',
    href: '/leagues/demo',
  },
  LEAGUE_DELETED: {
    title: 'Sunday Night Crew was deleted',
    body: 'Dana closed the league. Your season history is still on your account.',
    href: '/account',
  },
  FRIEND_REQUEST: {
    title: 'Priya wants to be friends',
    body: 'Accept and you can pull each other into leagues in one tap.',
    href: '/account',
  },
  FRIEND_ACCEPTED: {
    title: 'Priya accepted your friend request',
    body: 'You can now invite each other to leagues.',
    href: '/account',
  },
};

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
  } catch {
    return new Response('Forbidden', { status: 403 });
  }

  const requested = new URL(request.url).searchParams.get('type');
  const baseUrl = appBaseUrl();

  if (requested && requested in SAMPLES) {
    const type = requested as NotificationType;
    const { html } = renderNotificationEmail({
      type,
      ...SAMPLES[type],
      baseUrl,
      emailToken: 'preview-token',
    });
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  return new Response(index(baseUrl), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function index(baseUrl: string): string {
  const types = Object.keys(SAMPLES) as NotificationType[];
  const status = isEmailConfigured()
    ? `Sending as <code>${escape(emailFrom())}</code>.`
    : 'No provider configured — <code>RESEND_API_KEY</code> is unset, so nothing is being sent.';

  const frames = types
    .map(
      (type) => `<section>
        <h2>${escape(type)} <small>${escape(EMAIL_STYLES[type].eyebrow)}</small></h2>
        <iframe src="${baseUrl}/api/admin/email-preview?type=${type}" title="${escape(type)}"></iframe>
      </section>`,
    )
    .join('\n');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Email templates</title>
<style>
  body{margin:0;padding:24px;background:#0F172A;color:#F8FAFC;
       font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}
  h1{font-size:20px;margin:0 0 4px;}
  p.status{color:#94A3B8;margin:0 0 24px;}
  code{color:#FBBF24;}
  section{margin-bottom:28px;}
  h2{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#94A3B8;margin:0 0 8px;}
  h2 small{color:#475569;text-transform:none;letter-spacing:0;margin-left:8px;}
  iframe{width:100%;max-width:660px;height:560px;border:1px solid #2A3A52;border-radius:10px;background:#0F172A;}
</style></head><body>
<h1>Email templates</h1>
<p class="status">${status}</p>
${frames}
</body></html>`;
}

function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
