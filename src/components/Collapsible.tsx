'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { appScroller } from '@/components/AppScroller';
import { Reveal } from '@/components/motion/Reveal';
import { cn } from '@/lib/ui';

/**
 * A page section that folds.
 *
 * Two shapes:
 *
 * - `section` (default) — a primary block with a real heading (`section-title`
 *   or `eyebrow`), content below it. It is also a `.panel`, a place a scroll
 *   settles, unless `panel={false}` (the section directly under a page's
 *   title, which the top of the page already covers).
 * - `row` — one line in a list of reference sections (managers, league
 *   details, settings), full-width with the chevron at the right, like a
 *   settings screen. Rows go in a <RowGroup>, which is one panel for the lot:
 *   a snap target every fifty pixels would make the page catch, not guide.
 *
 * Either way the heading is the control: a real `<button>` inside the real
 * `<h2>`, so the outline a screen reader navigates by is unchanged and
 * `aria-expanded` says which way it is. The body stays in the DOM (the
 * grid-rows transition in globals.css animates it) and is `inert` while
 * closed, so nothing a reader cannot see can take focus or be announced.
 *
 * Opening a section is guided: once it has grown, if what it revealed runs
 * past the bottom of the screen, the page glides up just far enough to show
 * it — never so far that the heading you tapped leaves the top. Closing
 * leaves the page where it is.
 *
 * A section with an `id` is a link target (`/account#email` from every email
 * footer), and a closed target is a broken link: it opens itself when the
 * page arrives on its hash, and again if the hash changes to it later.
 */
export function Collapsible({
  id,
  title,
  variant = 'section',
  titleClassName,
  headingLevel = 2,
  panel,
  aside,
  defaultOpen = true,
  className,
  bodyClassName,
  children,
}: {
  id?: string;
  title: ReactNode;
  variant?: 'section' | 'row';
  /**
   * The heading's type. A `section` defaults to `section-title` (or pass
   * `eyebrow`); a `row` defaults to `text-sm` and may be set larger.
   */
  titleClassName?: string;
  /** `3` for an item inside a section — a FAQ question under its section heading. */
  headingLevel?: 2 | 3;
  /** Whether a scroll settles on this section. Defaults to true for a top-level `section`. */
  panel?: boolean;
  /** Small text at the right of the heading. On a `section` it may be a link; on a `row` it is text. */
  aside?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // The body clips its content only while it is moving. Open and at rest it
  // must not: the tiles inside lift and glow past their edges on hover, and
  // a permanent `overflow: hidden` would shave that off.
  const [settled, setSettled] = useState(true);
  // What to do once the body has finished growing: bring the section into
  // view for a reader who opened it, or put its heading at the top for a
  // hash that opened it.
  const afterOpen = useRef<'reveal' | 'anchor' | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const headingId = useId();
  const bodyId = useId();

  const isRow = variant === 'row';
  const isPanel = panel ?? (!isRow && headingLevel === 2);

  const toggle = () => {
    afterOpen.current = open ? null : 'reveal';
    setSettled(false);
    setOpen((value) => !value);
  };

  useEffect(() => {
    if (!id) return;
    const onHash = () => {
      if (window.location.hash !== `#${id}`) return;
      afterOpen.current = 'anchor';
      setSettled(false);
      setOpen(true);
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [id]);

  // `transitionend` is the precise signal, but a toggle that interrupts a
  // running transition gets `transitioncancel` instead, and a tab in the
  // background may not run the transition at all — so a timer a little
  // longer than the transition is the floor.
  useEffect(() => {
    if (settled) return;
    const timer = setTimeout(() => setSettled(true), 360);
    return () => clearTimeout(timer);
  }, [settled, open]);

  useEffect(() => {
    const intent = afterOpen.current;
    if (!settled || !open || !intent) return;
    afterOpen.current = null;
    const section = sectionRef.current;
    if (!section) return;

    const scroller = appScroller();
    const view = scroller.getBoundingClientRect();
    const box = section.getBoundingClientRect();
    const padding = parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0;
    // How far down the heading could travel before it leaves the top line.
    const headroom = box.top - (view.top + padding);

    let delta = 0;
    if (intent === 'anchor') {
      delta = headroom;
    } else {
      // Only as far as it takes to show the whole section, and never past
      // the heading: a long section opens with its heading at the top and
      // the rest a scroll away, which is where the reader expects it.
      const overflow = box.bottom - (view.bottom - 24);
      if (overflow > 0) delta = Math.min(overflow, headroom);
    }
    if (Math.abs(delta) > 1) scroller.scrollBy({ top: delta, behavior: 'smooth' });
  }, [settled, open]);

  const Heading = headingLevel === 3 ? 'h3' : 'h2';

  const heading = isRow ? (
    <Heading id={headingId} className="m-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={toggle}
        className="flex min-h-[52px] w-full items-center gap-3 py-3 text-left transition-colors hover:text-ink"
      >
        {/* Wraps rather than truncates: a question in a FAQ is a row too, and
            a clipped question is a question nobody can read. */}
        <span className={cn('min-w-0 flex-1 font-semibold text-ink', titleClassName ?? 'text-sm')}>
          {title}
        </span>
        {aside && <span className="shrink-0 text-2xs text-muted">{aside}</span>}
        <Chevron />
      </button>
    </Heading>
  ) : (
    <div className="flex items-end justify-between gap-3">
      <Heading id={headingId} className={cn(titleClassName ?? 'section-title', 'min-w-0')}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
          // The heading's own type carries into the button — Tailwind's
          // preflight already makes a button inherit font, size, weight,
          // colour and tracking, and resets only text-transform, which is
          // put back. A 44px hit height without changing the heading's line:
          // negative vertical margin absorbs the padding.
          className="-my-2 flex min-h-[44px] max-w-full items-center gap-2 rounded-btn py-2 pr-1 text-left [text-transform:inherit] transition hover:text-ink"
        >
          {/* Wraps rather than truncates: a heading cut off with an ellipsis
              reads as a layout that ran out of room. */}
          <span className="min-w-0 [text-wrap:balance]">{title}</span>
          <Chevron />
        </button>
      </Heading>
      {aside && <div className="shrink-0 pb-0.5 text-2xs text-muted">{aside}</div>}
    </div>
  );

  const body = (
    <div
      id={bodyId}
      className="collapse-body"
      data-open={open}
      data-settled={settled}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget) setSettled(true);
      }}
    >
      {/* React 18 does not know `inert` and drops a boolean `true` with a
          warning; an empty string is passed through as `inert=""`, which is
          the attribute present, which is inert. */}
      <div {...(open ? {} : { inert: '' as unknown as boolean })} aria-hidden={!open}>
        <div className={cn(isRow ? 'pb-4' : 'pt-3', bodyClassName)}>{children}</div>
      </div>
    </div>
  );

  return (
    // The snap target is this plain element, never the <Reveal> inside it:
    // a section still waiting to rise in is translated, and a snap target
    // that moves as it animates is one the scroll cannot settle on.
    <section
      ref={sectionRef}
      id={id}
      aria-labelledby={headingId}
      // A folded section is one heading tall — not a destination. Only an
      // open one is a place to settle, or two targets end up a line apart
      // and the page catches on the way past.
      className={cn(isPanel && open && 'panel', className)}
    >
      {isRow || headingLevel === 3 ? (
        <>
          {heading}
          {body}
        </>
      ) : (
        <Reveal>
          {heading}
          {body}
        </Reveal>
      )}
    </section>
  );
}

/**
 * A list of `row` sections — the reference material at the foot of a page —
 * drawn as one hairline-divided block and treated as one panel.
 */
export function RowGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('panel divide-y divide-hairline border-y border-hairline', className)}>{children}</div>
  );
}

function Chevron() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      aria-hidden
      className="collapse-chevron shrink-0 text-muted"
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
