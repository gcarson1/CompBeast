import { redirect } from 'next/navigation';

/**
 * `/leagues` is home now — it carries the league rail *and* the live section
 * that used to be split across two routes. Every link into the app (the
 * logo, the bottom nav, the back links on every league page) already points
 * there, so the redirect goes this way round: one hop for someone typing the
 * bare domain, rather than a hop on every nav tap.
 */
export default function RootPage() {
  redirect('/leagues');
}
