import { relativeTime } from '@/lib/ui';
import type { SocialBuzz } from '@/lib/social-feed';

/**
 * The buzz panel.
 *
 * A server component that renders plain anchors — no embed, no iframe, no
 * third-party script. The X widget it replaces pulled in widgets.js, which
 * was measurably the heaviest thing on the page and the reason the cast
 * marquee stalled for the first ten seconds on a phone.
 *
 * Every row opens in a new tab: this is the one part of the page that sends
 * people somewhere else, and taking over their tab mid-season to do it would
 * lose their place.
 */
export function SocialFeed({ buzz, hashtag }: { buzz: SocialBuzz; hashtag: string }) {
  const xSearchUrl = `https://x.com/search?q=%23${encodeURIComponent(hashtag)}&f=live`;

  return (
    <section aria-labelledby="buzz-heading">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2
          id="buzz-heading"
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" aria-hidden />
          Latest buzz
        </h2>
        {/* The hashtag stays one tap away even when the feed itself is not X —
            plenty of people want the live replies, and we can link there
            honestly without pretending to have embedded them. */}
        <a
          href={xSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-2xs text-brand-gold-deep"
        >
          #{hashtag} on X →
        </a>
      </div>

      {buzz.posts.length === 0 ? (
        <div className="rounded-card border border-dashed border-hairline p-5">
          <p className="max-w-measure text-xs leading-relaxed text-muted">
            Couldn&apos;t reach the news feeds just now. The conversation is still going on X.
          </p>
          <a
            href={xSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost btn-sm mt-3"
          >
            Open #{hashtag} on X
          </a>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-hairline border-y border-hairline">
            {buzz.posts.slice(0, 6).map((post) => (
              <li key={post.id}>
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-btn px-1 py-3.5 transition hover:bg-surface/60"
                >
                  <p className="max-w-measure text-sm font-medium leading-snug text-ink">
                    {post.title}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-2xs text-muted">
                    {post.author && <span className="truncate">{post.author}</span>}
                    {post.author && <span aria-hidden>·</span>}
                    <time dateTime={post.publishedAt.toISOString()} className="shrink-0">
                      {relativeTime(post.publishedAt)}
                    </time>
                  </p>
                </a>
              </li>
            ))}
          </ul>
          {buzz.sourceLabel && (
            // Attribution, not decoration: these are someone else's words and
            // the reader should be able to tell whose before they click.
            <p className="mt-2 px-1 text-2xs text-muted">
              via{' '}
              {buzz.sourceUrl ? (
                <a
                  href={buzz.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-gold-deep"
                >
                  {buzz.sourceLabel}
                </a>
              ) : (
                buzz.sourceLabel
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
