import Link from 'next/link';

/**
 * `notFound()` is already called from the league, team, season and player
 * routes, so this screen was reachable long before it existed — until now
 * those all rendered Next's unstyled stock 404.
 */
export default function NotFound() {
  return (
    <div className="pt-10">
      <div className="card p-6 text-center">
        <span aria-hidden className="font-display text-6xl leading-none text-brand-gold">
          404
        </span>

        <h1 className="mt-3 text-xl font-semibold tracking-tight">Evicted</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">
          This page isn&apos;t in the house. It may have been removed, or the link may be wrong.
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href="/leagues" className="btn-primary w-full sm:w-auto">
            My leagues
          </Link>
          <Link href="/seasons" className="btn-ghost w-full sm:w-auto">
            Browse seasons
          </Link>
        </div>
      </div>
    </div>
  );
}
