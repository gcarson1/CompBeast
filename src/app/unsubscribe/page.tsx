import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { CATEGORIES } from '@/lib/email/templates';
import { unsubscribeByToken } from '@/server/notification-email';

export const dynamic = 'force-dynamic';

/**
 * The unsubscribe link in an email footer.
 *
 * Asks before it acts, which is the whole reason this page exists alongside
 * the one-click POST route. Corporate mail scanners and link previewers fetch
 * every URL in a message; if opting out happened on GET, people would be
 * unsubscribed by software they have never heard of, and would have no idea
 * why the alerts stopped.
 *
 * Unauthenticated by design. Somebody who wants to stop receiving mail should
 * not have to remember a password first — the token in the link is what
 * identifies them, and the worst it can do is turn off their own email.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: { t?: string; c?: string; done?: string };
}) {
  const token = searchParams.t ?? '';
  const category = searchParams.c ?? null;
  const group = category && category in CATEGORIES ? CATEGORIES[category as keyof typeof CATEGORIES] : null;
  // "emails about drafts" rather than "drafts emails" — the category labels are
  // plural nouns, and they only read as English with the preposition.
  const scope = group ? `emails about ${group.label.toLowerCase()}` : 'all Comp Beast email';

  if (searchParams.done) {
    return (
      <Shell title="Unsubscribed">
        <p className="max-w-measure text-sm leading-relaxed text-muted">
          You will stop getting {scope} from Comp Beast. Alerts still appear in the app, and you can turn
          email back on any time from your account.
        </p>
        <Link href="/account#email" className="btn-primary btn-sm mt-5">
          Email settings
        </Link>
      </Shell>
    );
  }

  if (!token) {
    return (
      <Shell title="That link is incomplete">
        <p className="max-w-measure text-sm leading-relaxed text-muted">
          The unsubscribe link was missing its key. You can change the same settings from your account page.
        </p>
        <Link href="/account#email" className="btn-primary btn-sm mt-5">
          Email settings
        </Link>
      </Shell>
    );
  }

  return (
    <Shell title={group ? `Stop ${scope}?` : 'Stop all emails?'}>
      <p className="max-w-measure text-sm leading-relaxed text-muted">
        {group
          ? `${group.description} Those will still show up in the app — just not in your inbox.`
          : 'You will stop getting every email from Comp Beast. Alerts will still show up in the app.'}
      </p>

      <form
        action={async (formData: FormData) => {
          'use server';
          const chosen = (formData.get('category') as string | null) || null;
          await unsubscribeByToken(String(formData.get('token') ?? ''), chosen);
          revalidatePath('/account');
          // The outcome is carried in the URL rather than in component state,
          // which keeps this a plain server component and makes a reload of
          // the confirmation page harmless.
          redirect(`/unsubscribe?done=1${chosen ? `&c=${encodeURIComponent(chosen)}` : ''}`);
        }}
        className="mt-5 flex flex-col gap-2 sm:flex-row"
      >
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="category" value={category ?? ''} />
        <button type="submit" className="btn-primary w-full sm:w-auto">
          Yes, unsubscribe
        </button>
        <Link href="/account#email" className="btn-ghost w-full text-center sm:w-auto">
          Keep them, open settings
        </Link>
      </form>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-10">
      <div className="border-y border-hairline py-6">
        <h1 className="headline text-3xl">{title}</h1>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}
