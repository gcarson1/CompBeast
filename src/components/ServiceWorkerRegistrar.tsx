'use client';

import { useEffect } from 'react';

/**
 * Registers the push service worker on every page load.
 *
 * Registration has to happen before a device can be subscribed, and the
 * account page is the only place that subscribes — but the worker also has
 * to *stay* registered on the browsers that already are, which is why this
 * runs everywhere rather than only there. Registering an already-registered
 * worker is a no-op. Renders nothing.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.warn('[sw] registration failed', error);
    });
  }, []);
  return null;
}
