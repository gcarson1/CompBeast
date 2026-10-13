import { generateKeyPairSync, verify } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { apnsPayload, deliverNotificationApns, isApnsConfigured, providerToken } from './notification-apns';

const notification = {
  id: 'ntf_123',
  userId: 'usr_1',
  type: 'LEAGUE_DRAFT_PICK_DUE' as const,
  title: "You're on the clock in Sunday Night Crew",
  body: 'Round 2, pick 9 of 40.',
  href: '/leagues/abc/draft',
};

describe('providerToken', () => {
  it('is an ES256 JWT naming the key and team, verifiable with the public key', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const now = Date.UTC(2026, 9, 13, 12);

    const token = providerToken(
      { keyId: 'ABC123DEFG', teamId: 'TEAM123456', privateKey: pem, bundleId: 'app.compbeast' },
      now,
    );
    const [header, claims, signature] = token.split('.');

    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'ES256',
      kid: 'ABC123DEFG',
    });
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toEqual({
      iss: 'TEAM123456',
      iat: Math.floor(now / 1000),
    });
    // 64 bytes: the raw r‖s pair JWS requires, not a DER signature.
    expect(Buffer.from(signature, 'base64url')).toHaveLength(64);
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${claims}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });

  it('is reused while young and replaced once it nears Apple’s hour', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const cfg = {
      keyId: 'REUSE00001',
      teamId: 'TEAM123456',
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      bundleId: 'app.compbeast',
    };
    const start = Date.UTC(2026, 9, 13, 12);
    const first = providerToken(cfg, start);
    expect(providerToken(cfg, start + 30 * 60 * 1000)).toBe(first);
    expect(providerToken(cfg, start + 51 * 60 * 1000)).not.toBe(first);
  });
});

describe('apnsPayload', () => {
  it('carries the alert, the badge and where tapping it should land', () => {
    expect(apnsPayload(notification, 3)).toEqual({
      aps: {
        alert: { title: notification.title, body: notification.body },
        sound: 'default',
        badge: 3,
        'thread-id': 'LEAGUE_DRAFT_PICK_DUE',
      },
      href: '/leagues/abc/draft',
      notificationId: 'ntf_123',
    });
  });

  it('sends a title-only alert, and the bell when there is nowhere better to go', () => {
    const payload = apnsPayload({ ...notification, body: null, href: null }, 0);
    expect(payload.aps.alert).toEqual({ title: notification.title });
    expect(payload.href).toBe('/notifications');
  });
});

describe('unconfigured', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('is a normal state: nothing is sent and nothing throws', async () => {
    delete process.env.APNS_KEY_ID;
    delete process.env.APNS_TEAM_ID;
    delete process.env.APNS_PRIVATE_KEY;
    expect(isApnsConfigured()).toBe(false);
    await expect(deliverNotificationApns([notification])).resolves.toBe(0);
  });

  it('reads a key whose newlines were flattened to \\n by the host’s env editor', () => {
    process.env.APNS_KEY_ID = 'ABC123DEFG';
    process.env.APNS_TEAM_ID = 'TEAM123456';
    process.env.APNS_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----';
    expect(isApnsConfigured()).toBe(true);
  });
});
