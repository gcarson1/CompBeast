import type { Metadata } from 'next';
import { LegalDocument, LegalLink } from '@/components/LegalDocument';
import { PROCESSORS, operator } from '@/lib/legal';
import { SITE_NAME, absoluteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: `What ${SITE_NAME} collects, why, who handles it, how long it is kept, and how to delete it.`,
  alternates: { canonical: absoluteUrl('/privacy') },
};

/**
 * Written from the code, not from a template: every data item named here is
 * a column in prisma/schema.prisma or a call in src/lib, and every third party
 * is a dependency in package.json. If either changes, this page has to.
 */
export default function PrivacyPage() {
  const who = operator();

  return (
    <LegalDocument
      title="Privacy policy"
      path="/privacy"
      intro={
        <p>
          This policy explains what {SITE_NAME} collects when you use it, why, who else handles it, how long
          it is kept, and what you can do about it. It is written to be read, not skimmed past: there is no
          advertising here, nothing is sold, and everything below is something the app actually does.
        </p>
      }
      sections={[
        {
          id: 'what-we-collect',
          title: 'What we collect',
          body: (
            <>
              <p>
                <strong>Your account.</strong> When you sign in, our sign-in provider (Clerk) gives us your
                email address, the name on your profile, your avatar image and your username if you set one.
                That is what appears beside your team in a league.
              </p>
              <p>
                <strong>What you do in the app.</strong> The leagues you create or join, the name you give
                your team, your draft picks, the messages and reactions you post in a league&apos;s chat, and
                the friend requests you send and receive.
              </p>
              <p>
                <strong>Notifications.</strong> A record of each alert the app sends you (a friend request, a
                draft turn, a league change), when you read it, and whether it also went out by email. Your
                email preferences, and a private token that makes the unsubscribe link in each email work.
              </p>
              <p>
                <strong>Push notifications, if you turn them on.</strong> When you switch on push for a
                browser, that browser hands us a delivery address and two keys. We store those so we can send
                the alert; they identify a browser, not a person, and are removed when the browser
                unsubscribes.
              </p>
              <p>
                <strong>A chat webhook, if a commissioner adds one.</strong> A commissioner can paste a
                Discord or Slack webhook URL so their league&apos;s standings post to a channel they already
                use. We store the URL and send only draft and standings updates to it.
              </p>
              <p>
                <strong>Server logs and diagnostics.</strong> Like every website, our host records the
                requests it serves, including IP addresses, for security and to keep the site running. Page
                views and performance are measured without cookies or identifiers (see below). If error
                reporting is switched on, a crash sends the error and the page it happened on — configured to
                send no personal information.
              </p>
              <p>
                We do not collect your date of birth, phone number, location, payment details (there is
                nothing to pay for), contacts, or anything from your device beyond what is listed here.
              </p>
            </>
          ),
        },
        {
          id: 'why',
          title: 'Why we use it, and on what basis',
          body: (
            <>
              <ul>
                <li>
                  <strong>To run your leagues</strong> — showing your team, scoring your picks, ranking the
                  leaderboard, and telling you when it is your turn. This is the service you signed up for
                  (performance of a contract).
                </li>
                <li>
                  <strong>To send the alerts you have not turned off</strong> — in the app, by email, and by
                  push where you enabled it. Email and push are each controlled from your account page; push
                  is only ever enabled by you, in the browser&apos;s own permission prompt (consent).
                </li>
                <li>
                  <strong>To keep the site secure and working</strong> — logs, error reports and aggregate
                  performance measurement (legitimate interest).
                </li>
              </ul>
              <p>
                We do not use your data for advertising, do not sell it, do not build profiles of you, and do
                not make automated decisions about you.
              </p>
            </>
          ),
        },
        {
          id: 'public',
          title: 'What other people can see',
          body: (
            <>
              <p>
                <strong>Inside a league</strong>, its members can see your display name, username, avatar,
                team name, roster, points and the messages you post there.
              </p>
              <p>
                <strong>If a commissioner makes a league public</strong>, anyone with the link can see the
                league page — its name, standings, team names, and the display names and avatars of its
                members. Leagues are private by default; the setting is the commissioner&apos;s, and it is
                labelled on the league settings page.
              </p>
              <p>
                <strong>A join link</strong> shows the league&apos;s name, season, seat count and the
                commissioner&apos;s display name to whoever holds the invite code, so they know what they are
                joining.
              </p>
              <p>
                Season and player pages are about the television cast, not about you. Your account page,
                career totals, friends and notifications are visible only to you.
              </p>
            </>
          ),
        },
        {
          id: 'third-parties',
          title: 'Who else handles it',
          body: (
            <>
              <p>
                These companies process data on our behalf, under their own agreements with us. Each is based
                in the United States and may store data there.
              </p>
              <ul>
                {PROCESSORS.map((p) => (
                  <li key={p.name}>
                    <strong>{p.name}</strong> — {p.role}{' '}
                    <LegalLink href={p.url}>Their privacy policy.</LegalLink>
                  </li>
                ))}
                <li>
                  <strong>Discord or Slack</strong> — only if a commissioner connects a webhook. What we send
                  is the league&apos;s draft and standings; what they do with it is governed by their terms.
                </li>
              </ul>
              <p>
                Season results and cast photos come from public fan sites and news feeds, fetched by our
                server. Your browser does not contact those sites when you use {SITE_NAME}; cast photos are
                served through our own image resizer.
              </p>
              <p>
                We do not share your data with anyone else, except where the law requires it or to protect the
                site and its users from abuse.
              </p>
            </>
          ),
        },
        {
          id: 'cookies',
          title: 'Cookies and analytics',
          body: (
            <p>
              The only cookies set are the ones that keep you signed in. Page views and performance are
              measured by Vercel&apos;s cookieless analytics, which does not identify you or follow you to
              other sites. There is no advertising and no tracking, which is why there is no cookie banner.
              The full list is in the <LegalLink href="/cookies">cookie policy</LegalLink>.
            </p>
          ),
        },
        {
          id: 'retention',
          title: 'How long we keep it',
          body: (
            <>
              <ul>
                <li>
                  <strong>Your account and everything in it</strong> — until you delete your account (below).
                </li>
                <li>
                  <strong>A league</strong> — until its commissioner deletes it. When that happens, each
                  manager&apos;s final points and rank are kept on their own account as a career record,
                  because the points a person scored are theirs; the league itself, its rosters and its chat
                  are removed.
                </li>
                <li>
                  <strong>Messages you delete</strong> — hidden from the feed at once and removed with your
                  account.
                </li>
                <li>
                  <strong>Push subscriptions</strong> — until the browser unsubscribes, you turn push off, or
                  the push service tells us the browser is gone.
                </li>
                <li>
                  <strong>Host logs and error reports</strong> — for the periods our providers keep them,
                  typically weeks to a few months.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'your-rights',
          title: 'Your rights',
          body: (
            <>
              <p>
                Wherever you live, you can ask to see the data we hold about you, correct it, have it deleted,
                or receive a copy of it. In the European Economic Area, the United Kingdom and some other
                places these are legal rights, and you can also object to processing based on legitimate
                interest and complain to your data protection authority.
              </p>
              <ul>
                <li>
                  <strong>Correct your profile</strong> — name, avatar, username and email are edited through
                  the account menu in the header, which opens your sign-in provider&apos;s profile.
                </li>
                <li>
                  <strong>Control notifications</strong> — email categories and push are switched on your{' '}
                  <LegalLink href="/account">account page</LegalLink>; every email also carries a one-click
                  unsubscribe link.
                </li>
                <li>
                  <strong>Delete your account and data</strong> — from the bottom of your{' '}
                  <LegalLink href="/account">account page</LegalLink>, in the app, at any time. It takes
                  effect immediately; see the next section for exactly what happens.
                </li>
                <li>
                  <strong>Anything else</strong> — contact us using the details at the foot of this page. We
                  answer within 30 days.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'deletion',
          title: 'What deleting your account does',
          body: (
            <>
              <p>When you delete your account:</p>
              <ul>
                <li>
                  Your sign-in is deleted at our provider, so you can no longer sign in and no one can sign in
                  as you.
                </li>
                <li>
                  Your email, name, username, avatar, email preferences, unsubscribe token, push
                  subscriptions, friendships, notifications and career records are erased.
                </li>
                <li>Every message you posted in a league chat is removed.</li>
                <li>
                  In leagues whose draft has not started, your team and seat are removed. In leagues already
                  drafted or in play, your team stays on the board — the other managers&apos; standings depend
                  on it — but it is no longer linked to you and shows no name.
                </li>
                <li>
                  In leagues you commissioned, the role passes to the longest-standing other member. A league
                  with no other members is deleted.
                </li>
                <li>
                  The scoring ledger&apos;s audit trail keeps a record that a change was made, but nothing
                  that identifies you.
                </li>
              </ul>
              <p>Deletion cannot be undone. Our providers remove their copies on their own schedules.</p>
            </>
          ),
        },
        {
          id: 'children',
          title: 'Children',
          body: (
            <p>
              {SITE_NAME} is not for children under 13, and we do not knowingly collect anything from them. If
              you are under 16 and live in the European Economic Area or the United Kingdom, you may use{' '}
              {SITE_NAME} only with a parent or guardian&apos;s permission. If you believe a child has an
              account, contact us and we will delete it.
            </p>
          ),
        },
        {
          id: 'security',
          title: 'Security',
          body: (
            <p>
              Sign-in and password handling are done by Clerk, which stores passwords hashed; we never see
              them. Everything travels over HTTPS. Unsubscribe links and invite codes are random tokens that
              grant only the one thing they are for. No system is perfectly secure; if we learn of a breach
              affecting you, we will tell you.
            </p>
          ),
        },
        {
          id: 'changes',
          title: 'Changes to this policy',
          body: (
            <p>
              If we change what we collect or how we use it, this page changes and the date at the top moves.
              For a change that reduces your rights, we will tell you in the app before it takes effect.
            </p>
          ),
        },
        {
          id: 'contact',
          title: 'Contact',
          body: (
            <p>
              {who.email ? (
                <>
                  Write to <LegalLink href={`mailto:${who.email}`}>{who.email}</LegalLink>.
                </>
              ) : (
                <>
                  Open an issue at{' '}
                  <LegalLink href={`${who.repositoryUrl}/issues`}>
                    the project&apos;s public repository
                  </LegalLink>{' '}
                  — for anything you would rather not post publicly, say so in the issue and we will move it
                  to a private channel.
                </>
              )}{' '}
              The operator&apos;s details are at the foot of this page.
            </p>
          ),
        },
      ]}
    />
  );
}
