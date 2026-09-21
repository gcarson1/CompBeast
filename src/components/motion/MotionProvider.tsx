'use client';

import { LazyMotion } from 'framer-motion';
import type { ReactNode } from 'react';

const loadFeatures = () => import('./features').then((mod) => mod.default);

/**
 * Loads Framer Motion's features once, at the root, and late.
 *
 * Every animated element in the app is an `m.*` component: the shell that
 * renders immediately as a plain element and picks up hover, tap, spring,
 * layout and exit support from here when the feature chunk arrives. Before
 * this, four components still imported `motion.*`, which bundles the whole
 * library into each of their pages — the league page paid for it twice, once
 * through this provider and once through the leaderboard.
 *
 * `strict` makes that a build-time-visible mistake again: a `motion.*` inside
 * this tree throws in development rather than quietly costing 30 KB.
 *
 * A client component, but `children` is whatever the server rendered — it
 * passes through untouched, so the landing page stays a server tree.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  );
}
