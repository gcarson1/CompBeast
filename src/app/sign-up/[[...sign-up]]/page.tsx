import type { Metadata } from 'next';
import Link from 'next/link';
import { SignUp } from '@clerk/nextjs';
import { HOME_PATH } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Create your account',
  robots: { index: false, follow: false },
};

/** See sign-in/[[...sign-in]]/page.tsx — the same page for a new account. */
export default function SignUpPage() {
  return (
    <div className="flex flex-col items-center pt-4">
      <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" fallbackRedirectUrl={HOME_PATH} />
      {/* Said at the point of sign-up, where the account is created, and not
          only in a footer. Clerk can additionally require a ticked box here
          (Dashboard → Sign-up → Legal consent); this line stands regardless. */}
      <p className="mt-4 max-w-sm text-center text-2xs leading-relaxed text-muted">
        By creating an account you confirm you are at least 13 years old and agree to the{' '}
        <Link href="/terms" className="text-brand-gold-deep underline underline-offset-2">
          terms of service
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="text-brand-gold-deep underline underline-offset-2">
          privacy policy
        </Link>
        .
      </p>
    </div>
  );
}
