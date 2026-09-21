'use client';

import { m, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Spring-bounce on hover and press for anything small and tappable that is
 * not already a `.btn` — a sticker inside a link, an avatar chip, an icon
 * button. `.btn` gets the same feel from CSS (`ease-spring` in globals.css)
 * without needing a client boundary; this is for the client trees where a
 * real spring is cheap.
 *
 * Inline by default so it wraps a badge without breaking a line of text.
 */
export function Springy({
  children,
  className,
  hover = 1.05,
  tap = 0.95,
  block = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: number;
  tap?: number;
  block?: boolean;
}) {
  const reduce = useReducedMotion();
  const Tag = block ? m.div : m.span;

  return (
    <Tag
      className={className}
      style={block ? undefined : { display: 'inline-flex' }}
      whileHover={reduce ? undefined : { scale: hover }}
      whileTap={reduce ? undefined : { scale: tap }}
      transition={{ type: 'spring', stiffness: 520, damping: 18 }}
    >
      {children}
    </Tag>
  );
}
