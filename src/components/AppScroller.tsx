'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';

export const APP_SCROLLER_ID = 'app-scroller';

/**
 * The element the app scrolls.
 *
 * Every page scrolls inside this one box between the header and the bottom
 * nav, not the document — so anything that reads or sets a scroll position
 * goes through here. Falls back to the document for a render outside the
 * shell (the global error page).
 */
export function appScroller(): HTMLElement {
  return (
    (document.getElementById(APP_SCROLLER_ID) as HTMLElement | null) ??
    (document.scrollingElement as HTMLElement)
  );
}

/** Where each page was left, for back and forward. Per tab, like the browser's own. */
const positions = new Map<string, number>();

/**
 * The app's one scroll container.
 *
 * Why the document does not scroll. The header and the bottom nav used to be
 * `sticky` inside a scrolling document, and on a phone that is fragile in
 * three ways at once: the URL bar collapsing resizes the viewport mid-scroll,
 * the rubber-band past either end drags the sticky bars with it, and a bar
 * that is in the flow can be carried up the screen by the footer at the
 * bottom of a short page. Putting the bars *outside* this box, in a column
 * that is exactly the viewport tall, makes all three impossible rather than
 * handled: the bars are never scrolled, so they cannot move, and the
 * document never scrolls, so the URL bar never collapses.
 *
 * Owning the scroller means owning what the browser used to do for the
 * document, so this also:
 *
 * - puts every new page at its top. Next resets the *document* on
 *   navigation, which no longer scrolls, and a page that inherited the last
 *   page's offset opened in its middle;
 * - restores the offset on back and forward, the way the browser restores a
 *   document;
 * - leaves a `#hash` target alone, since the page scrolls to that itself;
 * - marks the root `data-scrolled` so the header can show its edge only
 *   once content is passing under it.
 */
export function AppScroller({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const traversing = useRef(false);
  const current = useRef<string | null>(null);

  useEffect(() => {
    const onPop = () => {
      traversing.current = true;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // The document must never scroll: it is exactly the viewport, and the
  // header lives at its top. `overflow: hidden` stops the reader scrolling
  // it but not the browser, which will still scroll it to bring a focused
  // control into view if anything makes it taller than the screen. The
  // scroller's `position: relative` (globals.css) removed the one cause found
  // so far; this puts it back if another ever appears, rather than leaving
  // the header scrolled off the top.
  useEffect(() => {
    const onDocumentScroll = () => {
      const root = document.scrollingElement;
      if (root && root.scrollTop !== 0) root.scrollTop = 0;
    };
    window.addEventListener('scroll', onDocumentScroll, { passive: true });
    return () => window.removeEventListener('scroll', onDocumentScroll);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (current.current) positions.set(current.current, el.scrollTop);
        document.documentElement.dataset.scrolled = String(el.scrollTop > 2);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const key = pathname + window.location.search;
    const restoring = traversing.current;
    traversing.current = false;
    current.current = key;

    if (window.location.hash) return;

    const target = restoring ? (positions.get(key) ?? 0) : 0;
    el.scrollTo({ top: target, behavior: 'instant' });
    document.documentElement.dataset.scrolled = String(target > 2);
    if (target === 0) return;

    // A restored page streams in behind its loading skeleton, so the offset
    // may not exist yet. Re-apply as the content grows, briefly, and stop
    // the moment the reader scrolls on their own.
    let settled = false;
    const observer = new ResizeObserver(() => {
      if (settled) return;
      el.scrollTo({ top: target, behavior: 'instant' });
      if (Math.abs(el.scrollTop - target) < 2) settled = true;
    });
    const stop = () => {
      settled = true;
      observer.disconnect();
    };
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    const timer = setTimeout(stop, 1500);
    el.addEventListener('pointerdown', stop, { once: true });
    el.addEventListener('wheel', stop, { once: true, passive: true });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [pathname]);

  // Keep the resting points at least ~half a screen apart, whatever the
  // content. A panel's height is data: a league with two teams and no posts
  // has a standings table and a feed a couple of hundred pixels tall, and two
  // snap targets that close make a scroll catch on the second one instead of
  // carrying on. So a panel that starts too soon after the last kept target
  // stands down (`data-snap="off"`, globals.css) until the content above it
  // grows. Re-measured whenever the content resizes — a section opening, a
  // page streaming in, a route change.
  useEffect(() => {
    const el = ref.current;
    const main = el?.querySelector('#main');
    if (!el || !main) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const space = () => {
      timer = undefined;
      const minimum = el.clientHeight * 0.45;
      const origin = el.getBoundingClientRect().top - el.scrollTop;
      let last = 0; // the top of the page is always a resting point
      for (const panel of el.querySelectorAll<HTMLElement>('.panel')) {
        const y = panel.getBoundingClientRect().top - origin;
        if (y - last < minimum) {
          if (panel.dataset.snap !== 'off') panel.dataset.snap = 'off';
        } else {
          if (panel.dataset.snap) delete panel.dataset.snap;
          last = y;
        }
      }
    };
    // Debounced rather than per frame: a section opening resizes the page
    // continuously for 300ms, and only where it comes to rest matters.
    const schedule = () => {
      if (timer === undefined) timer = setTimeout(space, 60);
    };
    // Watch the page itself, not the wrapper around it: the wrapper is
    // stretched to the full height of a short page, so it would not report a
    // section opening there. The page's root is swapped when it streams in
    // behind its skeleton, hence re-binding on child changes.
    const sizes = new ResizeObserver(schedule);
    const bind = () => {
      sizes.disconnect();
      sizes.observe(el);
      for (const child of main.children) sizes.observe(child);
      schedule();
    };
    const children = new MutationObserver(bind);
    children.observe(main, { childList: true });
    bind();
    return () => {
      sizes.disconnect();
      children.disconnect();
      clearTimeout(timer);
    };
  }, [pathname]);

  return (
    <div id={APP_SCROLLER_ID} ref={ref} className={className}>
      {children}
    </div>
  );
}
