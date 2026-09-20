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
 * - wp.bigbrotherjunkies.com: contestant headshots, from ingestion.
 * - img.clerk.com: member avatars, from the auth provider.
 */
module.exports = ['wp.bigbrotherjunkies.com', 'img.clerk.com'];
