# Shipping Comp Beast to the App Store

The iOS app is built and ready to archive (`ios/`, see the main README's
[iOS app](../../README.md#ios-app) section). What is left needs your Apple account, your
Vercel dashboard or your judgement, so it is written down here in the order to do it.
Steps marked **(blocker)** will get the submission rejected or the app broken if skipped.

The listing text, age-rating answers and privacy answers to paste are in
[`listing.md`](listing.md).

## 1. Apple Developer Program (blocker)

Publishing needs a paid membership ($99/year): https://developer.apple.com/programs/enroll/.
An individual membership lists the app under your name; an organization one (needs a D-U-N-S
number) lists it under the company. Note your **Team ID** (developer.apple.com → Account →
Membership details) — several steps below need it.

## 2. Xcode

1. Xcode → Settings → Accounts → **+** → Apple ID, and sign in with the developer account.
2. In the repo: `npm ci && npm run ios:sync && npm run ios:open`.
3. In Xcode, select the **App** target → **Signing & Capabilities** → Team: your team.
   "Automatically manage signing" stays on. Xcode registers the bundle id `app.compbeast`
   with the two capabilities the app declares (Push Notifications, Associated Domains).
   If `app.compbeast` is taken, change the bundle id here *and* `appId` in
   `capacitor.config.ts`, and set `APPLE_BUNDLE_ID` / `APNS_BUNDLE_ID` in Vercel to match.
4. Optional but worth it: plug in your iPhone, pick it as the run destination and press ▶︎ to
   try the real thing before Apple does.

## 3. Push notifications key (blocker for alerts)

The listing promises an alert when it's your pick, so set this before review.

1. developer.apple.com → Certificates, IDs & Profiles → **Keys** → **+** → name it
   "Comp Beast APNs", tick **Apple Push Notifications service (APNs)** → Continue → Register
   → **Download** the `.p8` file (you only get to download it once) and note the **Key ID**.
2. In Vercel → compbeast → Settings → Environment Variables (Production):

   | Variable | Value |
   | --- | --- |
   | `APNS_KEY_ID` | the key's 10-character id |
   | `APNS_TEAM_ID` | your Team ID |
   | `APNS_PRIVATE_KEY` | the whole contents of the `.p8` file, including the BEGIN/END lines |
   | `APPLE_TEAM_ID` | your Team ID again — this switches on universal links and iCloud Keychain passwords in the app |

3. Redeploy (any push to `main`, or Vercel → Deployments → Redeploy). Then
   `https://compbeast.app/.well-known/apple-app-site-association` should return JSON naming
   `<TeamID>.app.compbeast` instead of a 404.

## 4. Clerk dashboard (blocker: review sign-in)

Open Clerk from Vercel → compbeast → Integrations → Clerk → "Open in Clerk".

- **Sign in as the reviewer will.** Apple's reviewer signs in with a password on a device
  that has never seen the account, and cannot read its inbox. In a private browser window,
  sign in to the demo account (step 6). If Clerk asks for an emailed code after the
  password, turn off new-device verification ("Client Trust" — look under Configure →
  Attack protection) — otherwise the reviewer is locked out and the app is rejected under
  2.1.
- **Rename the application** from `clerk-beige-dog` to `Comp Beast` (Configure → Settings).
  That name is in every verification email, including the reviewer's.
- Legal consent (Configure → Sign-up → Legal) — optional; the sign-up page already states
  that signing up accepts the terms and privacy policy.
- Google sign-in stays on for the website. **The iOS app hides it** (Google blocks sign-in
  inside apps' web views, and offering it would oblige the app to offer Sign in with Apple
  too, guideline 4.8). People who signed up with Google sign in to the app with their email:
  Clerk emails them a code. Do not add Apple or other social sign-ins in Clerk expecting them
  to appear in the app — they are hidden there the same way, until the app grows native
  sign-in.

## 5. Contact details (blocker: guideline 1.2 needs published contact info)

Set `LEGAL_CONTACT_EMAIL` in Vercel to an address you read (and optionally
`LEGAL_OPERATOR_NAME`, `LEGAL_POSTAL_ADDRESS`, `LEGAL_GOVERNING_LAW`). Without it the
support page, privacy policy and footer point at GitHub issues, which a reviewer may not
accept as a way to reach you. Make sure your own account has `PLATFORM_ADMIN_EMAILS` admin,
so you get the moderation alerts — the terms promise reports are handled within 24 hours, at
https://compbeast.app/admin/reports.

## 6. A demo account for App Review (blocker)

Sign-in is required for most of the app, so Apple needs working credentials.

1. On https://compbeast.app, sign up with an email you control (e.g. a `+review` alias)
   and a password. Give it a name like "App Review".
2. With your own account, create a league on an airing season, invite the demo account
   (or have it join with the code), and run the draft so standings, rosters and the draft
   board have something on them. Post a message or two in the league's Trash talk feed.
3. Sign out, and sign in again in a private window to confirm step 4's check.

## 7. Create the app in App Store Connect

https://appstoreconnect.apple.com → Apps → **+** → New App: platform iOS, name
`Comp Beast`, language English (U.S.), bundle id `app.compbeast`, SKU `compbeast-ios`,
full access. Then fill in, from [`listing.md`](listing.md):

- App Information: subtitle, categories, content rights, age rating.
- App Privacy: the data types table. Privacy policy URL `https://compbeast.app/privacy`.
- Pricing and Availability: **Free**, all territories you want.
- The version page: promotional text, description, keywords, support and marketing URLs,
  screenshots (below), and the review notes (below).

## 8. Upload a build

Either from Xcode — choose **Any iOS Device (arm64)** as the destination → Product →
**Archive** → Distribute App → App Store Connect → Upload — or from the terminal:

```bash
APPLE_TEAM_ID=XXXXXXXXXX npm run ios:release
```

The version is 1.0.0; App Store Connect numbers the builds. After 10–30 minutes the build
shows under TestFlight. Install it on your phone through TestFlight first: sign in, open a
league, turn on alerts on the home screen, and check a push arrives (for example by having a
friend send you a friend request).

## 9. Screenshots

App Store Connect needs at least one set of 6.9-inch iPhone screenshots (1320 × 2868 or
1290 × 2796). The simulator's iPhone 17 Pro Max produces exactly 1320 × 2868:

```bash
xcrun simctl io booted screenshot ~/Desktop/compbeast-1.png
```

Take 3–10 of the app in use, signed in as the demo account: the leagues home, a league's
standings, the draft room, a team page, the trash-talk feed, a season scoreboard. A starting
set taken from the public pages is in `docs/app-store/screenshots/` (not in git — it lives
only on this machine). iPad screenshots are not needed: the app is iPhone-only.

## 10. Review notes

Paste into App Review Information → Notes, with the demo account's email and password in
the sign-in fields:

```
Comp Beast is a free fantasy league app for reality competition TV: friends form a league, draft a season's cast, and score points from each episode. There are no purchases, ads, prizes or real-money play.

The demo account is already in a league whose draft is finished, so standings, rosters, the draft board and the league chat all have content.

Where to find things:
• Leagues tab → a league: standings, invite code (share sheet / QR), and the "Trash talk" feed.
• Guideline 1.2 (user-generated content): tap "⋯" beside any post in a league feed, on a team page, or on a friend request to Report or Block. Blocking hides that person's posts immediately and both ways; every report and block alerts our moderators, who act within 24 hours (moderation queue at /admin/reports). Posts and league/team names are filtered for slurs. The Terms (footer → Terms) state there is no tolerance for objectionable content or abusive users. Blocked people are listed, with Unblock, under You → Blocked people.
• Guideline 5.1.1(v): You tab → Delete account (bottom of the page). Deletion is immediate and erases the account's personal data.
• Support and contact: https://compbeast.app/support

Native features: push notifications through APNs with the unread count on the app icon (tapping one opens the relevant page); universal links, so league invite links and printed QR codes open the app; the iOS share sheet for invites; haptic feedback; links that leave the site open in an in-app Safari sheet; swipe-back navigation; and a native offline screen that reconnects by itself.

Sign-in is email and password (or an emailed code). The app shows the same account and leagues as compbeast.app on the web.
```

## 11. Submit

Add the build to the version, answer the export-compliance question (**No** — the app only
uses standard HTTPS; `ITSAppUsesNonExemptEncryption` is already set so this is usually
skipped), and **Submit for Review**. First reviews typically take one to three days.

## The compliance sweep

What App Review checks, and where this app stands. Everything marked done is in the code.

| Guideline | Requirement | Status |
| --- | --- | --- |
| 1.2 User-generated content | Filter objectionable content; report; block; act within 24h; published contact | Done — slur filter, ⋯ report/block everywhere a person appears, moderation queue with admin alerts, terms say so. **You:** set `LEGAL_CONTACT_EMAIL`, watch the queue |
| 2.1 App completeness | Demo account, no broken flows | **You:** steps 4 and 6 |
| 2.3.7 / 5.2.1 Metadata & IP | No trademarks in name, subtitle, keywords | Done in `listing.md`; see the risk below |
| 2.5.2 Self-contained | No downloaded executable code changing the app's purpose | Fine — web content in WebKit is allowed; don't repurpose the app via the site |
| 3.1.1 In-app purchase | Digital goods through IAP | Nothing is sold |
| 4.2 Minimum functionality | More than a repackaged website | APNs push + badge, universal links, share sheet, haptics, offline screen, in-app Safari, swipe-back, native launch |
| 4.5.4 Push | Not required to use the app; not for marketing | Opt-in, transactional only |
| 4.8 Login services | Sign in with Apple if a third-party login is offered | Google is hidden in the app (email/password only) |
| 5.1.1 Privacy | Policy linked in app and listing; data minimised | Policy updated for the app; footer link on every page |
| 5.1.1(v) Account deletion | Delete from inside the app | You → Delete account (Clerk's own delete is now hidden so nothing bypasses the erasure) |
| 5.1.2 Tracking / ATT | Prompt if tracking | No tracking, so no prompt |
| Privacy manifest | `PrivacyInfo.xcprivacy` | Included, matching the labels |
| Export compliance | Encryption declaration | `ITSAppUsesNonExemptEncryption = NO` |

### Risks to know about

- **Cast photos and show names (5.2.1/5.2.2).** Contestant headshots are network promo
  images loaded from fan and network sites, and the app is about three trademarked shows.
  Fan and fantasy apps routinely name the shows they cover, and the disclaimer is on every
  page and in the description, but a rights holder's complaint — or a strict reviewer — can
  still cause a rejection or a takedown. If review cites 5.2, the fastest fix is serving
  initials instead of photos in the app (`<Avatar>` already falls back to them), not a
  rewrite.
- **Content can change without review.** The app shows the live site, which is allowed for
  content and fixes; a change to what the app fundamentally *is* would need a new submission.
- **Each new native capability needs a new build.** Web changes ship to the app on the next
  Vercel deploy; changes to `ios/` or `capacitor.config.ts` need `npm run ios:release` and
  another review.
