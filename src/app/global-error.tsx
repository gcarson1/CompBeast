'use client';

import { useEffect } from 'react';
import { reportError } from '@/components/ErrorReporting';

/**
 * The boundary above the root layout. app/error.tsx catches everything that
 * happens *inside* the layout; this catches the layout itself failing, which
 * is the one case that has to render its own <html> because there is no
 * layout left to render into. Kept deliberately plain — inline styles, no
 * fonts — because nothing else can be assumed to have loaded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{ margin: 0, background: '#0F172A', color: '#F8FAFC', fontFamily: 'system-ui, sans-serif' }}
      >
        <main style={{ maxWidth: 420, margin: '15vh auto', padding: '0 24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>That didn&apos;t load</h1>
          <p style={{ color: '#94A3B8', fontSize: 14, lineHeight: 1.5, margin: '0 0 20px' }}>
            Something went wrong on our side. Your leagues and scores are safe.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: '#F59E0B',
              color: '#1A1206',
              border: 0,
              borderRadius: 8,
              padding: '12px 20px',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
