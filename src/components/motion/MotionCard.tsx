'use client';

import { m, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import type { PointerEvent, ReactNode } from 'react';
import { cn } from '@/lib/ui';

/**
 * A tile that answers the pointer.
 *
 * Hover lifts it on a spring and blooms the tile's own glow colour (the
 * `.card-lift` shadow — CSS, so the colour follows the tone); press
 * squashes it; and with `tilt` the tile leans a few degrees toward the
 * pointer, which is what gives a flat block the sense of a physical card
 * on a table. Rotation is fed through `useSpring` so leaving the card
 * settles rather than snaps.
 *
 * Mouse only for the tilt: a finger dragging across a card is usually a
 * scroll, and a tile that leans while the page moves under it reads as
 * broken. Everything here is off under `prefers-reduced-motion`; the tile
 * is then just a tile.
 *
 * Renders a plain `div` — the link or button goes inside, as `block h-full`,
 * so the focus ring lands on the control and the motion on the frame. A
 * tile that is not a control (the league hero) passes `tap={false}` and
 * `lift={0}`: it may lean, but a press that squashes it would promise a
 * tap that does nothing.
 */
export function MotionCard({
  children,
  className,
  tilt = false,
  lift = 4,
  tap = true,
}: {
  children: ReactNode;
  className?: string;
  /** Lean toward the pointer. Reserve for hero tiles; a whole grid of them is a fairground. */
  tilt?: boolean;
  /** Hover rise, in px. */
  lift?: number;
  /** Squash on press. Off for tiles that are not controls. */
  tap?: boolean;
}) {
  const reduce = useReducedMotion();
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 260, damping: 22 });
  const springY = useSpring(rotateY, { stiffness: 260, damping: 22 });

  const lean = (event: PointerEvent<HTMLDivElement>) => {
    if (!tilt || reduce || event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    rotateX.set(-y * 7);
    rotateY.set(x * 9);
  };

  const settle = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <m.div
      // No `.card-lift` without a lift: the hover glow reads as "tappable",
      // and a tile that only leans should not promise that.
      className={cn('card', lift > 0 && 'card-lift', className)}
      style={{ rotateX: springX, rotateY: springY, transformPerspective: 900 }}
      whileHover={reduce || lift === 0 ? undefined : { y: -lift }}
      whileTap={reduce || !tap ? undefined : { scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      onPointerMove={lean}
      onPointerLeave={settle}
      onPointerCancel={settle}
    >
      {children}
    </m.div>
  );
}
