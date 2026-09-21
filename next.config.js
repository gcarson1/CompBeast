const { withSentryConfig } = require('@sentry/nextjs');
const imageHosts = require('./image-hosts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // src/instrumentation.ts — boots Sentry per runtime. Still behind a flag
    // on Next 14.
    instrumentationHook: true,
    // The Open Graph renderer reads the two brand faces from disk; make sure
    // the serverless bundles for those routes carry the files.
    outputFileTracingIncludes: {
      '/opengraph-image': ['./src/lib/og/fonts/*.ttf'],
      '/seasons/[slug]/opengraph-image': ['./src/lib/og/fonts/*.ttf'],
      '/players/[contestantId]/opengraph-image': ['./src/lib/og/fonts/*.ttf'],
      '/api/og/join': ['./src/lib/og/fonts/*.ttf'],
    },
  },
  images: {
    // Cast photos arrive as ~25 KB JPEGs at 375px and are drawn at 56px.
    // Through the optimizer they leave as WebP/AVIF at the rendered size.
    remotePatterns: imageHosts.map((hostname) => ({ protocol: 'https', hostname })),
  },
  async redirects() {
    return [
      // `/leagues` is home (see src/app/page.tsx). Answered here, at the edge,
      // rather than by `redirect()` inside the page: a redirect thrown from a
      // server component after the shell has started streaming cannot change
      // the status code any more, so `/` was reaching crawlers as a 200 with
      // a loading skeleton and no content. A 308 consolidates every signal
      // pointed at the bare domain onto the page that actually carries it.
      { source: '/', destination: '/leagues', permanent: true },
    ];
  },
};

/**
 * Sentry's build step. With no `SENTRY_AUTH_TOKEN` in the environment it
 * uploads nothing and only wraps the runtime; the `bundleSizeOptimizations`
 * strip the tracing and replay code the configs never enable, which is what
 * keeps the client cost to error reporting alone.
 */
module.exports = withSentryConfig(nextConfig, {
  // No sentry.client.config.ts on purpose: the browser SDK is imported late
  // by src/components/ErrorReporting.tsx instead of bundled into the entry.
  // And no edge wrapping: the middleware is Clerk's, and wrapping it pulled
  // 75 KB of SDK into every edge invocation for errors Clerk reports itself.
  webpack: { autoInstrumentMiddleware: false, treeshake: { removeDebugLogging: true } },
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  telemetry: false,
  widenClientFileUpload: false,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeTracing: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
    excludeReplayWorker: true,
  },
});
