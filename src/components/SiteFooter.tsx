import Link from 'next/link';
import { AFFILIATION_DISCLAIMER, operator } from '@/lib/legal';
import { SITE_NAME } from '@/lib/seo';

const LINKS = [
  { href: '/rules', label: 'Scoring rules' },
  { href: '/seasons', label: 'Seasons' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/cookies', label: 'Cookies' },
];

/**
 * The one place every page says who runs it and where the legal texts are.
 * A `<footer>` inside the column, not a bar across the viewport: on a phone
 * the bottom nav owns the bottom edge, and on a wide screen the narrow
 * column is the page.
 */
export function SiteFooter() {
  const who = operator();

  return (
    <footer className="screen-end mx-auto w-full max-w-md px-5 pb-5 pt-8 text-2xs text-muted sm:max-w-lg lg:max-w-3xl">
      <nav aria-label="Site" className="flex flex-wrap gap-x-4 gap-y-1.5">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="hover:text-ink">
            {link.label}
          </Link>
        ))}
        {who.email ? (
          <a href={`mailto:${who.email}`} className="hover:text-ink">
            Contact
          </a>
        ) : (
          <a
            href={`${who.repositoryUrl}/issues`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-ink"
          >
            Contact
          </a>
        )}
      </nav>
      <p className="mt-3 max-w-measure leading-relaxed">
        {who.name !== SITE_NAME &&
          `${SITE_NAME} is run by ${who.name}${
            who.postalAddress ? `, ${who.postalAddress.replace(/\s*\n\s*/g, ', ')}` : ''
          }. `}
        {AFFILIATION_DISCLAIMER}
      </p>
    </footer>
  );
}
