import { permanentRedirect } from 'next/navigation';

/**
 * `/leagues` is home — it carries the league rail *and* the live section
 * that used to be split across two routes. Every link into the app (the
 * logo, the bottom nav, the back links on every league page) already points
 * there, so the redirect goes this way round: one hop for someone typing the
 * bare domain, rather than a hop on every nav tap.
 *
 * In practice the hop is answered by the `redirects()` entry in
 * next.config.js before this component ever runs, with a real 308 status. This
 * stays as the fallback that keeps `/` defined if that entry is ever removed.
 */
export default function RootPage() {
  permanentRedirect('/leagues');
}
