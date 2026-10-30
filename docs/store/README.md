# Store release checklist

Everything needed to publish MyRooms 1.0 on Google Play and the App Store. Listing text: [listing.en.md](listing.en.md) and [listing.ar.md](listing.ar.md). The user guide and privacy policy are served by the web app: `public/guide.html`, `public/guide-ar.html`, `public/privacy.html`.

App ids: `com.integr8media.myrooms` (Android package and iOS bundle id). Version `1.0.0` (`app.json`); build numbers are managed by EAS (`appVersionSource: remote`, `autoIncrement` in the production profile).

## 1. Placeholders to fill

| Placeholder                                        | Where                                         | What                                                                        |
| -------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------- |
| `[COMPANY NAME]`                                   | `public/privacy.html` (EN + AR)               | Legal name of the company that operates the app                             |
| `[SUPPORT EMAIL]`                                  | `public/privacy.html` (EN + AR), store fields | Support / privacy contact address                                           |
| `[EFFECTIVE DATE]`                                 | `public/privacy.html` (EN + AR)               | Date the policy takes effect, e.g. 2026-11-15                               |
| `app.example.com`                                  | This file, store forms                        | The production web domain                                                   |
| `[DEMO OWNER EMAIL]` / `[DEMO OWNER PASSWORD]`     | Review notes (section 6)                      | Demo owner account for the reviewers                                        |
| `[DEMO CASHIER EMAIL]` / `[DEMO CASHIER PASSWORD]` | Review notes (section 6)                      | Optional second account to show the cashier view                            |
| `[SUPPORT URL]`                                    | Store forms                                   | A page with contact details (can be `https://app.example.com/guide.html`)   |
| `[DEVELOPER NAME]`                                 | Store accounts                                | Name shown as the developer/seller on both stores                           |
| `[DEVELOPER ADDRESS]` / `[DEVELOPER PHONE]`        | Play Console, App Store Connect               | Required contact details (Play shows the address for organization accounts) |

## 2. Accounts

| Account                 | Cost             | Notes                                                                                                                              |
| ----------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Google Play Console     | USD 25, one time | Organization account needs a D-U-N-S number. New personal accounts must run a closed test (12 testers, 14 days) before production. |
| Apple Developer Program | USD 99 per year  | Organization enrollment needs a D-U-N-S number. Needed for TestFlight too.                                                         |
| Expo (EAS)              | Free tier works  | Builds and submits. The project is linked through `eas init`.                                                                      |

**Open question for the client:** who owns these accounts (the client's company or Integr8 Media)? The owner is the seller name shown in the stores, and moving an app to another account later is possible but slow. Same question as PLAN.md §9 item 6.

## 3. URLs

| Field                               | Value                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------- |
| Privacy policy                      | `https://app.example.com/privacy.html`                                    |
| Account deletion (Play)             | `https://app.example.com/privacy.html#en` (explains the steps; see below) |
| Support URL                         | `[SUPPORT URL]` (suggested: `https://app.example.com/guide.html`)         |
| Marketing URL (App Store, optional) | leave empty, or `https://app.example.com/guide.html`                      |

**Account deletion, as entered in Play's form:** "Open https://app.example.com and sign in, then go to Settings → Account → Delete my account. The same option is in the app. Details: https://app.example.com/privacy.html#en." The web route must work without installing the app (Play requires it).

## 4. Google Play: Data safety form

Answers derived from the privacy policy. Data is stored on the business's own server; no third party receives it, so nothing is "shared".

- Does your app collect or share any of the required user data types? **Yes.**
- Is all of the user data collected by your app encrypted in transit? **Yes.**
- Do you provide a way for users to request that their data is deleted? **Yes** (in-app and web URL above).
- Data shared with third parties: **None.**

| Category                 | Data type        | Collected | Optional? | Purposes                              | Notes                                                              |
| ------------------------ | ---------------- | --------- | --------- | ------------------------------------- | ------------------------------------------------------------------ |
| Personal info            | Name             | Yes       | Required  | App functionality, Account management | Staff names; customer names entered by staff                       |
| Personal info            | Email address    | Yes       | Required  | App functionality, Account management | Staff sign-in                                                      |
| Personal info            | Phone number     | Yes       | Optional  | App functionality                     | Customer phones entered by staff (Customers module, reservations)  |
| Personal info            | User IDs         | Yes       | Required  | App functionality, Account management | Random account id                                                  |
| Personal info            | Other info       | Yes       | Optional  | App functionality                     | Free-text notes on customers, sessions, expenses                   |
| Financial info           | Purchase history | Yes       | Required  | App functionality                     | Bills and recorded payments (no card numbers)                      |
| App info and performance | Crash logs       | Yes       | Required  | App functionality                     | Only when error reporting is configured; scrubbed of personal data |
| App info and performance | Diagnostics      | Yes       | Required  | App functionality                     | Error details, app version, platform                               |

Not collected: location, contacts, photos/videos, audio, files, calendar, messages, web browsing, health, device or other ids, payment info (card numbers), credit info, app interactions/analytics, ads data.

Also in App content:

- **Ads:** No ads.
- **App access:** All functionality is restricted → provide the demo login (section 6).
- **Target audience:** 18 and over. The app does not appeal to children.
- **Financial features:** "My app doesn't provide any financial features" (it only records payments taken at the counter).
- **Government app / News / Health / COVID:** No.
- **Data deletion:** URL above.

## 5. App Store: App Privacy labels

- Data used to track you: **None.** The app does not track users and has no tracking SDKs; no App Tracking Transparency prompt.
- All data below is **linked to the user** (it belongs to their account or organization) and used for **App Functionality** only. No Analytics, Advertising, Product Personalization or Developer's Advertising purposes.

| Apple category | Data type             | Linked to user | Tracking | Purpose           |
| -------------- | --------------------- | -------------- | -------- | ----------------- |
| Contact Info   | Name                  | Yes            | No       | App Functionality |
| Contact Info   | Email Address         | Yes            | No       | App Functionality |
| Contact Info   | Phone Number          | Yes            | No       | App Functionality |
| Identifiers    | User ID               | Yes            | No       | App Functionality |
| Purchases      | Purchase History      | Yes            | No       | App Functionality |
| User Content   | Other User Content    | Yes            | No       | App Functionality |
| Diagnostics    | Crash Data            | Yes            | No       | App Functionality |
| Diagnostics    | Other Diagnostic Data | Yes            | No       | App Functionality |

Crash data is marked linked because reports carry the random account id. Not collected: location, health, financial info (payment card / credit), contacts, browsing/search history, usage data, sensitive info, device ID, audio, photos.

Other App Store Connect answers:

- **Export compliance:** the app uses only standard HTTPS (exempt). Set `ITSAppUsesNonExemptEncryption = false` in `app.json` (`ios.infoPlist`) so builds don't ask each time.
- **Sign in with Apple:** not required (the app uses its own email/password accounts only, no third-party sign-in).
- **In-app purchases:** none.
- **Account deletion (guideline 5.1.1(v)):** Settings → Account → Delete my account, inside the app.

## 6. Review notes (both stores)

Before submitting, create the demo organization on the production server with sample data: one branch, 4 PlayStation rooms and 6 PC desks with prices, a few completed and paid sessions (Cash, Visa, Instapay), one running session, two reservations today, a few customers, products with stock and two expenses. Use made-up names and phone numbers.

Paste this into Apple's **App Review Information → Notes** and Google's **App access → instructions**:

```text
MyRooms is a management tool for gaming centers (PC desks and PlayStation rooms rented by the hour), used by the center's owner and staff. Every screen needs an account that belongs to an organization (the gaming center), so please use the demo owner account below, which already has a sample center with data.

Demo owner account
Email: [DEMO OWNER EMAIL]
Password: [DEMO OWNER PASSWORD]

Optional cashier account (limited view: no price changes, only own payments)
Email: [DEMO CASHIER EMAIL]
Password: [DEMO CASHIER PASSWORD]

What to try:
1. The home screen (Live floor) shows the stations. Tap a free station, then Start session.
2. Open a running session, tap End session, then End now. Checkout opens: record a payment (Cash, Visa or Instapay are only recorded; the app does not process card payments).
3. Calendar: tap an empty time to book a reservation.
4. Reports: income by payment method, export CSV or PDF.
5. Language: Settings > Account > Language (Arabic and English).

Account deletion: Settings > Account > Delete my account (also on the web app). Please don't delete the demo owner account: it would delete the sample organization.

Notifications are only local alerts for sessions that are ending; there is no push server. The app works offline and syncs when back online.

Contact: [SUPPORT EMAIL]
```

Apple guideline 3.2 note: anyone can sign up and create their own organization (it is not a private app for one company), which is why it goes to the public App Store rather than Apple Business Manager. If a reviewer asks, say so.

## 7. Content rating

**Google Play (IARC questionnaire):** category "All other app types" (business / utility). Answer **No** to: violence, fear, sexual content, nudity, crude humour, bad language, drugs, alcohol, tobacco, gambling (simulated or real), user-to-user communication, sharing content with other users publicly, sharing the user's location, digital purchases. Expected rating: Everyone / PEGI 3.

Note: "gaming center" is a place that rents game stations; the app itself has no games and no gambling.

**Apple (age rating):** answer **None / No** to every content and feature question (no unrestricted web access, no user-generated content shared publicly, no messaging, no gambling, no contests). Expected rating: 4+.

## 8. Graphics and screenshots

Take every screenshot from the demo organization, **once in English and once in Arabic** (Settings → Account → Language), light theme, with real-looking data and no personal data.

Screens, in this order:

1. Live floor with a mix of statuses (free, playing, ending soon, over time, reserved soon)
2. Start session (fixed time, with the estimated price)
3. Session screen (timer, add time, players, snacks)
4. Checkout with a split payment (Cash + Visa) and a discount
5. Calendar day view with reservations
6. Reports overview (income by method, net profit)
7. Usage report with the busiest-hours heat map
8. Snacks & stock or Customers
9. Station types & prices (rate rules)
10. Sync page (up to date) — optional, shows offline support

| Asset                         | Store       | Size                                     | Count                                     |
| ----------------------------- | ----------- | ---------------------------------------- | ----------------------------------------- |
| Phone screenshots             | Google Play | at least 1080 × 1920 (portrait, 9:16)    | 2–8 per language (aim for 8)              |
| 7" and 10" tablet screenshots | Google Play | optional, e.g. 1200 × 1920 / 1600 × 2560 | optional                                  |
| Feature graphic               | Google Play | 1024 × 500, no alpha                     | 1 per language                            |
| App icon                      | Google Play | 512 × 512 PNG                            | 1                                         |
| iPhone 6.9" screenshots       | App Store   | 1320 × 2868 (portrait)                   | 3–10 per language                         |
| iPad 13" screenshots          | App Store   | 2064 × 2752 (portrait)                   | 3–10 per language (the app supports iPad) |
| App icon                      | App Store   | 1024 × 1024 (taken from the build)       | 1                                         |

In the store consoles, add Arabic (`ar`) as a second listing language and paste the text from `listing.ar.md`; upload the Arabic screenshots there.

## 9. Build and submit

Production builds and submissions run on EAS:

```bash
npx eas-cli build --profile production --platform android
npx eas-cli build --profile production --platform ios

npx eas-cli submit --profile production --platform android
npx eas-cli submit --profile production --platform ios
```

- **First Android upload by hand.** Google's API can't create the app. Create the app in Play Console, download the first `.aab` from the EAS build page and upload it in Play Console (Testing → Internal testing). After that, `eas submit` works.
- The Android submit profile sends builds to the **internal** track. Promote them to closed testing / production in Play Console.
- Android submit uses a Google service account key, `google-service-account.json` (Play Console → Setup → API access). **Never commit this file.** Keep it out of git (add it to `.gitignore`) or store it as an EAS secret file.
- iOS submit uploads to App Store Connect / TestFlight. EAS asks for an Apple ID or an App Store Connect API key the first time.
- Before the production build, set the production `EXPO_PUBLIC_*` values (server URLs, Sentry DSN) for the EAS `production` environment.

## 10. Final checks before "Submit for review"

- [ ] Placeholders in section 1 filled, privacy page live at the production URL in both languages.
- [ ] Demo organization created and both demo accounts sign in on a phone.
- [ ] Delete my account works on the web app without the mobile app (Play requirement).
- [ ] Data safety (Play) and App Privacy (Apple) filled as in sections 4 and 5.
- [ ] Content rating questionnaire done.
- [ ] Screenshots uploaded for both languages; feature graphic uploaded.
- [ ] Settings links to the User guide and Privacy policy open the right pages.

## Checking character counts

Each field in the listing files shows `[count / limit]`. After editing a field, recount it with Node (counts Unicode characters, Arabic included):

```bash
node -e "console.log([...process.argv[1]].length)" "text to count"
```
