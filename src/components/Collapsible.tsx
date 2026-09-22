'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Reveal } from '@/components/motion/Reveal';
import { cn } from '@/lib/ui';

/**
 * A page section that folds.
 *
 * Every section on the app's own screens is one of these, so a page is a
 * short stack of headings that open into their content rather than a long
 * strip to wander down. Several of these usually share one `.screen`, which
 * is what the scroll snaps to. The heading itself is the control: a real
 * `<button>` inside the `<h2>`, so the outline a screen reader navigates by
 * is unchanged and `aria-expanded` says which way it is.
 *
 * The body stays in the DOM either way (the grid-rows transition in
 * globals.css is what animates it) and is `inert` while closed, so nothing a
 * reader cannot see can take focus or be announced. Server-rendered content
 * passes through as children; only the open/closed bit lives here.
 *
 * `title` takes the heading's own style — `section-title` for a primary
 * block, `eyebrow` for a reference list — and `aside` is the small text at
 * the right of the heading row (a count, a link), which stays outside the
 * button so a link there is still a link.
 *
 * A section with an `id` is a link target (`/account#email` from every email
 * footer), and a closed target is a broken link: it opens itself when the
 * page arrives on its hash, and again if the hash changes to it later.
 */
export function Collapsible({
  id,
  title,
  titleClassName = 'section-title',
  headingLevel = 2,
  aside,
  defaultOpen = true,
  className,
  bodyClassName,
  children,
}: {
  id?: string;
  title: ReactNode;
  /** The heading's style: `section-title`, `eyebrow`, or a class of your own for a nested item. */
  titleClassName?: string;
  /** `3` for an item inside a section — a FAQ question under its section heading. */
  headingLevel?: 2 | 3;
  aside?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // The body clips its content only while it is moving. Open and at rest it
  // must not: the tiles inside carry stickers and the Beast overhanging their
  // corners, and a permanent `overflow: hidden` would shave them off.
  const [settled, setSettled] = useState(true);
  // Set when the section opened itself for a hash: once its body has grown,
  // it scrolls into place. At anchor time the body was still folded, so the
  // page was often too short to bring the heading up to the header line.
  const scrollWhenSettled = useRef(false);
  const headingId = useId();
  const bodyId = useId();

  const toggle = () => {
    setSettled(false);
    setOpen((value) => !value);
  };

  useEffect(() => {
    if (!id) return;
    const onHash = () => {
      if (window.location.hash === `#${id}`) {
        scrollWhenSettled.current = true;
        setSettled(false);
        setOpen(true);
      }
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
    const timer = setTimeout(() => setSettled(true), 400);
    return () => clearTimeout(timer);
  }, [settled, open]);

  useEffect(() => {
    if (!settled || !open || !scrollWhenSettled.current || !id) return;
    scrollWhenSettled.current = false;
    const el = document.getElementById(id);
    if (!el) return;
    // An explicit position rather than `scrollIntoView`: with snapping on the
    // root, Chrome lands `scrollIntoView` on a neighbouring snap point when
    // a folded section sits just above. The offset is the root's
    // `scroll-padding-top`, i.e. the sticky header.
    const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - padding, behavior: 'smooth' });
  }, [settled, open, id]);

  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  // A nested item does not rise in on scroll; only a page-level section does.
  const Wrapper = headingLevel === 3 ? 'section' : Reveal;

  return (
    <Wrapper
      as={headingLevel === 3 ? undefined : 'section'}
      id={id}
      className={cn(className)}
      aria-labelledby={headingId}
    >
      <div className="flex items-end justify-between gap-3">
        <Heading id={headingId} className={cn(titleClassName, 'min-w-0')}>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={toggle}
            // The heading's own type carries into the button — Tailwind's
            // preflight already makes a button inherit font, size, weight,
            // colour and tracking, and resets only text-transform, which is
            // put back. The chevron is the only thing added. A 44px hit
            // height without changing the heading's line: negative vertical
            // margin absorbs the padding.
            className="-my-2 flex min-h-[44px] max-w-full items-center gap-2 rounded-btn py-2 pr-1 text-left [text-transform:inherit] transition hover:text-ink"
          >
            <span className={cn('min-w-0', headingLevel === 2 && 'truncate')}>{title}</span>
            <Chevron />
          </button>
        </Heading>
        {aside && <div className="shrink-0 pb-0.5 text-2xs text-muted">{aside}</div>}
      </div>
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
            warning; an empty string is passed through as `inert=""`, which
            is the attribute present, which is inert. */}
        <div {...(open ? {} : { inert: '' as unknown as boolean })} aria-hidden={!open}>
          <div className={cn('pt-3', bodyClassName)}>{children}</div>
        </div>
      </div>
    </Wrapper>
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
