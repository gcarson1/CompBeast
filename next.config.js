const { withSentryConfig } = require('@sentry/nextjs/config');
const imageHosts = require('./image-hosts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Nothing useful is gained by announcing the framework in a response header.
  poweredByHeader: false,
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
      // Players are browsed per season; the bare list has no page of its own.
      { source: '/players', destination: '/seasons', permanent: true },
    ];
  },
  /**
   * Baseline hardening headers on every response. No Content-Security-Policy
   * yet: Clerk, Vercel Analytics and Speed Insights each inject scripts and
   * connect to their own origins, and a CSP that is not maintained alongside
   * them breaks sign-in on the next SDK update. The headers below have no
   * such moving parts.
   */
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // The email preview page frames its own templates; anything else
          // framing this app is clickjacking.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Full URL on same-origin navigation (the app reads `redirect_url`),
          // origin only when leaving — league ids do not belong in third-party
          // referrer logs.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          // Vercel already serves HSTS on *.vercel.app; this covers a custom
          // domain and is harmless where it duplicates.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
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
