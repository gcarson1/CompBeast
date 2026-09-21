/*
 * Comp Beast service worker.
 *
 * Push only. It deliberately caches nothing: every page here is rendered per
 * request from the database, and a cache in front of that would show people
 * standings that have since moved. What it does is receive a push message
 * (see src/server/notification-push.ts for the payload) and show it, then
 * open or focus the app at the right place when the notification is tapped.
 */

self.addEventListener('install', () => {
  // Take over from any earlier version immediately; there is no cache to warm.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Comp Beast', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Comp Beast';
  const options = {
    body: payload.body || undefined,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    // Same tag as the in-app notification id, so a redelivery replaces
    // itself instead of stacking two copies of one alert.
    tag: payload.tag || undefined,
    renotify: Boolean(payload.tag),
    data: { href: payload.href || '/notifications' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || '/notifications';
  const target = new URL(href, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Reuse an open Comp Beast window rather than opening a second one.
      for (const client of windows) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
