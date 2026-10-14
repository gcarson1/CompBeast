import type { CapacitorConfig } from '@capacitor/cli';
import type { KeyboardResize } from '@capacitor/keyboard';

/**
 * The iOS app: a native shell around the same Comp Beast that runs at
 * compbeast.app.
 *
 * Why a hosted shell and not a bundled export. Every page here is rendered per
 * request from the database, behind Clerk's middleware, with server actions
 * doing the writes — there is no static build of this app to bundle, and a
 * second, client-only copy of it would drift from the web one on the first
 * change. So the web view loads the live site, and the native layer adds what
 * a website cannot do on an iPhone: APNs push with an icon badge, haptics, the
 * share sheet, universal links (a scanned league QR code opens the app), an
 * in-app Safari sheet for links that leave the site, swipe-back navigation and
 * a native offline screen. The web code switches those on only
 * when it finds the native bridge (src/lib/native.ts), so the website is
 * untouched by any of it.
 *
 * `CAP_SERVER_URL` points a build at another server. `npm run ios:dev`
 * (scripts/ios-dev.sh) uses it to run the site locally over HTTPS — plain
 * http://localhost cannot sign anyone in inside WebKit — and
 * `npm run ios:sync` without it points the app back at production. The value
 * is baked into the app bundle at sync time.
 */
const serverUrl = (process.env.CAP_SERVER_URL || 'https://compbeast.app').replace(/\/+$/, '');
/** A development server on this machine, which signs in through Clerk's development instance. */
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(serverUrl);

const config: CapacitorConfig = {
  appId: 'app.compbeast',
  appName: 'Comp Beast',
  // Only the fallback page the shell ships with (see native/www/index.html);
  // the app itself is loaded from `server.url`.
  webDir: 'native/www',
  // The canvas colour, so nothing flashes white between the launch screen
  // and the first paint.
  backgroundColor: '#0F172A',
  // How the server tells the app from Safari (src/lib/native-server.ts). The
  // number is the shell's bridge version: bump it when the native side gains
  // something the web side has to know about.
  appendUserAgent: 'CompBeastApp/1',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
    // Navigations that stay in the web view rather than opening Safari. Clerk
    // signs in on its own subdomain (its session handshake is a top-level
    // redirect through clerk.compbeast.app), so the whole site's domain has
    // to stay inside the app. A development build signs in through Clerk's
    // development instance instead.
    allowNavigation: [
      'compbeast.app',
      '*.compbeast.app',
      ...(local ? ['localhost', '*.clerk.accounts.dev', '*.accounts.dev'] : []),
    ],
  },
  ios: {
    // The page pads itself for the notch and the home indicator
    // (`env(safe-area-inset-*)`), exactly as it does when installed from Safari.
    contentInset: 'never',
    // A long press on a link should not pop a Safari preview of our own pages.
    allowsLinkPreview: false,
    // Pinch-to-zoom stays, as on the website (src/app/layout.tsx): it is the
    // most-used accessibility affordance on a phone, and Capacitor turns it
    // off by default. (Mapping Dynamic Type onto WKWebView's page zoom was
    // tried and rejected: page zoom magnifies without reflowing, so the page
    // clipped at the right edge.)
    zoomEnabled: true,
    preferredContentMode: 'mobile',
    scheme: 'App',
  },
  plugins: {
    PushNotifications: {
      // An alert that arrives while the app is open still shows as a banner:
      // "your pick is due" matters most when you are on another page of it.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      // Shrink the web view above the keyboard so the app's one-screen shell
      // (header, scroller, nav) re-lays out around it instead of being panned.
      // A type-only import keeps the plugin's runtime out of the CLI.
      resize: 'native' as KeyboardResize,
      resizeOnFullScreen: true,
    },
  },
};

export default config;
