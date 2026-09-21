import type { Metadata } from 'next';
import { LegalDocument, LegalLink } from '@/components/LegalDocument';
import { AFFILIATION_DISCLAIMER, operator } from '@/lib/legal';
import { SITE_NAME, absoluteUrl } from '@/lib/seo';
import { LEAGUE_LIMITS } from '@/lib/validation';

export const metadata: Metadata = {
  title: 'Terms of service',
  description: `The terms for using ${SITE_NAME}: a free fantasy league app for reality competition TV.`,
  alternates: { canonical: absoluteUrl('/terms') },
};

export default function TermsPage() {
  const who = operator();

  return (
    <LegalDocument
      title="Terms of service"
      path="/terms"
      intro={
        <p>
          These are the terms for using {SITE_NAME}
          {who.name !== SITE_NAME ? `, run by ${who.name}` : ''}. They are short because the service is
          simple: a free place to run a fantasy league with friends. By creating an account or using the site
          you agree to them. If you do not, please do not use {SITE_NAME}.
        </p>
      }
      sections={[
        {
          id: 'the-service',
          title: 'The service',
          body: (
            <>
              <p>
                {SITE_NAME} lets a group of people form a league around a season of a reality competition
                show, draft its cast onto teams, and score points from what happens on the broadcast. Scoring
                rules are published on the <LegalLink href="/rules">rules page</LegalLink>; each league picks
                one ruleset before its draft.
              </p>
              <p>
                <strong>It is free.</strong> There is no paid tier, no purchase, no subscription and no prize.
                Because nothing is ever charged, there is nothing to refund. If that ever changes, these terms
                will change first and you will be told before anything is charged.
              </p>
              <p>
                <strong>It is a game between friends.</strong> {SITE_NAME} awards points, ranks and badges. It
                does not take bets, hold stakes, pay out, or arrange anything of value between players. Any
                wager members make among themselves is theirs alone and not our concern or responsibility.
              </p>
            </>
          ),
        },
        {
          id: 'eligibility',
          title: 'Who can use it',
          body: (
            <p>
              You must be at least 13 years old. If you are under 16 and live in the European Economic Area or
              the United Kingdom, you need a parent or guardian&apos;s permission. By creating an account you
              confirm this is true. Accounts that turn out to belong to someone younger are deleted.
            </p>
          ),
        },
        {
          id: 'your-account',
          title: 'Your account',
          body: (
            <>
              <p>
                Sign-in is handled by our provider, Clerk. You are responsible for keeping your credentials to
                yourself and for what is done with your account. One person, one account.
              </p>
              <p>
                You can delete your account at any time from your{' '}
                <LegalLink href="/account">account page</LegalLink>. The{' '}
                <LegalLink href="/privacy#deletion">privacy policy</LegalLink> says exactly what that removes.
              </p>
            </>
          ),
        },
        {
          id: 'leagues',
          title: 'Leagues and commissioners',
          body: (
            <>
              <p>
                Whoever creates a league is its commissioner. A commissioner sets the league&apos;s name, size
                ({LEAGUE_LIMITS.minTeams} to {LEAGUE_LIMITS.maxTeams} teams), roster size, scoring ruleset,
                roster lock time and whether the league is public; can change these before the draft; and can
                delete the league. Members join with the commissioner&apos;s invite code.
              </p>
              <p>
                <strong>Public leagues are public.</strong> If a commissioner makes a league public, anyone
                with the link can see its standings, team names and the display names of its members. Leagues
                are private by default.
              </p>
              <p>
                <strong>Results and corrections.</strong> Points come from published season results and from
                events entered by the site&apos;s administrators, and every point is traceable to the event
                that produced it. Mistakes happen and are corrected; a correction can change standings after
                the fact. We keep an audit trail of every correction. Standings on {SITE_NAME} are for fun and
                carry no other weight.
              </p>
            </>
          ),
        },
        {
          id: 'conduct',
          title: 'Acceptable use',
          body: (
            <>
              <p>League chat is for the league. Do not use {SITE_NAME} to:</p>
              <ul>
                <li>
                  harass, threaten or abuse anyone, or post content that is unlawful where you or they are;
                </li>
                <li>post other people&apos;s private information;</li>
                <li>impersonate someone, or use a league, team or display name to deceive;</li>
                <li>scrape the site, probe it for weaknesses, or interfere with its operation;</li>
                <li>send unsolicited invites or messages, or automate an account.</li>
              </ul>
              <p>
                Commissioners can remove messages in their leagues. We can remove content, close leagues and
                suspend or delete accounts that break these rules, and will tell you why unless the law
                prevents it.
              </p>
            </>
          ),
        },
        {
          id: 'your-content',
          title: 'Your content',
          body: (
            <p>
              What you post — league and team names, chat messages — is yours. You give {who.name} a licence
              to store it and show it to the people it is for, which is what running the service requires, and
              nothing more. We do not use it for anything else and the licence ends when the content is
              deleted.
            </p>
          ),
        },
        {
          id: 'shows',
          title: 'The shows',
          body: (
            <p>
              {AFFILIATION_DISCLAIMER} Cast names and season results are facts reported from the broadcast and
              from public fan and news sources, and appear here so a league can be scored.
            </p>
          ),
        },
        {
          id: 'availability',
          title: 'Availability and warranty',
          body: (
            <>
              <p>
                {SITE_NAME} is provided as it is and as available. It is a free, part-time project: it may be
                down, it may have bugs, results may arrive late or need correcting, and features may change or
                be withdrawn. We make no warranty of any kind, express or implied, including that the service
                will be uninterrupted, accurate or fit for a particular purpose.
              </p>
              <p>
                To the fullest extent the law allows, {who.name} is not liable for any loss or damage arising
                from your use of {SITE_NAME}, and in any case our total liability to you is limited to the
                amount you paid us, which is nothing. Nothing in these terms limits liability that cannot
                lawfully be limited.
              </p>
            </>
          ),
        },
        {
          id: 'ending',
          title: 'Ending things',
          body: (
            <p>
              You can stop using {SITE_NAME} at any time and delete your account from your account page. We
              can suspend or end your access if you break these terms or if the service is discontinued; if
              the service is discontinued we will give notice in the app where we reasonably can.
            </p>
          ),
        },
        {
          id: 'law',
          title: 'Governing law',
          body: who.governingLaw ? (
            <p>
              These terms are governed by the laws of {who.governingLaw}, without regard to conflict-of-law
              rules, and any dispute will be heard in its courts — except that nothing here takes away
              protections you have under the consumer law of the place you live.
            </p>
          ) : (
            <p>
              These terms are governed by the law of the place where {who.name} is established. Nothing here
              takes away protections you have under the consumer law of the place you live.
            </p>
          ),
        },
        {
          id: 'changes',
          title: 'Changes to these terms',
          body: (
            <p>
              When these terms change, this page changes and the date at the top moves. For a change that
              matters to you, we will tell you in the app before it takes effect. Using {SITE_NAME} after a
              change means you accept it.
            </p>
          ),
        },
      ]}
    />
  );
}
