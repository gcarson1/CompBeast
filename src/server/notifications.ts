import type { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../lib/db';
import { background } from './background';
import { deliverNotificationEmails } from './notification-email';
import { deliverNotificationPush } from './notification-push';

/**
 * Notification delivery.
 *
 * One rule governs this whole module: **a notification must never be able to
 * fail the thing it is reporting on.** Nobody's league creation should roll
 * back because an alert row could not be written. So `notify` swallows its own
 * errors, and every caller invokes it *after* the primary write has committed,
 * never inside the transaction — inside, a failed insert would poison the
 * transaction and take the real work down with it, which is the exact outcome
 * the swallow is there to prevent.
 */

export interface NotifyInput {
  /** Recipient. */
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** Where tapping it should land. */
  href?: string;
  /** Whoever caused it, for the avatar. */
  actorId?: string;
  data?: Prisma.InputJsonValue;
}

/**
 * Writes one or many notifications. Returns how many landed, which callers are
 * free to ignore.
 *
 * Self-notifications are dropped here rather than at each call site. A
 * commissioner does not need telling that they themselves changed the league
 * settings, and catching it centrally means a new notification type cannot
 * reintroduce the bug.
 */
export async function notify(inputs: NotifyInput | NotifyInput[]): Promise<number> {
  const rows = (Array.isArray(inputs) ? inputs : [inputs]).filter(
    (row) => row.userId !== row.actorId,
  );
  if (rows.length === 0) return 0;

  try {
    // `createManyAndReturn` rather than `createMany`: the email layer needs
    // the ids to record what it sent, and a second round trip to find rows we
    // just wrote would be pure waste.
    const created = await prisma.notification.createManyAndReturn({
      data: rows.map((row) => ({
        userId: row.userId,
        type: row.type,
        title: row.title,
        body: row.body,
        href: row.href,
        actorId: row.actorId,
        data: row.data,
      })),
      select: { id: true, userId: true, type: true, title: true, body: true, href: true },
    });

    background(deliverNotificationEmails(created));
    background(deliverNotificationPush(created));
    return created.length;
  } catch (error) {
    // Deliberately not rethrown. See the module comment.
    console.error('[notify] could not write notifications', error);
    return 0;
  }
}

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: Date;
  readAt: Date | null;
  actorName: string | null;
  actorAvatarUrl: string | null;
}

/** Newest first. Read and unread together — a read alert is still history. */
export async function getNotifications(userId: string, limit = 50): Promise<NotificationView[]> {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      href: true,
      createdAt: true,
      readAt: true,
      actor: { select: { name: true, handle: true, avatarUrl: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: row.href,
    createdAt: row.createdAt,
    readAt: row.readAt,
    actorName: row.actor?.name ?? row.actor?.handle ?? null,
    actorAvatarUrl: row.actor?.avatarUrl ?? null,
  }));
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/**
 * Marks one notification read.
 *
 * Scoped by `userId` in the WHERE rather than fetched-then-checked: an id from
 * a form is attacker-controlled, and `updateMany` with both columns makes
 * "someone else's notification" a zero-row no-op instead of a leak.
 */
export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}
