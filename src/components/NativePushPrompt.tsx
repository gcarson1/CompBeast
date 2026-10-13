'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { enablePush, isNativeApp, pushPermission } from '@/lib/native';

const DISMISSED_KEY = 'cb.push-prompt-dismissed';

/**
 * Asks once, in context, before iOS does.
 *
 * iOS shows its notification prompt a single time, ever; someone who taps
 * "Don't Allow" to a cold prompt at first launch has to dig through Settings
 * to undo it. So the app never fires the system prompt unprompted: this says
 * what the alerts are for, and only "Turn on alerts" brings up the real one.
 * Shown on the home screen of the iOS app until it is answered either way.
 */
export function NativePushPrompt() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      dismissed = false;
    }
    if (dismissed) return;
    pushPermission()
      .then((permission) => setVisible(permission === 'prompt'))
      .catch(() => {});
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Not remembered across launches, then; it still closes now.
    }
    setVisible(false);
  }

  async function turnOn() {
    setBusy(true);
    try {
      const result = await enablePush();
      if (result === 'granted') toast.success('Alerts are on. We will tap you when it matters.');
      dismiss();
    } catch (error) {
      console.error('[push] enable failed', error);
      toast.error("Couldn't turn on alerts. You can try again from the You tab.");
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <section className="callout mt-6" aria-labelledby="push-prompt">
      <h2 id="push-prompt" className="text-sm font-semibold">
        Know the moment your pick is due
      </h2>
      <p className="mt-1 max-w-measure text-2xs leading-relaxed text-muted">
        Comp Beast can alert you when a draft starts, when it is your turn, and when a friend invites you to a
        league. Nothing else.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={turnOn}
          disabled={busy}
          aria-busy={busy}
          className="btn-primary btn-sm"
        >
          {busy ? 'One moment…' : 'Turn on alerts'}
        </button>
        <button type="button" onClick={dismiss} disabled={busy} className="btn-ghost btn-sm">
          Not now
        </button>
      </div>
    </section>
  );
}
