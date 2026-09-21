import { captureRequestError } from '@sentry/nextjs';

/**
 * Next's instrumentation hook: runs once per server runtime at boot. Only
 * the Node runtime loads Sentry — the edge runtime here is the Clerk
 * middleware, and 70 KB of SDK on every edge invocation is a poor trade for
 * errors that Clerk already reports itself. `onRequestError` reports an
 * error thrown while rendering a server component or route handler — the
 * errors the client boundary in app/error.tsx only ever sees the shape of.
 * The browser side is src/components/ErrorReporting.tsx.
 *
 * The config import is dynamic and gated on the runtime because this file
 * is bundled for every runtime; the one named import above is what
 * tree-shaking keeps of the SDK in the edge bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
}

export const onRequestError: typeof captureRequestError = async (...args) => {
  // Inert without a DSN; `NEXT_RUNTIME` is a build-time constant per bundle,
  // so this branch is statically dead in the edge bundle.
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  return captureRequestError(...args);
};
