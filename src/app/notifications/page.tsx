import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NotificationList } from '@/components/NotificationList';
import { getCurrentUser } from '@/lib/auth';
import { getNotifications } from '@/server/notifications';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/leagues');

  const notifications = await getNotifications(user.id);

  return (
    <div className="pt-2">
      <Link href="/leagues" className="text-xs text-muted">
        ← Home
      </Link>
      <h1 className="headline mb-4 mt-3 text-4xl">Alerts</h1>
      <NotificationList notifications={notifications} />
    </div>
  );
}
