import { headers } from 'next/headers';

/**
 * The token the iOS app appends to its user agent (capacitor.config.ts →
 * `appendUserAgent`). The number after it is the shell's bridge version.
 */
const NATIVE_APP_TOKEN = 'CompBeastApp/';

/**
 * Whether this request comes from the Comp Beast iOS app — so a page can
 * render the app's version of itself on the first paint (native push
 * instead of Web Push, no "add to home screen" advice) rather than flicker
 * into it after the bridge loads. Client code asks `isNativeApp()` in
 * src/lib/native.ts instead.
 *
 * A user agent is only a hint, and nothing here trusts it with more than
 * presentation: every native capability is still the bridge's to grant.
 */
export function isNativeAppRequest(): boolean {
  try {
    return headers().get('user-agent')?.includes(NATIVE_APP_TOKEN) ?? false;
  } catch {
    // Outside a request (a static render): the website.
    return false;
  }
}
