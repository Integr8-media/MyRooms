# Deploying MyRooms

The backend and the web app run on our own VPS (Oracle Cloud) with Docker, behind the Caddy that already runs there. The Windows, Android and iOS apps are built separately and connect to the same backend.

The same guide is published as a page (kept in sync with this file): see `CLAUDE.md` for the link.

```
                 Internet (HTTPS)
                        │
                 Caddy (on the VPS host) ── app.<domain> → /var/www/myrooms (web app files)
          ┌─────────────┴──────────────┐
 api.<domain> → 127.0.0.1:8000    sync.<domain> → 127.0.0.1:8080
          │                            │
 Self-hosted Supabase stack       PowerSync stack
 (gateway, auth, rest, db, …)     (powersync + its storage db)
          └────── Docker network `supabase_default` ──────┘
                 PowerSync reads changes from `db`
```

- **Supabase**: the official self-hosted Docker setup, pinned to `self-hosted/v0.8.3`. Its files are downloaded by `supabase/setup.sh` and live outside this repo, because they hold secrets.
- **PowerSync**: `powersync/docker-compose.yml` from this repo.
- Both run on ARM (Oracle Ampere) and x86.
- **Requirements**: Supabase needs at least 4 GB RAM (8 GB recommended), PowerSync about 1 GB more, plus Docker Compose v2.24+ and git.

## 1. DNS

Create three A records pointing at the VPS public IP, for example:

- `app.example.com`: the web app
- `api.example.com`: Supabase API and the Studio dashboard
- `sync.example.com`: PowerSync

In the Oracle Cloud console, the subnet's security list (and the VPS firewall) must allow inbound **80** and **443**, which Caddy needs. Don't open 8000, 8080 or 5432: those stay private to the VPS.

## 2. Install Supabase

On the VPS:

```sh
git clone <this repo> ~/myrooms/app && cd ~/myrooms/app/deploy
sh supabase/setup.sh              # creates ~/myrooms/supabase with generated secrets
```

## 3. Configure Supabase

Edit `~/myrooms/supabase/.env`:

| Variable                                    | Value                                                                                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_PUBLIC_URL`                       | `https://api.example.com`                                                                                                    |
| `API_EXTERNAL_URL`                          | `https://api.example.com/auth/v1`                                                                                            |
| `SITE_URL`                                  | URL of the web app (e.g. `https://app.example.com`)                                                                          |
| `ADDITIONAL_REDIRECT_URLS`                  | `https://app.example.com/**,myrooms://**` (where email links may send people back to)                                        |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | Studio login (letters and numbers only)                                                                                      |
| `ENABLE_ANONYMOUS_USERS`                    | `false` (Phase 1 uses real accounts)                                                                                         |
| `ENABLE_EMAIL_SIGNUP`                       | `true`                                                                                                                       |
| `ENABLE_EMAIL_AUTOCONFIRM`                  | **`false`**. Accepting a staff invitation trusts the confirmed email, so confirmation must stay on.                          |
| `SMTP_*`                                    | Mail server for confirmation, password-reset and invitation emails. **Required**: without it nobody can confirm their email. |
| `MAILER_URLPATHS_*`                         | Leave the defaults (`/auth/v1/verify`).                                                                                      |

Then start it:

```sh
cd ~/myrooms/supabase
sh run.sh start
docker compose ps                 # all services should be "healthy"
sh run.sh secrets                 # shows the publishable key for the app's .env.local
```

## 4. Caddy

Create the web app folder (`sudo mkdir -p /var/www/myrooms && sudo chown $USER /var/www/myrooms`), then add the three blocks from `caddy/Caddyfile.example` (with your domains) to the VPS Caddyfile and reload Caddy (`sudo systemctl reload caddy`, or `docker exec <caddy> caddy reload --config /etc/caddy/Caddyfile` if Caddy runs in Docker; see the note at the bottom of the example).

Check: `https://api.example.com` should ask for the Studio login.

## 5. Apply the database migrations

The migrations in `supabase/migrations/` are applied from a developer PC through an SSH tunnel, so Postgres is never exposed publicly.

```sh
# Terminal 1: tunnel local port 54329 to the VPS pooler
ssh -N -L 54329:127.0.0.1:5432 <user>@<vps-ip>

# Terminal 2: from the repo root
# POOLER_TENANT_ID and POSTGRES_PASSWORD come from ~/myrooms/supabase/.env on the VPS
npx supabase db push --db-url "postgresql://postgres.<POOLER_TENANT_ID>:<POSTGRES_PASSWORD>@127.0.0.1:54329/postgres"
```

Then give the PowerSync database role a password (once per server):

```sh
# on the VPS
docker exec -it supabase-db psql -U postgres -c "alter role powersync_role with password '<new-random-password>';"
docker exec -it supabase-db psql -U postgres -c "show wal_level;"     # must print: logical
```

## 6. Install PowerSync

```sh
cd ~/myrooms/app/deploy/powersync
cp .env.example .env              # fill in: powersync_role password, storage password, admin token
docker compose up -d
docker compose logs -f powersync  # should show replication starting, no errors
```

Check: `curl https://sync.example.com/probes/liveness` should succeed.

## 7. Point the app at the VPS

In the repo root `.env.local`:

```
EXPO_PUBLIC_SUPABASE_URL=https://api.example.com
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<from `sh run.sh secrets`>
EXPO_PUBLIC_POWERSYNC_URL=https://sync.example.com
EXPO_PUBLIC_APP_URL=https://app.example.com
# Optional (step 11): error reports to GlitchTip. Empty = off.
EXPO_PUBLIC_SENTRY_DSN=
EXPO_PUBLIC_APP_ENV=pilot
```

Restart the app, then check the whole flow:

1. **Create account** → open the confirmation email → **Sign in**.
2. **Create organization** (name + first branch). The home screen shows the branch, and the sync badge at the top shows **Up to date**.
3. Offline test: turn Wi-Fi off, go to Settings → Branches → **Add branch**. The sync badge shows **Offline · 1 waiting**. Turn Wi-Fi on: it goes back to **Up to date**, and the branch appears in Studio → Table editor → `branches`.
4. Settings → Staff → **Invite** a second email as Cashier for one branch. Sign in with that email on another device or browser: the invitation shows on the welcome screen; **Join** it. The cashier sees only that branch and no Staff or Branches settings.
5. As the owner: Settings → **Station types & prices** → add a type (e.g. PS5 Room, 4 players), a base price, a peak price (18:00–24:00, priority 10) and a 3-hour package. Then Settings → **Stations** → add 3 stations at once and put one in maintenance. The cashier sees the stations and the prices (read-only) and can't add stations.
6. Settings → **Price preview**: 17:00 to 19:30 should cost 1 hour at the base price plus 1.5 hours at the peak price.
7. **Live floor** (home screen): tap a free station → **Start session** (Open). The card turns blue and its timer and cost run. On the cashier's device the same station shows as playing within a few seconds. The station in maintenance can't be tapped.
8. Start a **Fixed time** session of 30 min on another station, then open it and **Add time** +15 min; change the players (if the type allows more than 1) and **Move** it to a free station. **End** it after confirming: the estimated bill lists each part.
9. Alerts: Settings → Account → **Session alerts** → allow notifications. Start a fixed session with a custom duration of 6 minutes: about a minute later you get "5 minutes left", then "time is up" (web/Windows: the app must be open; phones: works in the background).
10. As the cashier, open a running session: there is no **Cancel session** button (owners and managers only). Offline test: switch Wi-Fi off, start and end a session, switch it back on; the session appears in Studio → `sessions`.

Checkout (Phase 4) needs the `create-bill` Edge Function, so do **step 7b first**:

11. **End** a session: the app opens **Checkout** with the bill. "Number given after sync" changes to "Receipt #1" a few seconds later, and the bill appears in Studio → `bills` with the same total.
12. Take part of the bill by **Cash** (enter what the customer handed over to see the change), then the rest by **Instapay** with a reference. The bill shows **Paid**, and Studio → `payments` has both rows with your name in `received_by`.
13. As a manager: on a new bill, **Give a discount** (10 %) before taking payment; on a paid bill, **Refund** part of it with a reason; on another bill, **Void** it with a reason. Studio → `audit_log` lists each one. As the cashier, none of these buttons show.
14. **Print or share receipt**: web/Windows opens the print dialog (choose "Save as PDF" to keep a copy); phones open the share sheet with a PDF. Check it in Arabic too.
15. Offline test: switch Wi-Fi off, end a session and take a cash payment, switch it back on. The bill gets its number, and `payments` has the row. Ended sessions that aren't fully paid are listed under **Waiting for payment** on the floor.

Income (Phase 5) needs no new server parts: it is worked out on each device from the synced payments. After a few bills from items 11–15:

16. As the owner, tap **Income** on the floor: **Today** shows the total, the split by Cash / Visa / Instapay, by branch (with 2+ branches) and by station type, matching the payments in Studio → `payments` (refunds subtracted, void bills left out). Try **This week**, **This month** and a **Custom** range, and pick one branch.
17. As the cashier, tap **My shift**: only the payments they took themselves today, by method, with each payment listed. No other periods or branches. As a manager, only their branches show.

Reservations (Phase 6) need only the new migration (step 5; it turns on the `btree_gist` extension, which self-hosted Supabase ships). No new sync stream, setting or Edge Function:

18. As the cashier, tap **Calendar** on the floor, tap an empty slot on a station at a time later today, enter a name and **Book**. The block appears on the calendar, and in Studio → `sessions` with `kind = reservation`, `status = reserved`. Tap the block to select it, drag it to another time and to another station, and drag its end to make it longer; Studio follows. On a tablet or desktop, try the **Week** view.
19. Book the same station and time again: the app refuses it ("already booked"). **Double booking from two devices:** switch Wi-Fi off on two devices, book the same station and time on both, then switch Wi-Fi on. Only one reservation stays; the other device shows it under **Not saved** (floor and calendar) with **Book again**.
20. 30 minutes before a reservation, the station shows **Reserved soon** on the floor and the booking is listed under **Arrivals**. A walk-in that would run into it gets a warning. Open the reservation and **Check in**: it becomes a playing session that ends at the booked time (checkout as usual). If the station is still busy, use **Check in on another station**.
21. For a reservation nobody came to: **Mark as no-show** appears 15 minutes after the start (Studio: `status = no_show`). A cashier can cancel a reservation, but still can't cancel a running session.

Optional modules (Phase 7) need the new migration (step 5) **and** a PowerSync restart for the new sync streams (`customers`, `products`, `session_items`, `stock_movements`, `expenses`). No new setting or Edge Function; `create-bill` is unchanged (the database now adds the items and the customer discount to each bill). All three modules are on by default: Settings → Organization → **Optional modules**.

22. **Customers:** as the cashier, start a session and type a phone number in **Customer**: no match, so **Add as a new customer** (name + phone) and start. The customer appears under **Customers** on the floor, and in Studio → `customers` and on the session (`customer_id`). Book a reservation for the same customer by searching their name.
23. As a manager, open the customer and set a **Default discount** of 10 %. End a session for them: checkout shows **Customer discount (10%)** and the bill in Studio → `bills` has `discount_reason = customer:10`. As the cashier, the discount field is read-only.
24. **Snacks:** as the owner, open **Snacks & stock** → **Add product** (Cola, 15 EGP, count stock, warn at 5). As a manager, **Restock** 24 in this branch. As the cashier, add 2 colas to a running session: the bill so far goes up by 30 EGP and the stock shows 22. End the session: the bill in Studio → `bills` has `items_amount = 3000`. Add another cola at checkout: the total follows. A cashier can remove an item only while the session is running; a manager also after it ended, until a payment is taken.
25. **Count** the cola stock as a manager (enter what is on the shelf): the difference is saved as a correction. When stock is at or below the warning level, the floor shows **Snacks & stock (1 low)** and the product list warns.
26. **Expenses:** as a manager, open **Expenses** → **Add expense** (Electricity, 2,500 EGP, Instapay, today). It shows under **This month** by category; edit and delete one (Studio → `audit_log` lists each change). The cashier has no Expenses button and syncs no expenses. Then, as the owner, switch **Expenses** off in Settings → Organization: the button disappears everywhere and the data stays in Studio.

Advanced reports (Phase 8) need **no server changes**: no migration, sync stream, setting or Edge Function. Like income, they are worked out on each device from what it has synced. Only the web app (step 8), the Windows installer (step 9) and new phone builds (step 10: `expo-file-system` was added for CSV export) need updating.

27. As the owner, tap **Reports** on the floor (cashiers still see **My shift**). **Overview** shows income with the change against the previous period ("Yesterday", "Last week", "Last month"), **Net profit** (income − expenses, by category) when Expenses is on, and **Compare branches** (profit, income, expenses and usage per branch) with 2+ branches. Check the numbers against Studio → `payments` and `expenses`.
28. **Usage** shows the share of station time in use (whole day, up to now) per station type and per station, and **Busiest hours** (days × hours, darker = busier). Start a session on a free station and reopen: its station's usage goes up. **Customers** lists who paid the most (sessions linked to a customer); **Snacks & drinks** lists items sold per product. Switch a module off: its tab and its part of the export disappear.
29. **Export CSV** and **Export PDF**: on web/Windows the CSV downloads and the PDF opens the print dialog (choose "Save as PDF"); on a phone both open the share sheet. Open the CSV in Excel or Google Sheets: Arabic names read correctly and amounts are plain numbers in EGP. As a manager, only their branches appear.

Offline hardening (Phase 9) needs the new migration (step 5: `server_time()`, used by the clock check) and nothing else on the server. Phones need a new development build (step 10: the error-tracking SDK is native code). Backups (step 12) and error tracking (step 11) are set up separately.

30. **Sync badge:** at the top of the floor every device shows **Up to date**, **Syncing…**, **Offline** (with how many changes are waiting) or **Not uploading**. Tap it: the **Sync** page shows when this device last synced, what is waiting by kind (sessions, payments…), **Sync now**, the clock check, whether the browser keeps the local data, and how many rows this device holds.
31. **A full offline day** (do it once at the center before the pilot ends, on every kind of device used there): in the morning, sync every device, then unplug the internet router. Run the day as usual: walk-ins, a reservation check-in, moves and player changes, snacks, checkouts with cash, a discount by a manager, an expense. After an hour offline, the floor shows "offline since …". In the evening plug the router back in: within a minute every badge is back to **Up to date**, nothing is listed under **Not saved** except real conflicts (item 32), and the evening's income on the owner's phone matches the cash counted. Check Studio → `bills`: every session of the day has a bill with a number.
32. **Conflicts, two devices offline** (both on the same branch, both with Wi-Fi off): (a) start a walk-in on the same free station on both; (b) book the same slot on both; (c) take a payment for the same bill on both; (d) sell the last can of a drink on both. Turn Wi-Fi on. Expected: (a) one session stays, the other device lists **Walk-in session not saved** ("station busy") and its customer must be moved; (b) one booking stays, the other gets **Book again**; (c) both payments are kept (the bill shows paid too much: refund one); (d) both sales are kept and the stock shows −1 (count it later).
33. **Wrong clock:** set a device's clock 10 minutes off (turn off automatic time), sign in with internet: the floor shows "this device's clock is 10 min behind/ahead". Set automatic time again: the warning goes after the next check (reconnect or tap **Sync now**).
34. **Stuck uploads:** stop the functions container (`docker compose stop functions` in `~/myrooms/supabase`), end a session on a device: the badge turns **Not uploading** and the floor explains the bill service is down. Start the container again: the bill uploads and the badge goes back to **Up to date**.
35. **Error reports** (if step 11 is done): in GlitchTip, the MyRooms project shows events from each platform, with ids and roles only (no names, emails or phone numbers). A refused change from item 32 shows as a warning "Upload refused by the server".
36. **Backups:** after step 12, `ls ~/backups` shows last night's dump, and `sh ~/myrooms/app/deploy/backup/check.sh` ends with **restore check PASSED**.
37. **Quick setup** (Phase 10): sign up a new owner, create an organization: the floor shows **Setup checklist**. Tap **Quick setup**, enter 3 PlayStation rooms at 60 EGP and 5 PCs at 20 EGP, **Create stations and prices**: the floor shows Room 1–3 and PC 1–5, and Settings → Price preview gives 60 EGP for an hour in a room. The checklist ticks prices and stations; invite someone and it disappears (or tap **Hide this**).
38. **Delete my account:** (a) the only owner of an organization with a cashier: Settings → Account → **Delete my account** says to make someone else owner first; (b) a cashier deletes their account (type **DELETE**): they are signed out, can't sign in again, and the owner's Staff list no longer shows them, while their payments stay in the reports; (c) the owner of a test organization with no staff deletes their account: Studio shows the organization and its rows are gone. Needs step 7b's `delete-account`.
39. **Help links:** Settings → **User guide** and **Privacy policy** open the pages (`https://app.example.com/guide.html`, `privacy.html`) on the web, Windows (in the browser) and phones, in the app's language.
40. **Windows update** (after a release with step 9): install version N, publish N+1: within 6 hours (or at the next start) the floor shows **Version N+1 is available**; **Install and restart** updates and reopens the app, still signed in, with nothing lost.
41. **Store builds** (step 10): the production Android build installs from the Play internal test track and the iOS build from TestFlight; the app name shows as **ماي رومز** on a phone set to Arabic.

## 7b. Edge Functions (required for checkout)

Three functions run in Supabase's `functions` container:

- `create-bill` (**required** from Phase 4): when a session's bill uploads, it calculates the final bill on the server with the same pricing code as the app (`supabase/functions/_shared/domain`, a copy of `src/domain` made by `npm run domain:sync`) and saves it. Until it is deployed, a device's uploads stop at its first bill: that bill **and every change made after it** wait in the upload queue (the sync badge shows **Not uploading**, and the floor names the bill service). Nothing is lost: it all uploads once the function is there. Deploy it before staff start ending sessions.
- `invite-staff`: saves an invitation and emails people who don't have an account yet. Without it, invitations still work, but nobody is emailed (the app says so).
- `delete-account` (**required for the store releases**, Phase 10): **Settings → Account → Delete my account**. Removes the person from their organizations (deleting an organization where they are the only member, with all its data; refusing if they are the only owner of one with staff) and soft-deletes their sign-in (the email is scrubbed, records they made stay). Without it, the button shows an error.

```sh
# on the VPS
cd ~/myrooms/app && git pull
for f in _shared create-bill invite-staff delete-account; do
  rm -rf ~/myrooms/supabase/volumes/functions/$f
  cp -r supabase/functions/$f ~/myrooms/supabase/volumes/functions/
done
cd ~/myrooms/supabase && docker compose restart functions
```

`create-bill` uses the service role key that Supabase's setup already passes to the functions container (`SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY`). It never leaves the server.

Check: `docker compose logs functions` shows no errors after ending a session or sending an invite.

## 8. Publish the web app

Build on a PC with `.env.local` pointing at the VPS (step 7), then copy the files up:

```sh
npm run build:web                                  # → dist/
rsync -az --delete dist/ <user>@<vps-ip>:/var/www/myrooms/
```

Check: `https://app.example.com` loads the sign-in page; after signing in, the sync badge shows **Up to date**. The user guide and privacy policy are part of the export: `https://app.example.com/guide.html`, `guide-ar.html` and `privacy.html` (the stores link to the privacy page; fill in its `[COMPANY NAME]`, `[SUPPORT EMAIL]` and `[EFFECTIVE DATE]` first, in `public/privacy.html`).

## 9. Build the Windows app

- **Test builds:** `npm run desktop:build` locally (uses `.env.local`; set `EXPO_PUBLIC_APP_URL` so email links and the help pages open the web app), or the "Windows desktop build" workflow on pushes to `dev`/`main` (needs the `EXPO_PUBLIC_*` values as repository **Variables**). The installer is in `src-tauri/target/release/bundle/nsis/` or the run's artifacts. These builds never check for updates.
- If a local build fails with `windres`, see Troubleshooting in the main README.

### Releases with auto-update (Phase 10)

The Windows app checks `https://app.example.com/desktop/latest.json` at start and every 6 hours. When a newer version is there, the floor shows **Version x is available** with **Install and restart** (staff choose when). Updates are signed with a key of ours, so a tampered file is refused.

Once:

```sh
npx tauri signer generate -w myrooms-updater.key   # keep the .key file and its password in a password manager, never in git
# on the VPS: the folder Caddy serves at /desktop (block in caddy/Caddyfile.example, reload Caddy)
sudo mkdir -p /var/www/myrooms-desktop && sudo chown $USER /var/www/myrooms-desktop
```

GitHub → Settings → Secrets and variables → Actions:

- **Variables:** `MYROOMS_UPDATE_URL` = `https://app.example.com/desktop`, `TAURI_UPDATER_PUBKEY` = the contents of `myrooms-updater.key.pub`.
- **Secrets:** `TAURI_SIGNING_PRIVATE_KEY` (contents of `myrooms-updater.key`), `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; optional `VPS_SSH_KEY`, `VPS_HOST`, `VPS_USER` to upload automatically.

Each release:

```sh
npm run version:set -- 1.0.1 && npm install --package-lock-only   # package.json, app.json, Cargo.toml
git commit -am "Release 1.0.1" && git tag v1.0.1 && git push --follow-tags
```

The tag runs the workflow in release mode: it builds the signed installer, writes `latest.json`, uploads both as the `myrooms-windows-release` artifact and, with the SSH secrets, copies them to `/var/www/myrooms-desktop` (installer first, `latest.json` last). Without the SSH secrets, copy the artifact's files there yourself, `latest.json` last. Locally the same is `npm run desktop:release-config`, `npx tauri build --bundles nsis --config src-tauri/tauri.release.conf.json`, `npm run desktop:latest` (with the variables above in the environment).

The first release must be installed by hand (download the `-setup.exe`); every later one arrives by itself. The installer installs per user (no administrator rights), in English or Arabic.

### Code signing (removes the SmartScreen warning)

Without it Windows SmartScreen warns on install ("More info" → "Run anyway"); updates are still signed and safe. Two options, both set up once in GitHub:

- **A certificate file** (OV/EV code-signing certificate as `.pfx`): secrets `WINDOWS_CERTIFICATE` (the file in base64: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx"))`) and `WINDOWS_CERTIFICATE_PASSWORD`. Note that most certificates sold since 2023 live on a hardware token and can't be exported: then use the next option.
- **A cloud signing service** (e.g. Azure Artifact Signing): variable `WINDOWS_SIGN_COMMAND`, the command that signs one file with `%1` as the file path (see the service's Tauri instructions), plus its login secrets as environment variables of the release step.

Who pays for and owns the certificate is open question 6 for the client.

## 10. Build the Android and iOS apps

Uses EAS (Expo's build service, needs a free Expo account):

```sh
npx eas-cli login
npx eas-cli init                                   # links the project once
# Backend URLs for cloud builds (once per environment):
npx eas-cli env:create --environment development --name EXPO_PUBLIC_SUPABASE_URL --value https://api.example.com --visibility plaintext
npx eas-cli env:create --environment development --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <key> --visibility plaintext
npx eas-cli env:create --environment development --name EXPO_PUBLIC_POWERSYNC_URL --value https://sync.example.com --visibility plaintext
npx eas-cli build --profile development --platform android   # installable test build (APK)
npx eas-cli build --profile development --platform ios       # needs an Apple Developer account
```

Phase 3 added `expo-notifications`, Phase 4 added `expo-print` and `expo-sharing`, Phase 8 added `expo-file-system` and Phase 9 added `@sentry/react-native` (native code), so phones need a **new development build** after updating. For error reports, also add `EXPO_PUBLIC_SENTRY_DSN` (and `EXPO_PUBLIC_APP_ENV`) with `eas env:create` like the URLs above. `eas.json` sets `SENTRY_DISABLE_AUTO_UPLOAD=true`, so builds don't try to upload source maps (not set up). Only local notifications are used: no push keys (FCM/APNs) are needed.

### Store releases (Phase 10)

The checklist (accounts, Data safety / App Privacy answers, screenshots, review notes with a demo account, listing text in English and Arabic) is in [`docs/store/README.md`](../docs/store/README.md); listing text in `docs/store/listing.en.md` and `listing.ar.md`.

```sh
# production environment values, once (same names as above, plus EXPO_PUBLIC_APP_URL and EXPO_PUBLIC_SENTRY_DSN)
npx eas-cli env:create --environment production --name EXPO_PUBLIC_APP_URL --value https://app.example.com --visibility plaintext
npx eas-cli build --profile production --platform android     # app bundle (.aab); build numbers are counted by EAS
npx eas-cli build --profile production --platform ios
npx eas-cli submit --profile production --platform ios        # asks for the App Store Connect app the first time
npx eas-cli submit --profile production --platform android    # after the first upload by hand (below)
```

- **Google Play:** the very first `.aab` must be uploaded by hand in Play Console (Internal testing). Then create a service account with release rights, save its key as `google-service-account.json` in the repo root (in `.gitignore`, never commit it) and `eas submit` sends later builds to the internal track as drafts.
- **App Store:** `eas submit` uploads to TestFlight; submit for review in App Store Connect. `ITSAppUsesNonExemptEncryption` is false in `app.json` (only HTTPS), so no export compliance question per build.
- Deploy `delete-account` (step 7b) and publish the web app (step 8) **before** submitting: reviewers delete a test account and open the privacy policy.
- The app is called **MyRooms**, and **ماي رومز** on phones set to Arabic (`assets/locales`). Icons and splash come from `assets/images` (source: `assets/images/icon.svg`).

## 11. Error tracking (optional, GlitchTip)

The app reports crashes and refused uploads with the Sentry SDK. Instead of sentry.io, they go to **GlitchTip**, a small self-hosted tracker that speaks the same protocol (one container + its own Postgres, about 300–500 MB RAM). Reports never contain names, emails, phone numbers or notes: only ids, the role, the platform and the technical error (`src/lib/monitoring/scrub.ts`). Without a DSN, the app sends nothing.

```sh
# DNS: errors.example.com → the VPS. Then on the VPS:
cd ~/myrooms/app/deploy/glitchtip
cp .env.example .env              # domain, two random secrets (openssl rand -hex 32), SMTP or consolemail://
docker compose --env-file .env up -d
```

Add the `errors.example.com` block from `caddy/Caddyfile.example` and reload Caddy. Open `https://errors.example.com`, create the first account (sign-up then closes), an organization and a project of type **React Native**. Copy its **DSN** into `EXPO_PUBLIC_SENTRY_DSN` (step 7: `.env.local`, the GitHub Variables for the Windows build, and EAS for phones), then rebuild the web app (step 8), the Windows app (step 9) and the phone apps (step 10).

Check: the Sync page (tap the sync badge) says **Error reports: On**.

## 12. Backups

`backup/backup.sh` dumps the whole Supabase database (including accounts) every night, keeps 14 days on the VPS and can copy each dump off the VPS with rclone. `backup/check.sh` proves the newest dump restores (into a scratch database, comparing row counts) without touching the live data. PowerSync's own database is not backed up: it is rebuilt from Supabase.

```sh
# on the VPS, once
mkdir -p ~/backups
sh ~/myrooms/app/deploy/backup/backup.sh       # first dump now
sh ~/myrooms/app/deploy/backup/check.sh        # must end with "restore check PASSED"
crontab -e                                     # add the two lines below
15 3 * * * sh $HOME/myrooms/app/deploy/backup/backup.sh >> $HOME/backups/backup.log 2>&1
45 3 * * 0 sh $HOME/myrooms/app/deploy/backup/check.sh >> $HOME/backups/backup.log 2>&1
```

- **Off the VPS (recommended):** a backup on the same disk doesn't survive losing the VPS. Install rclone, create an **encrypted** remote (`rclone config`: e.g. Oracle Object Storage via its S3 API, wrapped in a `crypt` remote, because the dumps hold customer names and phones) and add `BACKUP_REMOTE=<remote>:myrooms-backups` in front of the backup command in cron.
- **Also keep** `~/myrooms/supabase/.env` and `deploy/powersync/.env` somewhere safe (a password manager): the dumps don't include them.
- **Restoring** (only after losing data): `sh ~/myrooms/app/deploy/backup/restore.sh ~/backups/myrooms-<date>.dump --yes`. It saves the current database first, stops PowerSync, restores, restarts Supabase and rebuilds PowerSync's copy. Everything written to the server after that backup is lost on the server; devices still offline upload their waiting changes when they reconnect. On a new server, set up steps 1–6 first (the `powersync_role` password is not in the dump).

## Updating

- **Sync rules** (`powersync/sync-config.yaml`): `git pull`, then `docker compose restart powersync`.
- **New migrations**: repeat step 5 (`supabase db push`). Then restart PowerSync if the sync config changed.
- **GlitchTip**: `docker compose pull && docker compose --env-file .env up -d` in `deploy/glitchtip`.
- **Edge Functions**: repeat step 7b (always after pulling a change to `src/domain`, since `create-bill` uses a copy of it).
- **Web app**: repeat step 8.
- **Windows app**: tag a release (step 9); installed apps update themselves.
- **Phones**: `eas build --profile production` then `eas submit` (step 10). Use the same version as the Windows app (`npm run version:set`).
- **Supabase version**: follow the official upgrade notes, using `sh run.sh` and `update.sh` in `~/myrooms/supabase`.
