/**
 * The origin to build absolute links against.
 *
 * An email link has to be absolute and has to survive being opened days
 * later, so a preview deployment's URL is the wrong answer even when that is
 * where the code is running. The same holds for everything a crawler reads —
 * canonical URLs, the sitemap, structured data: a bot that reaches a preview
 * must be told the production address, never the preview's own. Vercel sets
 * `VERCEL_PROJECT_PRODUCTION_URL` to the production domain on *every*
 * deployment, which is what makes that work without a hand-maintained var.
 */
export function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;
  return 'http://localhost:3000';
}
