/**
 * The Framer Motion feature bundle, in a file of its own so `MotionProvider`
 * can import it lazily: Next turns this into a separate chunk that arrives
 * after hydration, and the entry ships only the `m.*` component shell.
 *
 * `domMax`, not `domAnimation`: the leaderboard and the feed use `layout`
 * animations (rows reordering, a deleted post collapsing), which are only in
 * the larger set. It is one chunk for the whole app either way, and loading
 * it late costs nothing a person can see — the first hover in the ~100ms
 * before it lands simply does not lift.
 */
export { domMax as default } from 'framer-motion';
