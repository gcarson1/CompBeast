import webpush from 'web-push';
import { prisma } from '../lib/db';
import { appBaseUrl } from '../lib/site';
import type { DeliverableNotification } from './notification-email';

/**
 * Web Push: the third channel, after in-app and email.
 *
 * Same contract as email. **Unconfigured is a normal state, not an error**:
 * without VAPID keys nothing is sent, the account page hides the switch, and
 * the app behaves exactly as it did before push existed. And nothing here
 * may throw — this runs downstream of a draft pick.
 *
 * The keys are one pair per deployment (`npx web-push generate-vapid-keys`),
 * set as `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, with `VAPID_SUBJECT` as a
 * `mailto:` or `https:` contact the push services can reach us at. The public
 * half is handed to the browser at subscribe time by the account page, read
 * from the server at request time — so setting the keys never needs a
 * rebuild, and it never has to live in a `NEXT_PUBLIC_` variable.
 */

export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function pushPublicKey(): string | null {
  return isPushConfigured() ? (process.env.VAPID_PUBLIC_KEY as string) : null;
}

let vapidReady = false;
let warnedUnconfigured = false;

function configure(): boolean {
  if (!isPushConfigured()) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.info('[push] no VAPID keys — push notifications are not being sent');
    }
    return false;
  }
  if (!vapidReady) {
    const base = appBaseUrl();
    // The subject must be https or mailto; a localhost origin is neither.
    const subject =
      process.env.VAPID_SUBJECT || (base.startsWith('https://') ? base : 'mailto:hello@compbeast.app');
    webpush.setVapidDetails(
      subject,
      process.env.VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string,
    );
    vapidReady = true;
  }
  return true;
}

/** What the service worker receives; see public/sw.js. */
export interface PushPayload {
  title: string;
  body?: string;
  href: string;
  /** The notification id: a re-delivered alert replaces itself rather than stacking. */
  tag: string;
}

/**
 * Sends a batch of freshly written notifications to every device their
 * recipients have subscribed. Returns how many pushes were accepted.
 *
 * A 404 or 410 from a push service means that browser is gone — unsubscribed,
 * uninstalled, or the profile wiped — and the row is deleted so we stop
 * knocking. Any other failure is logged and the row kept: a service having a
 * bad minute is not a reason to forget a phone.
 */
export async function deliverNotificationPush(notifications: DeliverableNotification[]): Promise<number> {
  if (notifications.length === 0 || !configure()) return 0;

  try {
    const userIds = [...new Set(notifications.map((n) => n.userId))];
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: { in: userIds } },
      select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
    });
    if (subscriptions.length === 0) return 0;

    const byUser = new Map<string, typeof subscriptions>();
    for (const sub of subscriptions) {
      byUser.set(sub.userId, [...(byUser.get(sub.userId) ?? []), sub]);
    }

    let sent = 0;
    const dead: string[] = [];

    await Promise.all(
      notifications.flatMap((notification) =>
        (byUser.get(notification.userId) ?? []).map(async (sub) => {
          const payload: PushPayload = {
            title: notification.title,
            body: notification.body ?? undefined,
            href: notification.href ?? '/notifications',
            tag: notification.id,
          };
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify(payload),
              {
                // Six hours: an alert about a draft pick is worthless by tomorrow.
                TTL: 6 * 60 * 60,
                // The only alert somebody else is blocked on gets through a phone's battery saver.
                urgency: notification.type === 'LEAGUE_DRAFT_PICK_DUE' ? 'high' : 'normal',
              },
            );
            sent += 1;
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) dead.push(sub.id);
            else console.warn(`[push] send failed (${status ?? 'network'})`, error);
          }
        }),
      ),
    );

    if (dead.length > 0) {
      await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
    }
    return sent;
  } catch (error) {
    console.error('[push] delivery failed', error);
    return 0;
  }
}
