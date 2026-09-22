'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Tag } from '@/components/Tag';

type State = 'checking' | 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on' | 'busy';

/**
 * "Turn on push notifications for this device."
 *
 * Push is per browser, not per account: the subscription lives in this
 * browser's push service, and the row we keep is that browser's address. So
 * this is a device switch, and it reads its state from the browser rather
 * than from the database — the browser is the one that knows.
 *
 * iOS is the special case worth a sentence of UI: Safari only offers push to
 * sites installed on the home screen, so in a plain Safari tab the API is
 * simply absent. Telling someone to install first is the difference between
 * a feature that works and a button that does nothing.
 */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      const iOS = /iP(hone|ad|od)/.test(navigator.userAgent);
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      setState(iOS && !standalone ? 'needs-install' : 'unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setState(subscription ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, []);

  async function enable() {
    setState('busy');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) throw new Error(`subscribe answered ${response.status}`);
      setState('on');
      toast.success('Push notifications are on for this device');
    } catch (error) {
      console.error('[push] enable failed', error);
      toast.error("Couldn't turn on push notifications on this device.");
      setState('off');
    }
  }

  async function disable() {
    setState('busy');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setState('off');
    } catch (error) {
      console.error('[push] disable failed', error);
      toast.error("Couldn't turn off push notifications.");
      setState('on');
    }
  }

  const description: Record<State, string> = {
    checking: 'Checking this device…',
    unsupported: 'This browser does not support push notifications.',
    'needs-install':
      'On iPhone and iPad, push works once Comp Beast is on your home screen: tap Share, then “Add to Home Screen”, and open it from there.',
    denied: `Notifications are blocked for ${typeof window === 'undefined' ? 'this site' : window.location.hostname} in this browser. Allow them in the browser’s site settings, then come back.`,
    off: 'Get an alert on this device when your pick is due, when a draft starts, and when a friend invites you.',
    on: 'This device gets an alert when your pick is due, when a draft starts, and when a friend invites you.',
    busy: 'One moment…',
  };

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Push notifications on this device</p>
          <p className="mt-1 max-w-measure text-2xs leading-relaxed text-muted">{description[state]}</p>
        </div>
        {state === 'on' ? (
          <Tag tone="gold" size="sm">
            On
          </Tag>
        ) : state === 'off' || state === 'busy' ? null : (
          <Tag tone="outline" size="sm">
            Off
          </Tag>
        )}
      </div>
      {(state === 'off' || state === 'on' || state === 'busy') && (
        <button
          type="button"
          onClick={state === 'on' ? disable : enable}
          disabled={state === 'busy'}
          aria-busy={state === 'busy'}
          className={`${state === 'on' ? 'btn-ghost' : 'btn-primary'} btn-sm mt-3`}
        >
          {state === 'on' ? 'Turn off on this device' : 'Turn on for this device'}
        </button>
      )}
    </div>
  );
}

/**
 * The VAPID public key arrives URL-safe base64; `subscribe` wants raw bytes.
 * Built on an explicit ArrayBuffer so the type is a `BufferSource` in TS 5.7+,
 * where a bare Uint8Array may be backed by a SharedArrayBuffer.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
