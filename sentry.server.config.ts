import * as Sentry from '@sentry/nextjs';

/**
 * Server-side Sentry (Node runtime), loaded by src/instrumentation.ts.
 *
 * Errors only: `enabled` follows the DSN, so a deployment without
 * `NEXT_PUBLIC_SENTRY_DSN` behaves exactly as it did before Sentry existed —
 * the same rule as email and push. No tracing: the performance story is
 * Vercel Speed Insights. The browser side is src/components/ErrorReporting.tsx.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0,
  sendDefaultPii: false,
});
