'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from 'react';

/**
 * Scroll-driven entrance: fade and rise as an element comes into view.
 *
 * Not a Framer Motion `whileInView`, and deliberately so. Motion's version
 * writes `style="opacity:0"` into the server HTML and leaves it there until
 * the JavaScript arrives, which is exactly the Largest-Contentful-Paint
 * trap this app already fell into once (see the `rise` keyframe in
 * tailwind.config.ts). This one never touches the HTML: it decides on the
 * client, after hydration, in a layout effect — before the browser paints —
 * and it only hides an element that is entirely *below* the viewport at
 * that moment. Anything already on screen is left alone, a reader without
 * JavaScript sees everything, and the crawler reads a complete page.
 *
 * The animation itself is a CSS transition (`[data-reveal]` in
 * globals.css) with a spring-shaped curve, so it also survives a busy main
 * thread and collapses to a plain fade under `prefers-reduced-motion`.
 *
 * Inside a <RevealGroup>, siblings that enter the viewport in the same
 * frame stagger in order; a tile that scrolls in alone starts at once.
 */
export function Reveal({
  as: Tag = 'div',
  children,
  className,
  style,
  ...rest
}: {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  [key: string]: unknown;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const observe = useContext(GroupContext);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // On screen, or above it (the browser restored a scroll position):
    // leave it visible. Only something the reader has not reached yet may
    // start hidden, so nothing that is already painted ever blinks.
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.dataset.reveal = 'pending';
    return observe(el);
  }, [observe]);

  return (
    <Tag ref={ref} className={className} style={style} {...rest}>
      {children}
    </Tag>
  );
}

type Observe = (el: HTMLElement) => () => void;

const GroupContext = createContext<Observe>(standalone);

/**
 * Staggers the <Reveal>s inside it. One observer for the group: the entries
 * that arrive in a single callback are the ones that crossed into view
 * together, so they are the ones that should cascade — a delay keyed to
 * position in the *batch* rather than in the list means the tenth tile does
 * not wait nine steps when it scrolls in on its own.
 */
export function RevealGroup({
  as: Tag = 'div',
  step = 70,
  children,
  className,
  ...rest
}: {
  as?: ElementType;
  /** Milliseconds between one sibling's entrance and the next. */
  step?: number;
  children: ReactNode;
  className?: string;
  [key: string]: unknown;
}) {
  const observer = useRef<IntersectionObserver | null>(null);

  const observe = useCallback<Observe>(
    (el) => {
      observer.current ??= new IntersectionObserver(
        (entries) => {
          let index = 0;
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            show(entry.target as HTMLElement, Math.min(index, 6) * step);
            observer.current?.unobserve(entry.target);
            index += 1;
          }
        },
        { rootMargin: ROOT_MARGIN },
      );
      observer.current.observe(el);
      return () => observer.current?.unobserve(el);
    },
    [step],
  );

  useEffect(() => () => observer.current?.disconnect(), []);

  return (
    <GroupContext.Provider value={observe}>
      <Tag className={className} {...rest}>
        {children}
      </Tag>
    </GroupContext.Provider>
  );
}

/**
 * The observer's root: the viewport, pulled in a little at the bottom so the
 * rise happens where it can be seen — and extended a long way *upward*. An
 * element only ever gets a callback when its intersection changes, so a
 * jump that lands past it (an anchor link, a restored scroll position,
 * find-in-page) would otherwise never fire and leave it hidden for good.
 * With the root reaching above the viewport, "the reader has passed this"
 * is itself an intersection, and the element is shown the moment it is
 * anywhere above the fold.
 */
const ROOT_MARGIN = '100000px 0px -6% 0px';

function show(el: HTMLElement, delay: number) {
  el.style.setProperty('--reveal-delay', `${delay}ms`);
  el.dataset.reveal = 'shown';
}

/** A <Reveal> with no group gets its own observer and no stagger. */
function standalone(el: HTMLElement) {
  const io = new IntersectionObserver(
    ([entry]) => {
      if (!entry?.isIntersecting) return;
      show(el, 0);
      io.disconnect();
    },
    { rootMargin: ROOT_MARGIN },
  );
  io.observe(el);
  return () => io.disconnect();
}
