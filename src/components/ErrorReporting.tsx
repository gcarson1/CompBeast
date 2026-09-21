'use client';

import { useEffect } from 'react';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/**
 * Browser error reporting, loaded late on purpose.
 *
 * Sentry's browser SDK is ~30 KB gzipped — a third of this app's shared
 * first-load JavaScript, on the route a search engine reads. Bundling it
 * into the entry (what `sentry.client.config.ts` does) would hand that back
 * on every page for an integration that only matters when something has
 * already gone wrong. So the SDK is imported after the page is idle, and the
 * two global error events are buffered until it arrives, so a crash during
 * those first seconds is reported rather than lost.
 *
 * Renders nothing. Inert without `NEXT_PUBLIC_SENTRY_DSN`, like the server
 * side (src/instrumentation.ts).
 */
export function ErrorReporting() {
  useEffect(() => {
    if (!dsn) return;

    const buffered: Array<{ error: unknown; hint: string }> = [];
    const onError = (event: ErrorEvent) => buffered.push({ error: event.error ?? event.message, hint: 'error' });
    const onRejection = (event: PromiseRejectionEvent) =>
      buffered.push({ error: event.reason, hint: 'unhandledrejection' });
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    let cancelled = false;
    const start = async () => {
      const Sentry = await import('@sentry/nextjs');
      if (cancelled) return;
      Sentry.init({
        dsn,
        environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
        tracesSampleRate: 0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        sendDefaultPii: false,
      });
      // From here the SDK's own handlers own these events.
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      for (const { error, hint } of buffered.splice(0)) {
        Sentry.captureException(error, { mechanism: { type: hint, handled: false } });
      }
    };

    // Safari has no requestIdleCallback; a timer is the same idea, less precisely.
    const useIdle = typeof window.requestIdleCallback === 'function';
    const handle = useIdle
      ? window.requestIdleCallback(() => void start(), { timeout: 4000 })
      : window.setTimeout(() => void start(), 2500);

    return () => {
      cancelled = true;
      if (useIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}

/**
 * For the error boundaries: report through the SDK if it is configured, by
 * the same late import, so a boundary never pays the bundle cost either.
 */
export function reportError(error: unknown): void {
  if (!dsn) return;
  void import('@sentry/nextjs').then((Sentry) => {
    if (!Sentry.getClient()) {
      Sentry.init({ dsn, tracesSampleRate: 0, sendDefaultPii: false });
    }
    Sentry.captureException(error);
  });
}
