/**
 * The web side of the iOS app.
 *
 * The app is this website in a native shell (capacitor.config.ts), and the
 * shell injects a bridge into the page — `window.Capacitor`. Everything here
 * checks for it first and does nothing without it, so on the website every
 * export is a no-op, and the plugin code is only ever fetched inside the app
 * (each plugin is a dynamic import).
 *
 * The server knows too, from the user agent (src/lib/native-server.ts), which
 * is how a page renders the app's version of itself on the first paint.
 */

/** The shell's own methods: ios/App/App/NativeShellPlugin.swift. */
interface NativeShellPlugin {
  /** The page has painted: lift the launch cover. */
  ready(): Promise<void>;
  setBadgeCount(options: { count: number }): Promise<void>;
  /** This app's notification settings, for someone who once said no. */
  openSettings(): Promise<void>;
}

/** Whether this page is running inside the Comp Beast iOS app. */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const capacitor = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return capacitor?.isNativePlatform?.() === true;
}

/** Fired when the app learns of new alerts, so the bell refreshes at once (NotificationBell.tsx). */
export const NOTIFICATIONS_CHANGED = 'cb:notifications-changed';

/**
 * The page inside the app for a link the system handed over (a universal
 * link). Only this site's own links: anything else is not ours to open.
 * `currentHost` is the host the app is running on, for a development build
 * pointed at a local server.
 */
export function inAppPath(url: string, currentHost?: string): string | null {
  try {
    const parsed = new URL(url);
    const ours =
      (currentHost !== undefined && parsed.host === currentHost) ||
      parsed.hostname === 'compbeast.app' ||
      parsed.hostname.endsWith('.compbeast.app');
    if (!ours || !/^https?:$/.test(parsed.protocol)) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

let shell: NativeShellPlugin | null = null;

/**
 * Calls one of the shell's methods: `withShell((shell) => shell.ready())`.
 *
 * Never hands the plugin itself back through a promise. A Capacitor plugin
 * answers *any* property as a native method, so a promise resolving to one
 * asks it for `.then` — "NativeShell.then() is not implemented" — and the
 * call never happens. Only the method's own result travels through here.
 */
export async function withShell<T>(use: (shell: NativeShellPlugin) => Promise<T>): Promise<T> {
  if (!shell) {
    const { registerPlugin } = await import('@capacitor/core');
    shell = registerPlugin<NativeShellPlugin>('NativeShell');
  }
  return use(shell);
}

// ---------------------------------------------------------------------------
// Haptics
// ---------------------------------------------------------------------------

export type HapticKind = 'tap' | 'press' | 'success' | 'warning' | 'error';

/**
 * A tap of the Taptic Engine. `tap` for switching tabs and toggling,
 * `press` for a committing action, and the three outcomes for results —
 * the same vocabulary as UIKit's feedback generators.
 */
export function haptic(kind: HapticKind): void {
  if (!isNativeApp()) return;
  import('@capacitor/haptics')
    .then(({ Haptics, ImpactStyle, NotificationType }) => {
      if (kind === 'tap') return Haptics.impact({ style: ImpactStyle.Light });
      if (kind === 'press') return Haptics.impact({ style: ImpactStyle.Medium });
      const type = {
        success: NotificationType.Success,
        warning: NotificationType.Warning,
        error: NotificationType.Error,
      }[kind];
      return Haptics.notification({ type });
    })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// The app icon's badge
// ---------------------------------------------------------------------------

/**
 * Sets the number on the app's icon to the unread count. In the iOS app
 * that is the shell's badge; in a browser that supports the Badging API — an
 * installed web app on iOS, Android or desktop — it is the same thing there.
 */
export function setAppBadge(count: number): void {
  if (typeof window === 'undefined') return;
  if (isNativeApp()) {
    withShell((plugin) => plugin.setBadgeCount({ count })).catch(() => {});
    return;
  }
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  const update = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.();
  update?.catch(() => {});
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

/** Whether this device has a share sheet: always in the app, and in browsers with the Web Share API. */
export function canShare(): boolean {
  if (typeof window === 'undefined') return false;
  return isNativeApp() || typeof navigator.share === 'function';
}

/**
 * Opens the share sheet. Resolves true when something was shared, false when
 * the person backed out — which is not an error and should not toast as one.
 */
export async function share(data: { title: string; text: string; url: string }): Promise<boolean> {
  try {
    if (isNativeApp()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ ...data, dialogTitle: data.title });
      return true;
    }
    await navigator.share(data);
    return true;
  } catch (error) {
    const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
    if (/abort|cancel/i.test(message)) return false;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Push notifications (APNs)
// ---------------------------------------------------------------------------

export type PushPermission = 'prompt' | 'granted' | 'denied';

/** Where the app keeps the token it registered, so signing out can retire it. */
const TOKEN_KEY = 'cb.apns-token';
/** Set when someone switches alerts off in the app while iOS still allows them. */
const OPTED_OUT_KEY = 'cb.apns-off';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private storage unavailable: the server-side row is what counts anyway.
  }
}

export async function pushPermission(): Promise<PushPermission> {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  const { receive } = await PushNotifications.checkPermissions();
  if (receive === 'granted' || receive === 'denied') return receive;
  return 'prompt';
}

export function pushOptedOut(): boolean {
  return readStorage(OPTED_OUT_KEY) === '1';
}

/**
 * Asks iOS for a device token and hands it to the server. Resolves once the
 * server has it — or rejects, if iOS or the server said no. Safe to call on
 * every launch: the same token just refreshes its row.
 */
export async function registerForPush(): Promise<void> {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  const token = await new Promise<string>((resolve, reject) => {
    const handles = Promise.all([
      PushNotifications.addListener('registration', ({ value }) => {
        void handles.then((all) => all.forEach((handle) => handle.remove()));
        resolve(value);
      }),
      PushNotifications.addListener('registrationError', ({ error }) => {
        void handles.then((all) => all.forEach((handle) => handle.remove()));
        reject(new Error(error));
      }),
    ]);
    // Listeners first: iOS can answer before `register` resolves.
    void handles.then(() => PushNotifications.register()).catch(reject);
  });

  const response = await fetch('/api/push/native', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform: 'ios' }),
  });
  if (!response.ok) throw new Error(`register answered ${response.status}`);
  writeStorage(TOKEN_KEY, token);
  writeStorage(OPTED_OUT_KEY, null);
}

/** Asks iOS for permission (the one system prompt it allows), then registers. */
export async function enablePush(): Promise<PushPermission> {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  const { receive } = await PushNotifications.requestPermissions();
  if (receive !== 'granted') return receive === 'denied' ? 'denied' : 'prompt';
  await registerForPush();
  return 'granted';
}

/**
 * Stops alerts reaching this phone: the server forgets its token. Used both
 * when someone switches alerts off and when they sign out — the token must
 * not keep delivering one person's alerts to a phone they have left.
 */
export async function forgetPushToken({ optOut }: { optOut: boolean }): Promise<void> {
  const token = readStorage(TOKEN_KEY);
  if (optOut) writeStorage(OPTED_OUT_KEY, '1');
  if (!token) return;
  await fetch('/api/push/native', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  }).catch(() => {});
  writeStorage(TOKEN_KEY, null);
}

export function hasRegisteredPushToken(): boolean {
  return readStorage(TOKEN_KEY) !== null;
}
