'use client';

import { useEffect } from 'react';

/**
 * Route-level error boundary.
 *
 * Without one, a thrown error in any server component drops the visitor onto
 * Next's stock error screen — unbranded, unexplained, and with no way forward
 * but the browser's back button. Scoring and ingestion both talk to a database
 * and an external source, so this is not a hypothetical path.
 *
 * The raw message is deliberately not rendered: it can carry query fragments
 * or connection details. It goes to the console for whoever is debugging.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="pt-10">
      <div className="card p-6 text-center">
        <span
          aria-hidden
          className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-danger-soft text-danger-deep"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 8v5" strokeLinecap="round" />
            <circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none" />
            <path d="M12 3 2.5 20h19L12 3Z" strokeLinejoin="round" />
          </svg>
        </span>

        <h1 className="mt-4 text-xl font-semibold tracking-tight">That didn&apos;t load</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">
          Something went wrong on our side. Your leagues and scores are safe — this was just
          the page failing to build.
        </p>

        {error.digest && (
          <p className="mt-3 font-mono text-2xs text-muted">Reference: {error.digest}</p>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button type="button" onClick={reset} className="btn-primary w-full sm:w-auto">
            Try again
          </button>
          <a href="/leagues" className="btn-ghost w-full sm:w-auto">
            Back to leagues
          </a>
        </div>
      </div>
    </div>
  );
}
