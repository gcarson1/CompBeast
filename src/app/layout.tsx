import type { Metadata, Viewport } from 'next';
import { Anton } from 'next/font/google';
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

export const metadata: Metadata = {
  title: 'Comp Beast',
  description: 'Fantasy leagues for reality TV.',
};

export const viewport: Viewport = {
  themeColor: '#0F172A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null);

  return (
    <ClerkProvider>
      <html lang="en" className={displayFont.variable}>
        <body>
          <div className="flex min-h-dvh flex-col">
            <AppHeader isPlatformAdmin={user?.isPlatformAdmin ?? false} />
            <main className="mx-auto w-full max-w-md flex-1 px-5 pb-6">{children}</main>
            <BottomNav />
          </div>
          <Toaster theme="dark" position="top-center" richColors closeButton />
        </body>
      </html>
    </ClerkProvider>
  );
}
