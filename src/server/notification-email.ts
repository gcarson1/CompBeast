import { randomUUID } from 'node:crypto';
import type { NotificationType } from '@prisma/client';
import { prisma } from '../lib/db';
import { appBaseUrl, isEmailConfigured, sendEmails, type OutboundEmail } from '../lib/email/send';
import {
  CATEGORIES,
  categoryOf,
  renderNotificationEmail,
  type EmailCategory,
} from '../lib/email/templates';

/**
 * Turning notification rows into mail.
 *
 * Sits between `notify()` and the provider so that the delivery decision —
 * who wants this, in which channel, with what link — lives in one readable
 * place instead of being spread across every mutation that raises an alert.
 *
 * Like the rest of the notification path, nothing here is allowed to fail the
 * work that triggered it. An unreachable mail provider produces a log line.
 */

export interface DeliverableNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  href: string | null;
}

/**
 * Sends the emails for a batch of freshly written notifications.
 *
 * Returns how many went out, which the caller is free to ignore — it exists
 * for the tests and for the admin preview, not because anything branches on
 * it.
 */
export async function deliverNotificationEmails(
  notifications: DeliverableNotification[],
): Promise<number> {
  if (notifications.length === 0) return 0;

  try {
    const recipients = await prisma.user.findMany({
      where: { id: { in: [...new Set(notifications.map((n) => n.userId))] } },
      select: {
        id: true,
        email: true,
        emailNotifications: true,
        emailOptOut: true,
        emailToken: true,
      },
    });
    const byId = new Map(recipients.map((user) => [user.id, user]));

    const wanted = notifications.filter((notification) => {
      const user = byId.get(notification.userId);
      if (!user?.email) return false;
      if (!user.emailNotifications) return false;
      return !user.emailOptOut.includes(notification.type);
    });
    if (wanted.length === 0) return 0;

    // Fill in any missing unsubscribe keys before rendering, so every message
    // that goes out carries a working opt-out rather than most of them.
    const tokens = await ensureEmailTokens(
      [...new Set(wanted.map((n) => n.userId))].filter((id) => !byId.get(id)?.emailToken),
    );
    for (const [userId, token] of tokens) {
      const user = byId.get(userId);
      if (user) user.emailToken = token;
    }

    const baseUrl = appBaseUrl();
    const messages: OutboundEmail[] = wanted.map((notification) => {
      const user = byId.get(notification.userId)!;
      const rendered = renderNotificationEmail({
        type: notification.type,
        title: notification.title,
        body: notification.body,
        href: notification.href,
        baseUrl,
        emailToken: user.emailToken,
      });
      return {
        to: user.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        unsubscribeUrl: user.emailToken
          ? `${baseUrl}/api/unsubscribe?t=${encodeURIComponent(user.emailToken)}&c=${categoryOf(notification.type)}`
          : undefined,
      };
    });

    const result = await sendEmails(messages);
    if (result.sent > 0) {
      await prisma.notification.updateMany({
        where: { id: { in: wanted.map((n) => n.id) } },
        data: { emailedAt: new Date() },
      });
    }
    return result.sent;
  } catch (error) {
    // Deliberately swallowed: see the module comment.
    console.error('[email] could not deliver notification emails', error);
    return 0;
  }
}

/**
 * Hands every listed user an unsubscribe key, creating the ones that are
 * missing.
 *
 * The column is nullable so the migration needed no backfill, which pushes the
 * work here — to the first time we actually write to someone.
 */
async function ensureEmailTokens(userIds: string[]): Promise<Map<string, string>> {
  const filled = new Map<string, string>();
  for (const userId of userIds) {
    const token = randomUUID();
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { emailToken: token },
        select: { emailToken: true },
      });
      if (updated.emailToken) filled.set(userId, updated.emailToken);
    } catch {
      // A missing key costs this person the one-click link in one email, and
      // the footer still carries a link to their settings. Not worth failing
      // the send over.
    }
  }
  return filled;
}

export interface EmailPreferences {
  /** Master switch. */
  enabled: boolean;
  /** Per-category, already resolved from the stored per-type opt-out set. */
  categories: Record<EmailCategory, boolean>;
  /**
   * Whether this deploy can actually send. Surfaced so the settings screen can
   * say "no provider is configured yet" instead of offering switches that
   * govern nothing.
   */
  configured: boolean;
}

export async function getEmailPreferences(userId: string): Promise<EmailPreferences> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailNotifications: true, emailOptOut: true },
  });
  const optedOut = new Set(user?.emailOptOut ?? []);

  return {
    enabled: user?.emailNotifications ?? true,
    categories: Object.fromEntries(
      (Object.keys(CATEGORIES) as EmailCategory[]).map((key) => [
        key,
        // On unless every type inside it is off — a half-off category reads as
        // on, so toggling it once turns the remainder off rather than
        // silently re-enabling what somebody already declined.
        !CATEGORIES[key].types.every((type) => optedOut.has(type)),
      ]),
    ) as Record<EmailCategory, boolean>,
    configured: isEmailConfigured(),
  };
}

export async function setEmailPreference(
  userId: string,
  scope: 'all' | EmailCategory,
  enabled: boolean,
): Promise<void> {
  if (scope === 'all') {
    await prisma.user.update({ where: { id: userId }, data: { emailNotifications: enabled } });
    return;
  }

  const group = CATEGORIES[scope];
  if (!group) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailOptOut: true },
  });
  const optedOut = new Set(user?.emailOptOut ?? []);
  for (const type of group.types) {
    if (enabled) optedOut.delete(type);
    else optedOut.add(type);
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      emailOptOut: [...optedOut],
      // Turning a category back on while the master switch is off would
      // otherwise do nothing at all, which reads as a broken control.
      ...(enabled ? { emailNotifications: true } : {}),
    },
  });
}

/**
 * Applies an unsubscribe.
 *
 * Opting out of a category writes every type inside it, so the stored shape
 * stays per-type: adding a type to a category later then inherits the choice
 * somebody already expressed about that category, rather than arriving switched
 * on for people who told us to stop.
 */
export async function unsubscribeByToken(
  token: string,
  category: string | null,
): Promise<{ ok: boolean; scope: string }> {
  const user = await prisma.user.findUnique({
    where: { emailToken: token },
    select: { id: true, emailOptOut: true },
  });
  if (!user) return { ok: false, scope: '' };

  const group = category && category in CATEGORIES ? CATEGORIES[category as keyof typeof CATEGORIES] : null;

  if (!group) {
    await prisma.user.update({ where: { id: user.id }, data: { emailNotifications: false } });
    return { ok: true, scope: 'all email' };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailOptOut: [...new Set([...user.emailOptOut, ...group.types])] },
  });
  return { ok: true, scope: group.label.toLowerCase() };
}

export { isEmailConfigured };
