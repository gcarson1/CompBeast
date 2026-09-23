'use client';

import { useEffect } from 'react';
import { reportError } from '@/components/ErrorReporting';
import { AlertIcon } from '@/components/icons';
import { Tag } from '@/components/Tag';

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
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    // No-op until a DSN is configured; see ErrorReporting.tsx.
    reportError(error);
  }, [error]);

  return (
    <div className="stage pt-10">
      {/* The broadcast's own word for it: off air, back shortly. */}
      <div className="card-feature p-5">
        <span className="flex items-center justify-between gap-3">
          <span className="icon-well">
            <AlertIcon size={22} />
          </span>
          <Tag tone="red">Off air</Tag>
        </span>

        <h1 className="headline mt-5 text-3xl">We&apos;ll be right back</h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
          Something went wrong on our side. Your leagues and scores are safe — this was just the page failing
          to build.
        </p>

        {error.digest && <p className="mt-3 font-mono text-2xs text-muted">Reference: {error.digest}</p>}

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="btn-primary">
            Try again
          </button>
          <a href="/leagues" className="btn-ghost">
            Back to leagues
          </a>
        </div>
      </div>
    </div>
  );
}
