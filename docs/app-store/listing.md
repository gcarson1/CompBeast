# App Store listing — copy to paste

Everything below goes into App Store Connect → your app → the **iOS App** version page and
**App Information**. Character limits are Apple's; every field here fits.

Show names stay out of the name, subtitle and keywords on purpose: they are other companies'
trademarks, and Apple rejects trademarked terms in those three fields (guideline 2.3.7 /
5.2.1). The description names them once, with the same "not affiliated" disclaimer the site
carries.

## App Information

| Field              | Value                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Name (30)          | `Comp Beast`                                                                                                                                                                   |
| Subtitle (30)      | `Fantasy leagues for reality TV`                                                                                                                                               |
| Bundle ID          | `app.compbeast`                                                                                                                                                                |
| SKU                | `compbeast-ios`                                                                                                                                                                |
| Primary language   | English (U.S.)                                                                                                                                                                 |
| Primary category   | Entertainment                                                                                                                                                                  |
| Secondary category | Sports                                                                                                                                                                         |
| Content rights     | "Does your app contain, show, or access third-party content?" → **Yes**, and confirm you have the rights or permission to use it (see the note in README.md about cast photos) |

## Version page

**Promotional text (170)** — can be changed any time without a new build:

```
Draft the cast with your friends, score every episode as it airs, and chase a live leaderboard all season. Free, with no ads and nothing to buy.
```

**Keywords (100)** — comma-separated, no spaces, no words already in the name:

```
fantasy,league,reality,tv,draft,friends,leaderboard,show,cast,points,episode,elimination,game,season
```

**Support URL:** `https://compbeast.app/support`
**Marketing URL:** `https://compbeast.app`
**Privacy Policy URL:** `https://compbeast.app/privacy`
**Copyright:** `2026 <your name or company>`

**Description (4000):**

```
Comp Beast turns reality competition TV into a fantasy league you play with your friends.

Start a league for the season that's on air, invite friends with a code, a QR code or a one-tap invite, and snake-draft the real cast. Every episode, your picks earn points for what happens on screen — competition wins, blindsides, eliminations, the finale — and a live leaderboard ranks every team in your league all season long.

DRAFT
• A live snake draft that updates for everyone within seconds
• An alert the moment it's your pick
• Pick a scoring ruleset before the draft

PLAY
• Points scored from each episode's results as they air
• Every point traceable to the moment that earned it
• Team pages, player game logs and week-by-week charts
• Roster lock times your commissioner controls

TALK
• A trash-talk feed in every league, with Hype and Shade reactions
• Report or block anyone, any time — reports are reviewed within 24 hours

KEEP SCORE FOR LIFE
• Career points, titles and badges that follow you from season to season
• Season archives that rank every contestant by fantasy points

Free to play. No ads, no purchases, no tracking.

Comp Beast runs leagues for Big Brother, Survivor and The Traitors. Comp Beast is an independent fan project and is not affiliated with, endorsed by or sponsored by CBS, Paramount, NBCUniversal, Peacock or the producers of those shows. Show names are trademarks of their respective owners.
```

**What's New (first version):**

```
The first version of Comp Beast for iPhone: your leagues, drafts, standings and trash talk, with alerts when it's your pick.
```

## Age rating questionnaire

Answer as follows (App Store Connect → App Information → Age Rating). The result should be
**13+**, which matches the terms (13 and over).

| Question                                                                          | Answer                                                                          |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Parental controls / age assurance                                                 | No / No                                                                         |
| Unrestricted web access                                                           | No — links that leave the site open in a Safari sheet, the app is not a browser |
| User-generated content                                                            | **Yes**                                                                         |
| Messaging and chat                                                                | **Yes** (league feeds)                                                          |
| Advertising                                                                       | No                                                                              |
| Profanity or crude humor                                                          | Infrequent/Mild (members' trash talk; slurs are filtered)                       |
| Cartoon/fantasy/realistic violence, horror, mature themes, sexual content, nudity | None                                                                            |
| Alcohol, tobacco, drugs; medical; gambling; simulated gambling; contests          | None / No — no money, prizes or wagering of any kind                            |
| Guns or other weapons                                                             | None                                                                            |

## App Privacy ("nutrition label")

App Store Connect → App Privacy. These answers match `ios/App/App/PrivacyInfo.xcprivacy`
and https://compbeast.app/privacy — keep the three in step.

**Do you or your third-party partners collect data from this app?** Yes.
**Is data used to track users?** No, for every type below.

| Data type                                                              | Collected | Linked to the user | Purposes          |
| ---------------------------------------------------------------------- | --------- | ------------------ | ----------------- |
| Contact Info → Email Address                                           | Yes       | Yes                | App Functionality |
| Contact Info → Name                                                    | Yes       | Yes                | App Functionality |
| User Content → Photos or Videos (profile picture, if uploaded)         | Yes       | Yes                | App Functionality |
| User Content → Other User Content (league chat, team and league names) | Yes       | Yes                | App Functionality |
| Identifiers → User ID                                                  | Yes       | Yes                | App Functionality |
| Usage Data → Product Interaction (cookieless page views)               | Yes       | **No**             | Analytics         |
| Diagnostics → Crash Data                                               | Yes       | **No**             | App Functionality |
| Diagnostics → Performance Data                                         | Yes       | **No**             | Analytics         |

Everything else (location, contacts, health, financial info, browsing history, search
history, purchases, sensitive info, advertising data, device ID): **not collected**.
