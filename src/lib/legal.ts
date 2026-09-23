import { SITE_NAME } from './seo';

/**
 * Who operates the site, for the footer and the legal pages.
 *
 * Read from the environment rather than written into the code: the legal
 * entity, its address and its contact address are facts about whoever
 * deploys this, and the code must not claim them on anyone's behalf. Until
 * they are set, the pages name the site and point at the public repository,
 * which is a real channel — never a placeholder that reads as a contact.
 *
 *   LEGAL_OPERATOR_NAME   the person or company that runs the site
 *   LEGAL_CONTACT_EMAIL   where privacy and legal requests should go
 *   LEGAL_POSTAL_ADDRESS  a postal address, where the operator's law needs one
 *   LEGAL_GOVERNING_LAW   e.g. "the State of Texas, United States"
 */
export interface Operator {
  name: string;
  email: string | null;
  postalAddress: string | null;
  governingLaw: string | null;
  /** The public issue tracker — always available, so a contact route always exists. */
  repositoryUrl: string;
}

const REPOSITORY_URL = 'https://github.com/gcarson1/CompBeast';

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function operator(): Operator {
  return {
    name: env('LEGAL_OPERATOR_NAME') ?? SITE_NAME,
    email: env('LEGAL_CONTACT_EMAIL'),
    postalAddress: env('LEGAL_POSTAL_ADDRESS'),
    governingLaw: env('LEGAL_GOVERNING_LAW'),
    repositoryUrl: REPOSITORY_URL,
  };
}

/** The date the legal texts were last changed. Bump it when they change. */
export const LEGAL_UPDATED = '2026-09-21';

/**
 * The shows are other people's trademarks. Said once here so every page that
 * names them can carry the same disclaimer word for word.
 */
export const AFFILIATION_DISCLAIMER =
  'Comp Beast is an independent fan project. It is not affiliated with, endorsed by or sponsored by CBS, Paramount, NBCUniversal, Peacock, or the producers of Big Brother, Survivor or The Traitors. Show names are trademarks of their respective owners.';

/** Every third party that handles data on the site's behalf, for the privacy policy. */
export const PROCESSORS = [
  {
    name: 'Clerk',
    role: 'Sign-in and account management. Holds your login credentials and profile; sets the session cookies that keep you signed in.',
    url: 'https://clerk.com/legal/privacy',
  },
  {
    name: 'Vercel',
    role: 'Hosting, and the cookieless Web Analytics and Speed Insights that report page views and performance without identifying you.',
    url: 'https://vercel.com/legal/privacy-policy',
  },
  {
    name: 'Resend',
    role: 'Sends the notification emails you have not turned off.',
    url: 'https://resend.com/legal/privacy-policy',
  },
  {
    name: 'Sentry',
    role: 'Error reporting, when the operator has it switched on. Configured to send no personal information with a report.',
    url: 'https://sentry.io/privacy/',
  },
] as const;
