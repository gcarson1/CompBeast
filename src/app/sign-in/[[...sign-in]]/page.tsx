import type { Metadata } from 'next';
import { SignIn } from '@clerk/nextjs';
import { HOME_PATH } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

/**
 * Sign-in on our own domain.
 *
 * Before this, every protected route bounced to Clerk's hosted portal on
 * accounts.compbeast.app — a different-looking page on a different domain,
 * which is where "clunky" came from. The catch-all segment is Clerk's:
 * verification codes, second factors and the OAuth return leg are sub-paths
 * of /sign-in, and the component routes between them itself.
 *
 * `redirect_url` in the query (what the middleware sets when it sends
 * someone here) wins over the fallback, so a member sent here from a league
 * page lands back on that league page.
 */
export default function SignInPage() {
  return (
    <div className="flex justify-center pt-4">
      <SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" fallbackRedirectUrl={HOME_PATH} />
    </div>
  );
}
