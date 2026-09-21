import type { MetadataRoute } from 'next';
import { HOME_PATH, SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo';

/**
 * The web app manifest — what lets a phone put Comp Beast on the home screen
 * as an app: its own icon, its own window with no browser chrome, and the
 * name under the icon. On iOS it is also the precondition for push: Safari
 * only delivers Web Push to sites that have been added to the home screen.
 *
 * `start_url` is the home page, not `/`, so the installed app never spends
 * its first request on the redirect. Icons are rendered from the logo mark
 * by scripts/make-icons.ts; `maskable` is the one Android is allowed to crop.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: HOME_PATH,
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0F172A',
    theme_color: '#0F172A',
    categories: ['entertainment', 'games', 'sports'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
