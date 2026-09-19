'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    twttr?: { widgets?: { load: (el?: HTMLElement) => void } };
  }
}

const WIDGETS_SRC = 'https://platform.twitter.com/widgets.js';

/**
 * X's own embedded-timeline widget — a free, no-API-key, sanctioned embed,
 * not a scrape. Built with plain DOM APIs in an effect rather than JSX, so
 * React never "owns" this subtree: widgets.js replaces the anchor with an
 * iframe entirely outside React's tree, and if React later tried to
 * reconcile a node it swapped out from under it, that's a real render crash,
 * not a cosmetic one. An empty ref'd div is the only thing React tracks
 * here. If the script never loads (network policy, X changes something),
 * the container just stays empty instead of throwing.
 */
export function TwitterFeed({ hashtag }: { hashtag: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const anchor = document.createElement('a');
    anchor.className = 'twitter-timeline';
    anchor.setAttribute('data-theme', 'dark');
    anchor.setAttribute('data-height', '420');
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
  }, [hashtag]);

  return <div ref={containerRef} />;
}
