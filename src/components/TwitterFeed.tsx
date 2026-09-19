'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    twttr?: { widgets?: { load: (el?: HTMLElement) => void } };
  }
}

const WIDGETS_SRC = 'https://platform.twitter.com/widgets.js';
const EMBED_HEIGHT = 420;

/**
 * X's own embedded-timeline widget — a free, no-API-key, sanctioned embed,
 * not a scrape. Built with plain DOM APIs in an effect rather than JSX, so
 * React never "owns" this subtree: widgets.js replaces the anchor with an
 * iframe entirely outside React's tree, and if React later tried to
 * reconcile a node it swapped out from under it, that's a real render crash,
 * not a cosmetic one. An empty ref'd div is the only thing React tracks
 * here. If the script never loads (network policy, X changes something),
 * the container just stays empty instead of throwing.
 *
 * Nothing loads until the embed is near the viewport. widgets.js plus the
 * iframe it builds is the heaviest thing on the page by a wide margin, and it
 * used to fetch on mount — measured against production it held the main
 * thread in multi-second blocks, which is what stalled the cast marquee for
 * the first ~10 seconds on a phone. It now sits well below the fold on both
 * pages that use it, so most visits never pay for it at all.
 */
export function TwitterFeed({ hashtag }: { hashtag: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || visible) return;

    // No IntersectionObserver (very old browser) means load it rather than
    // never show it — the feed working matters more than the deferral.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // Start fetching a screen early so it is usually painted by the time
      // someone scrolls onto it.
      { rootMargin: '600px 0px' },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !visible) return;

    const anchor = document.createElement('a');
    anchor.className = 'twitter-timeline';
    anchor.setAttribute('data-theme', 'dark');
    anchor.setAttribute('data-height', String(EMBED_HEIGHT));
    anchor.setAttribute('data-chrome', 'noheader nofooter noborders transparent');
    anchor.href = `https://twitter.com/search?q=%23${encodeURIComponent(hashtag)}&src=typed_query`;
    anchor.textContent = `Tweets about #${hashtag}`;
    container.appendChild(anchor);

    const load = () => window.twttr?.widgets?.load(container);

    if (window.twttr?.widgets) {
      load();
    } else {
      let script = document.querySelector<HTMLScriptElement>(`script[src="${WIDGETS_SRC}"]`);
      if (!script) {
        script = document.createElement('script');
        script.src = WIDGETS_SRC;
        script.async = true;
        document.body.appendChild(script);
      }
      script.addEventListener('load', load, { once: true });
    }

    return () => {
      container.replaceChildren();
    };
  }, [hashtag, visible]);

  // The reserved height is what keeps the deferral from turning into a layout
  // shift when the iframe finally arrives.
  return (
    <div ref={containerRef} style={{ minHeight: EMBED_HEIGHT }} className="grid">
      {!visible && (
        <span className="place-self-center text-2xs text-muted">Loading the timeline…</span>
      )}
    </div>
  );
}
