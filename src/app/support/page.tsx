import type { Metadata } from 'next';
import { LegalDocument, LegalLink } from '@/components/LegalDocument';
import { operator } from '@/lib/legal';
import { SITE_NAME, absoluteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Help and support',
  description: `How to get help with ${SITE_NAME}: contacting us, reporting and blocking, alerts, and deleting your account.`,
  alternates: { canonical: absoluteUrl('/support') },
};

/**
 * The support page — the App Store listing's Support URL, and the footer's
 * "Help". Written as answers to the questions people actually arrive with,
 * each pointing at the place in the app that resolves it.
 */
export default function SupportPage() {
  const who = operator();
  const contact = who.email ? (
    <>
      email <LegalLink href={`mailto:${who.email}`}>{who.email}</LegalLink>
    </>
  ) : (
    <>
      open an issue at{' '}
      <LegalLink href={`${who.repositoryUrl}/issues`}>the project&apos;s public repository</LegalLink> (say if
      it is private, and we will move it to a private channel)
    </>
  );

  return (
    <LegalDocument
      title="Help and support"
      path="/support"
      intro={
        <p>
          {SITE_NAME} is a free fantasy league app for reality competition TV, on the web at compbeast.app and
          on iPhone. If something is wrong, or you need a hand, start here.
        </p>
      }
      sections={[
        {
          id: 'contact',
          title: 'Contact us',
          body: (
            <p>
              For anything at all — a bug, a scoring question, an account problem, a privacy request —{' '}
              {contact}. We answer within two working days, and reports of abuse within 24 hours.
            </p>
          ),
        },
        {
          id: 'report',
          title: 'Someone is abusing or harassing you',
          body: (
            <>
              <p>
                Tap the <strong>⋯</strong> beside their post in a league feed — or on their team page, or on
                their friend request — and choose <strong>Report</strong> or <strong>Block</strong>.
              </p>
              <ul>
                <li>
                  <strong>Block</strong> works at once: you stop seeing each other&apos;s posts, and neither
                  of you can find, friend or invite the other. They are not told. Undo it from the{' '}
                  <LegalLink href="/account">You tab</LegalLink>, under Blocked people.
                </li>
                <li>
                  <strong>Report</strong> sends the post, as it read at that moment, to our moderators. They
                  act within 24 hours, removing content that breaks the{' '}
                  <LegalLink href="/terms#conduct">rules</LegalLink> and suspending the accounts responsible.
                </li>
              </ul>
              <p>A commissioner can also delete any post in their own league.</p>
            </>
          ),
        },
        {
          id: 'scoring',
          title: 'A score looks wrong',
          body: (
            <p>
              Every point is traceable to the event that produced it: open a team, then a contestant, to see
              their game log. Results are updated from the broadcast after each episode, and corrections are
              applied to every league at once. The full scoring tables are on the{' '}
              <LegalLink href="/rules">rules page</LegalLink>. If something is still off, contact us with the
              league and the episode.
            </p>
          ),
        },
        {
          id: 'alerts',
          title: 'Alerts and notifications',
          body: (
            <>
              <p>
                Every alert appears under the bell in the app. On your{' '}
                <LegalLink href="/account">You tab</LegalLink> you can also choose which go out by email, and
                switch on push alerts for the device you are using.
              </p>
              <p>
                On iPhone, if alerts never arrive, check Settings → Notifications → {SITE_NAME}. If you once
                tapped “Don&apos;t Allow”, that is where to turn them back on — the You tab has a button that
                takes you straight there.
              </p>
            </>
          ),
        },
        {
          id: 'account',
          title: 'Your account',
          body: (
            <>
              <p>
                Change your name, picture, email or password from the account menu (your picture, top right).
                Forgot your password? Choose <strong>Forgot password</strong> on the sign-in screen.
              </p>
              <p>
                <strong>Deleting your account</strong>: at the bottom of the{' '}
                <LegalLink href="/account">You tab</LegalLink>, choose Delete account. It takes effect at once
                and cannot be undone; the <LegalLink href="/privacy#deletion">privacy policy</LegalLink> says
                exactly what is removed.
              </p>
            </>
          ),
        },
        {
          id: 'cost',
          title: 'What it costs',
          body: (
            <p>
              Nothing. There are no purchases, subscriptions, ads or prizes in {SITE_NAME}, on the web or on
              iPhone.
            </p>
          ),
        },
      ]}
    />
  );
}
