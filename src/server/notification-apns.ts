import { sign } from 'node:crypto';
import { connect, type ClientHttp2Session } from 'node:http2';
import { prisma } from '../lib/db';
import type { DeliverableNotification } from './notification-email';

/**
 * Apple Push Notification service: the fourth channel, for the iOS app.
 *
 * Same contract as email and Web Push. **Unconfigured is a normal state, not
 * an error**: without a key nothing is sent and the app hides its push
 * switch. And nothing here may throw — this runs downstream of a draft pick.
 *
 * Token-based auth (a .p8 key from the Apple Developer account, Certificates,
 * IDs & Profiles → Keys, with "Apple Push Notifications service" ticked):
 *
 *   APNS_KEY_ID        the key's 10-character id
 *   APNS_TEAM_ID       the developer account's 10-character Team ID
 *   APNS_PRIVATE_KEY   the .p8 file's contents (newlines may be written as \n)
 *   APNS_BUNDLE_ID     optional; the app's bundle id, `app.compbeast` by default
 *
 * One key serves both of Apple's gateways. A phone's token belongs to one of
 * them — production for App Store and TestFlight builds, sandbox for a build
 * run from Xcode — and the app cannot tell which, so a token is tried on
 * production first and moved to sandbox if production does not know it.
 */

const GATEWAYS = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
} as const;
type Gateway = keyof typeof GATEWAYS;

/** Six hours, as for Web Push: an alert about a draft pick is worthless by tomorrow. */
const TTL_SECONDS = 6 * 60 * 60;
const REQUEST_TIMEOUT_MS = 10_000;

interface ApnsConfig {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
}

function config(): ApnsConfig | null {
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const privateKey = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if (!keyId || !teamId || !privateKey) return null;
  return { keyId, teamId, privateKey, bundleId: process.env.APNS_BUNDLE_ID?.trim() || 'app.compbeast' };
}

export function isApnsConfigured(): boolean {
  return config() !== null;
}

let cachedJwt: { token: string; issuedAt: number; keyId: string } | null = null;

/**
 * The provider token APNs authenticates every request with: an ES256 JWT
 * naming the key and the team. Apple wants it refreshed between 20 and 60
 * minutes old, and rejects one refreshed more often than every 20, so a warm
 * function reuses it for 50.
 */
export function providerToken(cfg: ApnsConfig, now = Date.now()): string {
  if (cachedJwt && cachedJwt.keyId === cfg.keyId && now - cachedJwt.issuedAt < 50 * 60 * 1000) {
    return cachedJwt.token;
  }
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId }));
  const claims = base64url(JSON.stringify({ iss: cfg.teamId, iat: Math.floor(now / 1000) }));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), {
    key: cfg.privateKey,
    // JWS wants the raw r‖s pair, not the DER structure Node signs with by default.
    dsaEncoding: 'ieee-p1363',
  });
  const token = `${header}.${claims}.${base64url(signature)}`;
  cachedJwt = { token, issuedAt: now, keyId: cfg.keyId };
  return token;
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

/** What the app receives. `href` is read by src/lib/native.ts when the alert is tapped. */
export function apnsPayload(notification: DeliverableNotification, badge: number) {
  return {
    aps: {
      alert: { title: notification.title, ...(notification.body ? { body: notification.body } : {}) },
      sound: 'default',
      badge,
      // Alerts about the same kind of thing stack together in Notification Center.
      'thread-id': notification.type,
    },
    href: notification.href ?? '/notifications',
    notificationId: notification.id,
  };
}

interface ApnsResult {
  status: number;
  reason?: string;
}

function send(
  session: ClientHttp2Session,
  cfg: ApnsConfig,
  token: string,
  notification: DeliverableNotification,
  badge: number,
): Promise<ApnsResult> {
  return new Promise((resolve) => {
    const request = session.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${providerToken(cfg)}`,
      'apns-topic': cfg.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + TTL_SECONDS),
      // The notification id: a re-delivered alert replaces itself rather than stacking.
      'apns-collapse-id': notification.id.slice(0, 64),
      'content-type': 'application/json',
    });
    let status = 0;
    let body = '';
    request.setEncoding('utf8');
    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.close());
    request.on('response', (headers) => {
      status = Number(headers[':status'] ?? 0);
    });
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      let reason: string | undefined;
      try {
        reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined;
      } catch {
        reason = undefined;
      }
      resolve({ status, reason });
    });
    request.on('error', (error) => resolve({ status: 0, reason: error.message }));
    request.end(JSON.stringify(apnsPayload(notification, badge)));
  });
}

/**
 * Sends a batch of freshly written notifications to every iPhone their
 * recipients have registered. Returns how many APNs accepted.
 *
 * 410 means the app was deleted, and the row goes. A token production does
 * not recognise is tried on sandbox; if neither knows it, it goes too. Any
 * other failure is logged and the row kept.
 */
export async function deliverNotificationApns(notifications: DeliverableNotification[]): Promise<number> {
  const cfg = config();
  if (notifications.length === 0 || !cfg) return 0;

  const sessions = new Map<Gateway, ClientHttp2Session>();
  const sessionFor = (gateway: Gateway) => {
    let session = sessions.get(gateway);
    if (!session || session.closed || session.destroyed) {
      session = connect(GATEWAYS[gateway]);
      // A failed connection surfaces as each request's error; this only
      // stops it being an unhandled 'error' event on the session.
      session.on('error', (error) => console.warn(`[apns] ${gateway} connection failed`, error.message));
      sessions.set(gateway, session);
    }
    return session;
  };

  try {
    const userIds = [...new Set(notifications.map((n) => n.userId))];
    const tokens = await prisma.nativePushToken.findMany({
      where: { userId: { in: userIds } },
      select: { id: true, userId: true, token: true, environment: true },
    });
    if (tokens.length === 0) return 0;

    // The icon badge is the unread count, as the bell shows it — counted
    // after these notifications were written, so they are included.
    const unread = await prisma.notification.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, readAt: null },
      _count: { _all: true },
    });
    const badgeFor = new Map(unread.map((row) => [row.userId, row._count._all]));

    let sent = 0;
    const dead = new Set<string>();
    const movedToSandbox = new Set<string>();
    const movedToProduction = new Set<string>();

    await Promise.all(
      notifications.flatMap((notification) =>
        tokens
          .filter((row) => row.userId === notification.userId)
          .map(async (row) => {
            const badge = badgeFor.get(row.userId) ?? 0;
            const first: Gateway = row.environment === 'sandbox' ? 'sandbox' : 'production';
            const other: Gateway = first === 'production' ? 'sandbox' : 'production';

            let result = await send(sessionFor(first), cfg, row.token, notification, badge);
            if (result.status === 400 && result.reason === 'BadDeviceToken') {
              result = await send(sessionFor(other), cfg, row.token, notification, badge);
              if (result.status === 200)
                (other === 'sandbox' ? movedToSandbox : movedToProduction).add(row.id);
            }

            if (result.status === 200) {
              sent += 1;
            } else if (
              result.status === 410 ||
              (result.status === 400 &&
                (result.reason === 'BadDeviceToken' || result.reason === 'DeviceTokenNotForTopic'))
            ) {
              dead.add(row.id);
            } else {
              console.warn(`[apns] send failed (${result.status || 'network'} ${result.reason ?? ''})`);
            }
          }),
      ),
    );

    if (dead.size > 0) await prisma.nativePushToken.deleteMany({ where: { id: { in: [...dead] } } });
    if (movedToSandbox.size > 0) {
      await prisma.nativePushToken.updateMany({
        where: { id: { in: [...movedToSandbox] } },
        data: { environment: 'sandbox' },
      });
    }
    if (movedToProduction.size > 0) {
      await prisma.nativePushToken.updateMany({
        where: { id: { in: [...movedToProduction] } },
        data: { environment: 'production' },
      });
    }
    return sent;
  } catch (error) {
    console.error('[apns] delivery failed', error);
    return 0;
  } finally {
    for (const session of sessions.values()) session.close();
  }
}
