# Comp Beast on your own iPhone, free

No paid Apple Developer account needed. A free Apple ID can install the app on
your own phone straight from Xcode.

1. Xcode → Settings → Accounts → **+** → sign in with your Apple ID.
2. In the repo: `npm ci && npm run ios:personal && npm run ios:open`.
   (`ios:personal` signs the app without the two capabilities a free account
   cannot have: push notifications and associated domains.)
3. In Xcode: **App** target → **Signing & Capabilities** → Team:
   "<your name> (Personal Team)".
4. Plug in your iPhone, unlock it, tap **Trust**. On the phone turn on
   Settings → Privacy & Security → **Developer Mode** (it restarts).
5. Pick your iPhone as the run destination and press ▶︎. The first time, on the
   phone: Settings → General → VPN & Device Management → trust your Apple ID.

**Limits of a free account:** the install lasts 7 days (press ▶︎ again to renew);
no push alerts; invite links open Safari instead of the app. Everything else —
leagues, drafts, standings, chat, reporting, pull to refresh, offline screen —
works. Undo with `npm run ios:personal -- off`.

**Working on the app locally:** `npm run ios:dev` serves the site on
https://localhost:3443 and points the next Debug build at it; `npm run ios:sync`
points it back at compbeast.app.
