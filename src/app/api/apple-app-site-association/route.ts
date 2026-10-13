import { NextResponse } from 'next/server';

/**
 * The Apple App Site Association file, served at
 * /.well-known/apple-app-site-association (a rewrite in next.config.js).
 *
 * It is what lets the iOS app claim this domain:
 *
 * - **applinks** — a compbeast.app link tapped in Messages or Mail, or a
 *   league's QR code scanned with the Camera, opens the app at that page
 *   instead of Safari (src/lib/native.ts routes it). API routes and the
 *   one-click email unsubscribe stay in the browser.
 * - **webcredentials** — passwords saved for compbeast.app in iCloud Keychain
 *   are offered in the app's sign-in form, and passkeys work there.
 *
 * Apple identifies the app as `<Team ID>.<bundle id>`, so this needs
 * `APPLE_TEAM_ID` (Apple Developer account → Membership). Without it there is
 * no app to name, and the file is a 404 — which is also what Apple's CDN
 * expects from a site with no app. `APPLE_BUNDLE_ID` defaults to the
 * project's `app.compbeast` (capacitor.config.ts).
 */
export const dynamic = 'force-dynamic';

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  if (!teamId) return new NextResponse('Not found', { status: 404 });
  const appId = `${teamId}.${process.env.APPLE_BUNDLE_ID?.trim() || 'app.compbeast'}`;

  return NextResponse.json(
    {
      applinks: {
        details: [
          {
            appIDs: [appId],
            components: [
              { '/': '/api/*', exclude: true, comment: 'Machine endpoints' },
              { '/': '/_next/*', exclude: true, comment: 'Build assets' },
              { '/': '/unsubscribe*', exclude: true, comment: 'Works from any mail client' },
              { '/': '/*', comment: 'Every page of the app' },
            ],
          },
        ],
      },
      webcredentials: { apps: [appId] },
    },
    {
      headers: {
        // Apple's CDN refetches on its own schedule; an hour keeps a Team ID
        // change from lingering anywhere else.
        'Cache-Control': 'public, max-age=3600',
      },
    },
  );
}
