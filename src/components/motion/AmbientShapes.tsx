/**
 * The floating shapes behind the page: two soft colour blooms and one
 * moulded ring, drifting on slow transform-only keyframes.
 *
 * A server component with no script. The blooms are radial gradients, not
 * `filter: blur()` — a blurred layer that also animates is the most
 * expensive thing a phone GPU is asked to do on a page like this, and a
 * gradient with a soft edge looks the same for nothing. Every shape sits at
 * ≤ 12% alpha: measured, `muted` text over the worst-case tint still clears
 * 4.5:1, and the tiles themselves are opaque, so the shapes only ever show
 * in the gutters. `fixed` and `-z-10` so they stay behind everything,
 * including the header's own gold bloom, and never catch a pointer.
 *
 * Under reduced motion `.ambient-shape` parks (globals.css); the shapes stay.
 */
export function AmbientShapes() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <span
        className="ambient-shape absolute -left-24 top-[22%] h-72 w-72 animate-float rounded-full
          bg-[radial-gradient(closest-side,rgba(196,181,253,0.12),transparent)] will-change-transform"
      />
      <span
        className="ambient-shape absolute -right-28 top-[54%] h-80 w-80 animate-float-alt rounded-full
          bg-[radial-gradient(closest-side,rgba(167,243,208,0.11),transparent)] will-change-transform"
      />
      {/* The ring: a torus in the clay style, at the lower right where the
          column leaves room on a wide screen and the bottom nav covers it on
          a phone. Border-drawn, so it is one element and no image. */}
      <span
        className="ambient-shape absolute -bottom-10 right-[6%] h-40 w-40 animate-float rounded-full
          border-[22px] border-pop-gold/[0.12] will-change-transform [animation-delay:-9s]
          shadow-[inset_0_6px_12px_rgba(255,255,255,0.06),inset_0_-6px_12px_rgba(0,0,0,0.25)]"
      />
    </div>
  );
}
