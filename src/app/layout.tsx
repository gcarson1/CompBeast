import type { Metadata, Viewport } from 'next';
import { Anton, Archivo } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from 'sonner';
import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { AppHeader } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import { ErrorReporting } from '@/components/ErrorReporting';
import { JsonLd } from '@/components/JsonLd';
import { AmbientStickers } from '@/components/motion/AmbientStickers';
import { MotionProvider } from '@/components/motion/MotionProvider';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import { SiteFooter } from '@/components/SiteFooter';
import { getCurrentUser } from '@/lib/auth';
import { clerkAppearance, clerkLocalization } from '@/lib/clerk-appearance';
import { HOME_PATH, SITE_DESCRIPTION, SITE_NAME, siteGraph } from '@/lib/seo';
import { appBaseUrl } from '@/lib/site';
import { getUnreadNotificationCount } from '@/server/notifications';

/**
 * isPlatformAdmin still needs a server-side lookup (Clerk's client components
 * don't know our app's roles), so the layout keeps this one query and passes
 * only that flag down — everything else about "who is this" now comes from
 * Clerk's own components directly.
 */

// `display: 'swap'` and a named fallback on both faces: next/font fetches
// from Google at *build* time and, if that fetch fails, silently substitutes a
// metric-matched fallback and lets the build pass. Naming the fallback family
// means that degradation lands somewhere chosen rather than on whatever the
// host OS offers first.
const displayFont = Anton({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  fallback: ['Impact', 'Haettenschweiler', 'sans-serif'],
  variable: '--font-display',
});

/**
 * Body face. Archivo and Anton are both Omnibus-Type grotesques, so the
 * headline and text voices are genuinely related rather than an arbitrary
 * pairing — Anton reads as a condensed, heavy cut of the same skeleton.
 * Before this, only the display face was loaded and body text fell through to
 * whatever the OS happened to supply, which is why the app looked different on
 * every device.
 */
const textFont = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  fallback: ['-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
  variable: '--font-text',
});

/**
 * Site-wide defaults; each public page overrides title, description and
 * canonical. `metadataBase` is what turns every relative canonical and
 * Open Graph URL into the production address, on previews too — see
 * `appBaseUrl`. Private pages inherit the default title, which is fine: they
 * are kept out of the index by robots.ts rather than by their metadata.
 */
export const metadata: Metadata = {
  metadataBase: new URL(appBaseUrl()),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { siteName: SITE_NAME, type: 'website', locale: 'en_US' },
  twitter: { card: 'summary_large_image' },
  // Home-screen install. The manifest (src/app/manifest.ts) carries the rest;
  // iOS reads these two directly.
  icons: { apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#0F172A',
  width: 'device-width',
  initialScale: 1,
  // No maximumScale/userScalable cap. Pinch-zoom is the single most-used
  // accessibility affordance on a phone, and locking it is a WCAG 1.4.4
  // failure. A layout that needs a zoom lock to hold together is the bug.
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  // Server-rendered so the badge is correct on first paint rather than
  // popping in after a client fetch. The bell polls from here.
  const unreadCount = user ? await getUnreadNotificationCount(user.id).catch(() => 0) : 0;

  return (
    // Sign-in and sign-up are pages on this domain (src/app/sign-in, sign-up),
    // not Clerk's hosted portal; the middleware sends people to the same
    // paths. The fallbacks only apply when nothing else says where to go —
    // a `redirect_url` from the middleware or a form's forceRedirectUrl wins.
    <ClerkProvider
      appearance={clerkAppearance}
      localization={clerkLocalization}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl={HOME_PATH}
      signUpFallbackRedirectUrl={HOME_PATH}
    >
      <html lang="en" className={`${displayFont.variable} ${textFont.variable}`}>
        <head>
          {/* The Organization and WebSite nodes every page shares. In the
              head, not the body, so a crawler has the entity graph before it
              reads any content; Next merges its own metadata tags in here. */}
          <JsonLd data={siteGraph()} />
        </head>
        <body>
          {/* First tab stop on every page: lets keyboard users past the header
              and nav instead of tabbing the same chrome on each navigation. */}
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50
              focus:rounded-pill focus:bg-brand-gold focus:px-4 focus:py-2 focus:text-sm
              focus:font-semibold focus:text-on-gold"
          >
            Skip to content
          </a>
          {/* The column stays narrow by design, so on a wide screen the space
              around it needs to read as deliberate framing rather than as an
              unfinished layout. A single soft gold bloom behind the header
              does that without pretending to be a desktop redesign. */}
          <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,rgba(245,158,11,0.10),transparent_70%)]" />
          {/* Faint stickers drifting in the desktop gutters (see AmbientStickers.tsx). */}
          <AmbientStickers />
          {/* `min-h-svh`, not `dvh`: a phone's URL bar collapsing changes
              `dvh` mid-scroll, which resizes every screen under the reader's
              thumb. `data-bottom-nav` tells `.screen` how much fixed chrome
              to subtract (globals.css) — the nav only exists when signed in. */}
          <div className="flex min-h-svh flex-col" data-bottom-nav={Boolean(user)}>
            <AppHeader
              isPlatformAdmin={user?.isPlatformAdmin ?? false}
              signedIn={Boolean(user)}
              unreadCount={unreadCount}
            />
            {/* Framer's feature bundle, loaded once for every `m.*` tile below;
                the children stay server-rendered. The snap points are the
                `.screen` blocks inside each page, and every page's first
                screen carries its title — so the browser's re-snap after a
                layout change lands on the top of the page rather than on the
                first thing below the title. */}
            <main id="main" className="mx-auto w-full max-w-md flex-1 px-5 pb-4 sm:max-w-lg lg:max-w-3xl">
              <MotionProvider>{children}</MotionProvider>
            </main>
            <SiteFooter />
            {user && <BottomNav />}
          </div>
          <Toaster theme="dark" position="top-center" richColors closeButton />
          <ServiceWorkerRegistrar />
          <ErrorReporting />
          {/* Vercel's field analytics and Core Web Vitals. Both are inert until
              Web Analytics and Speed Insights are switched on for the project
              in the Vercel dashboard; each is one small script, loaded after
              the page is interactive. */}
          <Analytics />
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
