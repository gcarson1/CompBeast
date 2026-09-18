import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppHeader } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import { getCurrentUser } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Comp Beast',
  description: 'Fantasy leagues for reality TV.',
};

export const viewport: Viewport = {
  themeColor: '#f4f4f5',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null);

  return (
    <html lang="en">
      <body>
        <div className="flex min-h-dvh flex-col">
          <AppHeader userName={user?.name ?? null} />
          <main className="mx-auto w-full max-w-md flex-1 px-5 pb-6">{children}</main>
          <BottomNav />
        </div>
      </body>
    </html>
  );
}
