'use client';

import { LazyMotion, domAnimation } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Loads Framer Motion's DOM animation features once, at the root, so the
 * `m.*` components in this folder render at a fraction of the bundle the
 * full `motion.*` import costs — `m` ships the component shell and pulls
 * hover, tap and spring support from here. The older `motion.*` call sites
 * (the leaderboard reorder, the draft room, the feed) keep working alongside
 * it; they bring their own features, which is why this is not `strict`.
 *
 * A client component, but `children` is whatever the server rendered — it
 * passes through untouched, so the landing page stays a server tree.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}
