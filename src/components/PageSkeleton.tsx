/**
 * The navigation skeleton.
 *
 * Every route in this app is `force-dynamic` and queries the database, so
 * navigation always costs a round trip. Without a loading state the app just
 * sits on the previous screen with no acknowledgement that the tap registered
 * — which reads as "broken" and gets the button pressed again.
 *
 * A skeleton shaped like the content that is coming, rather than a spinner:
 * the layout does not jump when the real rows arrive.
 *
 * It is mounted by the `loading.tsx` of the app's *own* screens — league,
 * team, draft, account, alerts, admin — and deliberately not at the root.
 * A root boundary wraps every page in Suspense, and that has three costs a
 * public page cannot pay: the shell streams first, so `notFound()` and
 * `redirect()` fire after the status line has gone out and unknown slugs
 * answer 200; the page's real content arrives in a hidden chunk that an
 * inline script has to swap in, so anything reading the HTML without running
 * JavaScript sees this skeleton; and the largest paint waits on that swap.
 * The public pages render straight into the shell instead, and stream only
 * the parts of themselves that are slow.
 */
export function PageSkeleton() {
  return (
    <div className="pt-2" role="status" aria-label="Loading">
      <div className="h-8 w-40 animate-pulse rounded-pill bg-surface" />
      <div className="mt-2 h-4 w-56 animate-pulse rounded-pill bg-surface/70" />

      <div className="mt-6 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card flex items-center gap-3 p-4">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-canvas" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-1/2 animate-pulse rounded-pill bg-canvas" />
              <div className="h-3 w-2/3 animate-pulse rounded-pill bg-canvas/70" />
            </div>
            <div className="h-5 w-10 shrink-0 animate-pulse rounded-pill bg-canvas" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
