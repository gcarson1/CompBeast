'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { PullToRefresh } from '@/components/PullToRefresh';
import {
  NOTIFICATIONS_CHANGED,
  forgetPushToken,
  haptic,
  hasRegisteredPushToken,
  inAppPath,
  withShell,
  pushOptedOut,
  pushPermission,
  registerForPush,
  setAppBadge,
  type HapticKind,
} from '@/lib/native';

/** Coming back after longer than this re-renders the page, so standings are never an hour stale. */
const STALE_AFTER_MS = 60_000;

/**
 * Everything the iOS app does on every page, mounted only inside the app
 * (NativeBridgeLoader.tsx). Renders nothing.
 *
 * - tells the shell the page has painted, so the launch cover lifts;
 * - routes a universal link (a shared or scanned compbeast.app link) and a
 *   tapped push alert to their page, in place;
 * - keeps this phone registered for push while signed in, and retires its
 *   token on sign-out so the next person to use the phone does not get the
 *   last one's alerts;
 * - refreshes the page when the app comes back to the foreground;
 * - marks the document while the keyboard is up, so the tab bar can step
 *   aside (globals.css);
 * - says so when the connection drops and comes back, refreshing the page
 *   on return;
 * - gives taps on the tab bar, on primary buttons, on anything marked
 *   `data-haptic`, and every success or error toast a touch of the Taptic
 *   Engine;
 * - and renders the pull-to-refresh spinner (PullToRefresh.tsx).
 */
export default function NativeBridge({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();

  useEffect(() => {
    withShell((shell) => shell.ready()).catch(() => {});
  }, []);

  // Universal links, push taps, and coming back to the app.
  useEffect(() => {
    const handles: Array<{ remove: () => Promise<void> }> = [];
    let cancelled = false;
    let hiddenAt = 0;

    const go = (target: string | null) => {
      if (target) router.push(target);
    };

    void (async () => {
      const [{ App }, { PushNotifications }] = await Promise.all([
        import('@capacitor/app'),
        import('@capacitor/push-notifications'),
      ]);
      if (cancelled) return;
      handles.push(
        await App.addListener('appUrlOpen', ({ url }) => go(inAppPath(url, window.location.host))),
        await App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) {
            hiddenAt = Date.now();
          } else if (hiddenAt && Date.now() - hiddenAt > STALE_AFTER_MS) {
            router.refresh();
            window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
          }
        }),
        await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
          const href = (notification.data as { href?: unknown } | undefined)?.href;
          go(typeof href === 'string' && href.startsWith('/') ? href : '/notifications');
        }),
        await PushNotifications.addListener('pushNotificationReceived', () => {
          window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
        }),
      );
      if (cancelled) handles.forEach((handle) => void handle.remove());
    })().catch((error) => console.warn('[native] listeners failed', error));

    return () => {
      cancelled = true;
      handles.forEach((handle) => void handle.remove());
    };
  }, [router]);

  // Push registration follows the session.
  useEffect(() => {
    if (!signedIn) {
      if (hasRegisteredPushToken()) void forgetPushToken({ optOut: false });
      setAppBadge(0);
      return;
    }
    pushPermission()
      .then((permission) => {
        if (permission === 'granted' && !pushOptedOut()) return registerForPush();
      })
      .catch((error) => console.warn('[native] push registration failed', error));
  }, [signedIn]);

  // The keyboard, so the tab bar can get out of its way.
  useEffect(() => {
    const handles: Array<{ remove: () => Promise<void> }> = [];
    let cancelled = false;
    void (async () => {
      const { Keyboard } = await import('@capacitor/keyboard');
      if (cancelled) return;
      handles.push(
        await Keyboard.addListener('keyboardWillShow', () => {
          document.documentElement.dataset.keyboard = 'open';
        }),
        await Keyboard.addListener('keyboardWillHide', () => {
          delete document.documentElement.dataset.keyboard;
        }),
      );
    })().catch(() => {});
    return () => {
      cancelled = true;
      handles.forEach((handle) => void handle.remove());
    };
  }, []);

  // Haptics, from the markup rather than from every component.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const marked = target.closest<HTMLElement>('[data-haptic]');
      if (marked && !marked.matches(':disabled')) return haptic(marked.dataset.haptic as HapticKind);
      if (target.closest('.app-tabbar a, .btn-primary:not(:disabled)')) haptic('tap');
    };
    // Sonner marks each toast with its type as it mounts.
    const toasts = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement) || !node.matches('[data-sonner-toast]')) continue;
          const type = node.dataset.type;
          if (type === 'success') haptic('success');
          else if (type === 'error') haptic('error');
          else if (type === 'warning') haptic('warning');
        }
      }
    });
    document.addEventListener('click', onClick, { capture: true, passive: true });
    toasts.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener('click', onClick, { capture: true });
      toasts.disconnect();
    };
  }, []);

  // The connection, said once each way. While offline the page stays as it
  // was last loaded; on return it re-renders so nothing shown is stale.
  useEffect(() => {
    let lost = false;
    const onOffline = () => {
      lost = true;
      toast.warning("You're offline", {
        id: 'connectivity',
        description: 'Showing what was last loaded.',
        duration: Infinity,
      });
    };
    const onOnline = () => {
      if (!lost) return;
      lost = false;
      toast.success('Back online', { id: 'connectivity', description: undefined, duration: 2500 });
      router.refresh();
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [router]);

  return <PullToRefresh />;
}
