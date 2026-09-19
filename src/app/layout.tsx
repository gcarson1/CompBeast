import type { Metadata, Viewport } from 'next';
import { Anton, Archivo } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from 'sonner';
import './globals.css';
import { AppHeader } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import { getCurrentUser } from '@/lib/auth';

/**
 * isPlatformAdmin still needs a server-side lookup (Clerk's client components
 * don't know our app's roles), so the layout keeps this one query and passes
 * only that flag down — everything else about "who is this" now comes from
 * Clerk's own components directly.
 */

const displayFont = Anton({
  subsets: ['latin'],
  weight: '400',
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
  variable: '--font-text',
});

export const metadata: Metadata = {
  title: 'Comp Beast',
  description: 'Fantasy leagues for reality TV.',
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

  return (
    <ClerkProvider>
      <html lang="en" className={`${displayFont.variable} ${textFont.variable}`}>
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
          <div className="flex min-h-dvh flex-col">
            <AppHeader isPlatformAdmin={user?.isPlatformAdmin ?? false} />
            <main id="main" className="mx-auto w-full max-w-md flex-1 px-5 pb-6 sm:max-w-lg">
              {children}
            </main>
            {user && <BottomNav />}
          </div>
          <Toaster theme="dark" position="top-center" richColors closeButton />
        </body>
      </html>
    </ClerkProvider>
  );
}
