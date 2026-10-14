'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Tag } from '@/components/Tag';
import {
  enablePush,
  forgetPushToken,
  withShell,
  pushOptedOut,
  pushPermission,
  registerForPush,
} from '@/lib/native';

type State = 'checking' | 'prompt' | 'denied' | 'off' | 'on' | 'busy';

/**
 * "Push alerts on this iPhone" — the iOS app's counterpart of PushToggle.
 *
 * iOS owns the permission and asks exactly once, so the states are its:
 * not yet asked (a button that brings up the system prompt), refused (the
 * way back is the app's page in Settings, so that is the button), or allowed
 * — and then this phone is either registered with the server or switched
 * off here, which forgets its token without touching the iOS permission.
 */
export function NativePushToggle() {
  const [state, setState] = useState<State>('checking');

  const check = useCallback(() => {
    pushPermission()
      .then((permission) => {
        if (permission === 'granted') setState(pushOptedOut() ? 'off' : 'on');
        else setState(permission);
      })
      .catch(() => setState('prompt'));
  }, []);

  useEffect(() => {
    check();
    // Coming back from Settings: the permission may have changed there.
    const onVisible = () => {
      if (!document.hidden) check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [check]);

  async function turnOn() {
    setState('busy');
    try {
      if (state === 'off') {
        await registerForPush();
        setState('on');
      } else {
        const result = await enablePush();
        setState(result === 'granted' ? 'on' : result);
        if (result !== 'granted') return;
      }
      toast.success('Push alerts are on for this iPhone');
    } catch (error) {
      console.error('[push] enable failed', error);
      toast.error("Couldn't turn on push alerts. Check your connection and try again.");
      check();
    }
  }

  async function turnOff() {
    setState('busy');
    await forgetPushToken({ optOut: true });
    setState('off');
  }

  const description: Record<State, string> = {
    checking: 'Checking this iPhone…',
    prompt:
      'Get an alert on this iPhone when your pick is due, when a draft starts, and when a friend invites you.',
    denied:
      'Notifications are turned off for Comp Beast in your iPhone’s Settings. Turn them on there, then come back.',
    off: 'Alerts are switched off for this iPhone. Turn them back on any time.',
    on: 'This iPhone gets an alert when your pick is due, when a draft starts, and when a friend invites you.',
    busy: 'One moment…',
  };

  return (
    <div className="border-y border-hairline py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Push alerts on this iPhone</p>
          <p className="mt-1 max-w-measure text-2xs leading-relaxed text-muted">{description[state]}</p>
        </div>
        {state === 'on' ? (
          <Tag tone="gold" size="sm">
            On
          </Tag>
        ) : state === 'denied' || state === 'off' ? (
          <Tag tone="outline" size="sm">
            Off
          </Tag>
        ) : null}
      </div>
      {state === 'denied' ? (
        <button
          type="button"
          onClick={() =>
            withShell((shell) => shell.openSettings()).catch(() =>
              toast.error('Open Settings → Comp Beast → Notifications.'),
            )
          }
          className="btn-ghost btn-sm mt-3"
        >
          Open Settings
        </button>
      ) : state === 'checking' ? null : (
        <button
          type="button"
          onClick={state === 'on' ? turnOff : turnOn}
          disabled={state === 'busy'}
          aria-busy={state === 'busy'}
          data-haptic="tap"
          className={`${state === 'on' ? 'btn-ghost' : 'btn-primary'} btn-sm mt-3`}
        >
          {state === 'on' ? 'Turn off on this iPhone' : 'Turn on for this iPhone'}
        </button>
      )}
    </div>
  );
}
