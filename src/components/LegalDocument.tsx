import Link from 'next/link';
import type { ReactNode } from 'react';
import { JsonLd } from '@/components/JsonLd';
import { LEGAL_UPDATED, operator } from '@/lib/legal';
import { breadcrumbList } from '@/lib/seo';

/**
 * The frame every legal page shares: the title, when it last changed, a
 * table of contents, and the same operator block at the foot. The pages
 * themselves are plain server components made of `<LegalSection>`s, so the
 * outline (h1 → h2) is real and a screen reader can jump between sections.
 */
export function LegalDocument({
  title,
  path,
  intro,
  sections,
}: {
  title: string;
  path: string;
  intro: ReactNode;
  sections: Array<{ id: string; title: string; body: ReactNode }>;
}) {
  const who = operator();

  return (
    <article className="pt-2">
      <JsonLd data={breadcrumbList([{ name: title, path }])} />
      <Link href="/leagues" className="text-xs text-muted">
        ← Home
      </Link>
      <h1 className="headline mt-3 text-4xl">{title}</h1>
      <p className="mt-2 text-2xs text-muted">
        Last updated{' '}
        <time dateTime={LEGAL_UPDATED}>
          {new Date(`${LEGAL_UPDATED}T00:00:00Z`).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </time>
      </p>
      <div className="legal mt-4 max-w-measure text-sm leading-relaxed text-muted">{intro}</div>

      <nav aria-label="On this page" className="card mt-6 p-4">
        <p className="eyebrow">On this page</p>
        <ol className="mt-2 columns-1 gap-x-6 text-xs sm:columns-2">
          {sections.map((section, i) => (
            <li key={section.id} className="py-0.5">
              <a href={`#${section.id}`} className="text-brand-gold-deep underline-offset-2 hover:underline">
                {i + 1}. {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {sections.map((section) => (
        <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="mt-10">
          <h2 id={`${section.id}-title`} className="section-title scroll-mt-20">
            {section.title}
          </h2>
          <div className="legal mt-3 max-w-measure text-sm leading-relaxed text-muted">{section.body}</div>
        </section>
      ))}

      <section aria-labelledby="operator-title" className="card mt-12 p-5">
        <h2 id="operator-title" className="eyebrow">
          Who runs this site
        </h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-muted">Operator</dt>
          <dd className="text-ink">{who.name}</dd>
          {who.postalAddress && (
            <>
              <dt className="text-muted">Address</dt>
              <dd className="whitespace-pre-line text-ink">{who.postalAddress}</dd>
            </>
          )}
          <dt className="text-muted">Contact</dt>
          <dd className="text-ink">
            {who.email ? (
              <a href={`mailto:${who.email}`} className="text-brand-gold-deep underline underline-offset-2">
                {who.email}
              </a>
            ) : (
              <>
                Open an issue at{' '}
                <a
                  href={`${who.repositoryUrl}/issues`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-gold-deep underline underline-offset-2"
                >
                  the project&apos;s public repository
                </a>
                .
              </>
            )}
          </dd>
        </dl>
      </section>

      <nav aria-label="Legal" className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs">
        {[
          { href: '/privacy', label: 'Privacy policy' },
          { href: '/terms', label: 'Terms of service' },
          { href: '/cookies', label: 'Cookie policy' },
        ]
          .filter((link) => link.href !== path)
          .map((link) => (
            <Link key={link.href} href={link.href} className="text-brand-gold-deep">
              {link.label}
            </Link>
          ))}
      </nav>
    </article>
  );
}

/** A link inside running legal text. */
export function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  const external = /^https?:/.test(href);
  const className = 'text-brand-gold-deep underline decoration-brand-gold-deep/40 underline-offset-2';
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
