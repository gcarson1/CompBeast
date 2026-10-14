'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { APP_SCROLLER_ID } from '@/components/AppScroller';
import { NOTIFICATIONS_CHANGED, haptic } from '@/lib/native';
import { cn } from '@/lib/ui';

/** How far the indicator has to come down before letting go refreshes. */
const THRESHOLD = 64;
/** The most it comes down, however far the finger goes. */
const MAX_PULL = 104;
/** Long enough to read as "it did something" even when the answer is instant. */
const MIN_SPIN_MS = 500;

type Phase = 'idle' | 'pulling' | 'armed' | 'refreshing';

/**
 * Pull down at the top of a page to refresh it — in the iOS app (NativeBridge
 * mounts it), where it is the gesture people reach for to see the latest
 * standings.
 *
 * The page scrolls inside the app's scroller, not the document, and neither
 * bounces (globals.css bolts both down), so nothing native would ever pull;
 * this watches touches on the scroller instead. Only a drag that starts with
 * the page at its very top, and goes more down than sideways, counts — a
 * swipe across a carousel or a scroll back up is left alone. The page is not
 * moved: a spinner slides out from under the header, and letting go past the
 * threshold re-renders the page from the server (`router.refresh`) and nudges
 * the bell to recount.
 */
export function PullToRefresh() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pull, setPull] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [top, setTop] = useState(0);
  const phaseRef = useRef<Phase>('idle');
  const startedAt = useRef(0);

  // The touch handlers are bound once; they read the phase through this.
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const scroller = document.getElementById(APP_SCROLLER_ID);
    if (!scroller) return;

    let tracking = false;
    let decided = false;
    let startX = 0;
    let startY = 0;
    let distance = 0;

    const reset = () => {
      setPull(0);
      setPhase('idle');
    };

    const onStart = (event: TouchEvent) => {
      tracking = false;
      if (phaseRef.current === 'refreshing' || event.touches.length !== 1 || scroller.scrollTop > 0) return;
      // A dialog or the keyboard owns the screen; a refresh under it is a surprise.
      if (document.querySelector('dialog[open]') || document.documentElement.dataset.keyboard) return;
      tracking = true;
      decided = false;
      distance = 0;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      setTop(document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 0);
    };

    const onMove = (event: TouchEvent) => {
      if (!tracking) return;
      const dx = event.touches[0].clientX - startX;
      const dy = event.touches[0].clientY - startY;
      if (!decided) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        decided = true;
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || scroller.scrollTop > 0) {
          tracking = false;
          return;
        }
      }
      // Resistance, so the spinner lags the finger the way a native pull does.
      const next = Math.min(MAX_PULL, Math.max(0, dy * 0.5));
      if (next >= THRESHOLD && distance < THRESHOLD) haptic('tap');
      distance = next;
      setPull(next);
      setPhase(next >= THRESHOLD ? 'armed' : 'pulling');
    };

    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (distance < THRESHOLD) {
        reset();
        return;
      }
      haptic('press');
      setPhase('refreshing');
      setPull(THRESHOLD);
      startedAt.current = Date.now();
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
      startTransition(() => router.refresh());
    };

    scroller.addEventListener('touchstart', onStart, { passive: true });
    scroller.addEventListener('touchmove', onMove, { passive: true });
    scroller.addEventListener('touchend', onEnd, { passive: true });
    scroller.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      scroller.removeEventListener('touchstart', onStart);
      scroller.removeEventListener('touchmove', onMove);
      scroller.removeEventListener('touchend', onEnd);
      scroller.removeEventListener('touchcancel', onEnd);
    };
  }, [router]);

  // The refresh is done when its transition is: hold the spinner a moment
  // if the server was quicker than the eye, then tuck it away.
  useEffect(() => {
    if (phase !== 'refreshing' || isPending) return;
    const wait = Math.max(0, MIN_SPIN_MS - (Date.now() - startedAt.current));
    const id = setTimeout(() => {
      setPull(0);
      setPhase('idle');
    }, wait);
    return () => clearTimeout(id);
  }, [phase, isPending]);

  if (phase === 'idle' && pull === 0) return null;

  const progress = Math.min(1, pull / THRESHOLD);
  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 z-10 flex justify-center"
      style={{
        top,
        transform: `translateY(${pull - 44}px)`,
        transition: phase === 'pulling' || phase === 'armed' ? 'none' : 'transform 250ms ease',
      }}
    >
      <span
        className={cn(
          'grid h-9 w-9 place-items-center rounded-full bg-surface text-brand-gold-deep shadow-card ring-1 ring-inset ring-hairline',
          phase === 'refreshing' && 'animate-spin',
        )}
        style={{ opacity: phase === 'refreshing' ? 1 : progress }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          style={{
            transform: phase === 'refreshing' ? undefined : `rotate(${progress * 270}deg)`,
          }}
        >
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 4v4.5h-4.5" strokeLinejoin="round" />
        </svg>
      </span>
    </div>,
    document.body,
  );
}
