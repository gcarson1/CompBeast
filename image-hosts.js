/**
 * Hosts whose images are allowed through Next's image optimizer.
 *
 * One list, read from two places: next.config.js turns it into
 * `images.remotePatterns` (the optimizer refuses every other host, which is
 * what stops the endpoint being used as a free proxy), and `<Avatar>` uses
 * it to decide whether a photo can go through `next/image` at all — an
 * unlisted host there would throw at render, so those fall back to a plain
 * `<img>`. Plain CommonJS because next.config.js cannot import TypeScript.
 *
 * - wp.bigbrotherjunkies.com: Big Brother headshots, from ingestion.
 * - www.paramountplus.com: Survivor headshots, from the network's own cast
 *   articles, via the Wikipedia adapter.
 * - www.nbc.com: The Traitors headshots, from NBC Insider's cast articles,
 *   via the same adapter pattern.
 * - img.clerk.com: member avatars, from the auth provider.
 */
module.exports = ['wp.bigbrotherjunkies.com', 'www.paramountplus.com', 'www.nbc.com', 'img.clerk.com'];
