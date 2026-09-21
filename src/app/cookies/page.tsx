import type { Metadata } from 'next';
import { LegalDocument, LegalLink } from '@/components/LegalDocument';
import { SITE_NAME, absoluteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Cookie policy',
  description: `The cookies ${SITE_NAME} sets — only the ones that keep you signed in — and why there is no cookie banner.`,
  alternates: { canonical: absoluteUrl('/cookies') },
};

export default function CookiesPage() {
  return (
    <LegalDocument
      title="Cookie policy"
      path="/cookies"
      intro={
        <p>
          {SITE_NAME} sets cookies for one purpose: keeping you signed in. It sets none for advertising, none
          for tracking you across sites, and none for analytics. This page lists exactly what is stored in
          your browser and why.
        </p>
      }
      sections={[
        {
          id: 'what-cookies-are',
          title: 'What a cookie is',
          body: (
            <p>
              A cookie is a small piece of text a website asks your browser to keep and send back on later
              visits. Sites use them to remember who you are between pages, and — elsewhere on the web — to
              track what you do. Similar storage your browser offers, such as local storage, is covered here
              too.
            </p>
          ),
        },
        {
          id: 'strictly-necessary',
          title: 'Strictly necessary: staying signed in',
          body: (
            <>
              <p>
                Sign-in is handled by Clerk. Once you sign in, Clerk sets session cookies (their names begin
                with <code>__session</code> and <code>__client_uat</code>, plus{' '}
                <code>clerk_active_context</code>) so that each page you open knows it is you. Without them
                you would have to sign in on every page. They are marked secure, are only sent to this site,
                and expire when your session does — sign out and they are removed. Clerk may set a small
                number of further cookies for its own security checks; all of them serve sign-in and nothing
                else.
              </p>
              <p>
                Cookies that are strictly necessary for a service you asked for do not need your consent under
                the laws that govern cookies, and there is no way to use {SITE_NAME} without signing in, so
                there is no switch to turn these off. You can clear them at any time by signing out or by
                clearing your browser&apos;s cookies for this site.
              </p>
            </>
          ),
        },
        {
          id: 'not-cookies',
          title: 'Things stored that are not cookies',
          body: (
            <ul>
              <li>
                <strong>Push notifications.</strong> If you turn on push for a browser, that browser registers
                a small service worker and keeps a push subscription. Both are yours to remove: turn push off
                on your account page, or remove the site&apos;s permission in your browser settings.
              </li>
              <li>
                <strong>Sign-in state.</strong> Clerk may keep some sign-in state in your browser&apos;s local
                storage alongside its cookies, for the same purpose and with the same lifetime.
              </li>
            </ul>
          ),
        },
        {
          id: 'analytics',
          title: 'Analytics without cookies',
          body: (
            <p>
              We count page views and measure page speed with Vercel Web Analytics and Vercel Speed Insights.
              Neither sets a cookie, stores anything in your browser, or assigns you an identifier that
              persists beyond the day; they cannot recognise you on a return visit or on another site. That is
              why they appear on this page as a reassurance rather than as something to opt out of. If error
              reporting is switched on, Sentry likewise sets no cookie.
            </p>
          ),
        },
        {
          id: 'no-banner',
          title: 'Why there is no cookie banner',
          body: (
            <p>
              A banner exists to ask permission for cookies that are not needed to run the site — advertising,
              cross-site tracking, cookie-based analytics. {SITE_NAME} has none of those, so there is nothing
              to ask permission for, and a banner would only be in the way. If that ever changes, a consent
              prompt will be added before any such cookie is set, and this page will say so.
            </p>
          ),
        },
        {
          id: 'control',
          title: 'Controlling cookies',
          body: (
            <p>
              Every browser lets you see, block and delete cookies per site; look for &quot;cookies&quot; or
              &quot;site data&quot; in its settings. Blocking the session cookies will sign you out and stop
              you signing back in. For anything else, see the{' '}
              <LegalLink href="/privacy">privacy policy</LegalLink>.
            </p>
          ),
        },
      ]}
    />
  );
}
