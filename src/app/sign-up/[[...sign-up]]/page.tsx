import type { Metadata } from 'next';
import { SignUp } from '@clerk/nextjs';
import { HOME_PATH } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Create your account',
  robots: { index: false, follow: false },
};

/** See sign-in/[[...sign-in]]/page.tsx — the same page for a new account. */
export default function SignUpPage() {
  return (
    <div className="flex justify-center pt-4">
      <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" fallbackRedirectUrl={HOME_PATH} />
    </div>
  );
}
