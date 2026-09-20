const imageHosts = require('./image-hosts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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

module.exports = nextConfig;
